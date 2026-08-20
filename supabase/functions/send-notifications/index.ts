import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Sender de avisos entre personas — el cartero de `notification_deliveries`.
 *
 * Hermano de `send-alerts`, y a propósito casi idéntico: reserva un lote, busca
 * los tokens, postea a Expo y cierra. Lo que cambia es de dónde sale el texto.
 *
 *   disparador → notification_deliveries → [ESTA FUNCIÓN] → Expo → APNs/FCM
 *
 * ## Dos diferencias con `send-alerts`, ambas deliberadas
 *
 * 1. **El texto ya viene escrito.** El aviso de sismo se arma acá desde
 *    `quake_events`, porque el sismo sigue igual cuando llega el momento de
 *    enviar. Un aviso de persona no: depende de un nombre y del cuerpo de un
 *    mensaje, que pueden cambiar o borrarse entre encolar y enviar. Por eso el
 *    texto se congela al encolar (migración 0015) y acá solo se transporta.
 *
 * 2. **Sin `contentAvailable`.** El push silencioso existe para que la app
 *    despierte y capture dónde estaba la persona durante un sismo. Un «te
 *    escribieron» no tiene nada que capturar: despertar la app por eso sería
 *    gastar batería a cambio de nada.
 *
 * La dispara un disparador de Postgres apenas hay algo encolado, y además un
 * cron cada 5 minutos como red de seguridad. El camino normal es el primero: el
 * cron solo existe para los reintentos y para lo que el aviso no haya
 * alcanzado.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo acepta hasta 100 mensajes por request. */
const EXPO_BATCH = 100;

/** Cuántos lotes drena una corrida antes de devolver el control. */
const MAX_ROUNDS = 5;

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Cuánto puede sobrevivir el aviso en la cola de Apple/Google.
 *
 * Una hora, contra la media hora de las alertas de sismo. Un «te escribieron»
 * que llega 40 minutos tarde sigue teniendo sentido; una alerta de sismo, no.
 */
const TTL_SECONDS = 3600;

type Delivery = {
  delivery_id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  channel: string;
};

type Ticket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function postToExpo(messages: unknown[]): Promise<Ticket[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);

    const payload = await response.json();

    // Error de request entero (cuota, formato). No hay tickets por mensaje.
    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors.map((e: { message?: string }) => e.message).join(' | '));
    }

    const tickets = payload?.data;
    if (!Array.isArray(tickets)) throw new Error('Expo devolvió una respuesta inesperada');

    return tickets as Ticket[];
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req: Request) => {
  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  // Mismo secreto que `send-alerts`: los dos los despierta el mismo Postgres, y
  // un segundo secreto sería una llave más que rotar sin ganar nada.
  const provided = req.headers.get('x-sender-secret');
  const { data: expected, error: secretError } = await admin.rpc('get_alert_sender_secret');

  if (secretError) return json({ error: 'secret_unavailable', detail: secretError.message }, 500);
  if (!provided || !expected || !secretsMatch(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const summary = { claimed: 0, sent: 0, no_token: 0, failed: 0, rounds: 0 };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: deliveries, error: claimError } = await admin.rpc(
      'claim_notification_deliveries',
      { p_limit: EXPO_BATCH },
    );

    if (claimError) return json({ error: 'claim_failed', detail: claimError.message }, 500);
    if (!deliveries || deliveries.length === 0) break;

    summary.rounds++;
    summary.claimed += deliveries.length;

    const rows = deliveries as Delivery[];

    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', [...new Set(rows.map((r) => r.user_id))]);

    if (tokenError) {
      await admin.rpc('mark_notification_deliveries', {
        p_failed: rows.map((r) => r.delivery_id),
        p_error: `no se pudieron leer los tokens: ${tokenError.message}`,
      });
      return json({ error: 'tokens_failed', detail: tokenError.message, summary }, 500);
    }

    const byUser = new Map<string, string[]>();
    for (const row of (tokenRows ?? []) as { user_id: string; token: string }[]) {
      const list = byUser.get(row.user_id);
      if (list) list.push(row.token);
      else byUser.set(row.user_id, [row.token]);
    }

    // Quien no tiene dispositivo registrado no es un fallo que reintentar: no
    // hay a dónde mandar. Se cierra como 'no_token'.
    const noToken = rows.filter((r) => !byUser.has(r.user_id)).map((r) => r.delivery_id);
    const sendable = rows.filter((r) => byUser.has(r.user_id));

    const messages: unknown[] = [];
    // Paralelo a `messages`: permite mapear cada ticket de vuelta a su aviso.
    const origin: { deliveryId: string; token: string }[] = [];

    for (const delivery of sendable) {
      for (const token of byUser.get(delivery.user_id)!) {
        messages.push({
          to: token,
          title: delivery.title,
          body: delivery.body,
          sound: 'default',
          // Solo «necesita ayuda» y «no responde» viajan por el canal urgente;
          // el resto no justifica saltarse el modo de concentración de nadie.
          priority: delivery.channel === 'alerts' ? 'high' : 'normal',
          channelId: delivery.channel,
          ttl: TTL_SECONDS,
          data: { ...(delivery.data ?? {}), kind: delivery.kind },
        });
        origin.push({ deliveryId: delivery.delivery_id, token });
      }
    }

    // Un aviso se da por entregado si **alguno** de los dispositivos lo aceptó.
    const okByDelivery = new Map<string, boolean>();
    const errorByDelivery = new Map<string, string>();
    const deadTokens: string[] = [];

    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      const chunk = messages.slice(i, i + EXPO_BATCH);
      const chunkOrigin = origin.slice(i, i + EXPO_BATCH);

      let tickets: Ticket[];
      try {
        tickets = await postToExpo(chunk);
      } catch (caught) {
        // Se cayó el lote entero: vuelven a 'pending' para el próximo ciclo.
        const message = caught instanceof Error ? caught.message : String(caught);
        for (const { deliveryId } of chunkOrigin) {
          if (!okByDelivery.get(deliveryId)) errorByDelivery.set(deliveryId, message);
        }
        continue;
      }

      tickets.forEach((ticket, index) => {
        const { deliveryId, token } = chunkOrigin[index];

        if (ticket.status === 'ok') {
          okByDelivery.set(deliveryId, true);
          return;
        }

        if (!okByDelivery.get(deliveryId)) {
          errorByDelivery.set(deliveryId, ticket.details?.error ?? ticket.message ?? 'error');
        }

        // El dispositivo desinstaló la app o revocó el permiso: el token está
        // muerto y va a fallar siempre.
        if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(token);
      });
    }

    if (deadTokens.length > 0) {
      await admin.from('push_tokens').delete().in('token', deadTokens);
    }

    const sent = [...okByDelivery.keys()];
    const failed = [...errorByDelivery.keys()].filter((id) => !okByDelivery.has(id));

    const { error: markError } = await admin.rpc('mark_notification_deliveries', {
      p_sent: sent,
      p_no_token: noToken,
      p_failed: failed,
      p_error: failed.length > 0 ? (errorByDelivery.get(failed[0]) ?? null) : null,
    });

    // Si esto falla, el lote queda en 'sending'. No se pierde: el rescate de
    // `claim_notification_deliveries` lo devuelve a la fila a los 5 minutos.
    if (markError) return json({ error: 'mark_failed', detail: markError.message, summary }, 500);

    summary.sent += sent.length;
    summary.no_token += noToken.length;
    summary.failed += failed.length;

    // Lote incompleto: no queda nada más.
    if (rows.length < EXPO_BATCH) break;
  }

  return json({ ok: true, ...summary });
});
