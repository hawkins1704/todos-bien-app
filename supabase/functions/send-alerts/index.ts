import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Sender de alertas de sismo — el cartero de la cola `alert_deliveries`.
 *
 * La migración 0010 dejó la cola llenándose sola: una fila por (sismo, usuario)
 * a quien le aplica la regla de disparo. Esta función es la que finalmente
 * despierta el teléfono.
 *
 *   ingesta → fan-out → alert_deliveries → [ESTA FUNCIÓN] → Expo → APNs/FCM
 *
 * La dispara pg_cron cada minuto (migración 0014), autenticada con un secreto
 * compartido en Vault, igual que `ingest-quakes`.
 *
 * ## Un push que hace dos trabajos
 *
 * El mensaje lleva contenido visible **y** `contentAvailable` (spec §7, §3.2):
 *
 * - Visible: "Sismo de magnitud 6,2" — es lo que la persona ve.
 * - Silencioso: despierta la app unos segundos en segundo plano para que
 *   capture **dónde estaba en ese momento**, que es la promesa central de la
 *   app. Sin esto, la ubicación que se guarda es dónde está cuando abre la app
 *   —a la mañana siguiente, quizá— y la respuesta sería falsa.
 *
 * La tarea de background que responde a esa parte todavía no existe del lado
 * del cliente; mandarlo igual es inocuo y evita tener que tocar el servidor
 * cuando se agregue.
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo acepta hasta 100 mensajes por request. */
const EXPO_BATCH = 100;

/** Cuántos lotes drena una corrida antes de devolver el control al cron. */
const MAX_ROUNDS = 5;

const FETCH_TIMEOUT_MS = 20_000;

/**
 * Cuánto puede sobrevivir el aviso en la cola de Apple/Google.
 *
 * Corto a propósito. Un aviso de sismo que se entrega una hora tarde no solo es
 * inútil: dispara la captura de ubicación y guardaría "dónde estaba durante el
 * sismo" siendo mentira. Es la misma razón por la que la cola expira lo viejo.
 */
const TTL_SECONDS = 1800;

type Delivery = {
  delivery_id: string;
  user_id: string;
  quake_event_id: string;
  magnitude: number | string;
  place: string | null;
  region: string | null;
  occurred_at: string;
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

/**
 * El texto que ve la persona.
 *
 * Español latino neutro, sin voseo (§1.10). La coma decimal no es un detalle
 * cosmético: "6.2" se lee como otra cosa en español.
 */
function buildMessage(d: Delivery): { title: string; body: string } {
  const magnitude = Number(d.magnitude).toFixed(1).replace('.', ',');
  const lugar = d.place?.trim() || d.region?.trim() || null;

  return {
    title: `Sismo de magnitud ${magnitude}`,
    body: lugar
      ? `${lugar}. Avisa a tu círculo que estás bien.`
      : 'Cerca de tu zona. Avisa a tu círculo que estás bien.',
  };
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

  const provided = req.headers.get('x-sender-secret');
  const { data: expected, error: secretError } = await admin.rpc('get_alert_sender_secret');

  if (secretError) return json({ error: 'secret_unavailable', detail: secretError.message }, 500);
  if (!provided || !expected || !secretsMatch(provided, expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  const summary = { claimed: 0, sent: 0, no_token: 0, failed: 0, rounds: 0 };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: deliveries, error: claimError } = await admin.rpc('claim_alert_deliveries', {
      p_limit: EXPO_BATCH,
    });

    if (claimError) return json({ error: 'claim_failed', detail: claimError.message }, 500);
    if (!deliveries || deliveries.length === 0) break;

    summary.rounds++;
    summary.claimed += deliveries.length;

    const rows = deliveries as Delivery[];

    // Un usuario puede tener varios dispositivos, así que de acá salen más
    // mensajes que avisos.
    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('user_id, token')
      .in('user_id', [...new Set(rows.map((r) => r.user_id))]);

    if (tokenError) {
      await admin.rpc('mark_alert_deliveries', {
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

    // Quien no tiene ningún dispositivo registrado no es un fallo que haya que
    // reintentar: no hay a dónde mandar. Se cierra como 'no_token'.
    const noToken = rows.filter((r) => !byUser.has(r.user_id)).map((r) => r.delivery_id);
    const sendable = rows.filter((r) => byUser.has(r.user_id));

    const messages: unknown[] = [];
    // Paralelo a `messages`: permite mapear cada ticket de vuelta a su aviso.
    const origin: { deliveryId: string; token: string }[] = [];

    for (const delivery of sendable) {
      const { title, body } = buildMessage(delivery);

      for (const token of byUser.get(delivery.user_id)!) {
        messages.push({
          to: token,
          title,
          body,
          sound: 'default',
          priority: 'high',
          // Tiene que existir en el cliente antes de que llegue el mensaje;
          // `ensureAndroidChannels()` los crea al pedir el permiso.
          channelId: 'alerts',
          ttl: TTL_SECONDS,
          contentAvailable: true,
          data: { type: 'quake_alert', quakeEventId: delivery.quake_event_id },
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
        // muerto y va a fallar siempre. Se borra o la tabla se llena de basura
        // y cada envío futuro paga el costo.
        if (ticket.details?.error === 'DeviceNotRegistered') deadTokens.push(token);
      });
    }

    if (deadTokens.length > 0) {
      await admin.from('push_tokens').delete().in('token', deadTokens);
    }

    // Un aviso que falló en un dispositivo pero entró en otro cuenta como
    // entregado: la persona ya está avisada.
    const sent = [...okByDelivery.keys()];
    const failed = [...errorByDelivery.keys()].filter((id) => !okByDelivery.has(id));

    const { error: markError } = await admin.rpc('mark_alert_deliveries', {
      p_sent: sent,
      p_no_token: noToken,
      p_failed: failed,
      p_error: failed.length > 0 ? (errorByDelivery.get(failed[0]) ?? null) : null,
    });

    // Si esto falla, el lote queda en 'sending'. No se pierde: el rescate de
    // `claim_alert_deliveries` lo devuelve a la fila a los 5 minutos.
    if (markError) return json({ error: 'mark_failed', detail: markError.message, summary }, 500);

    summary.sent += sent.length;
    summary.no_token += noToken.length;
    summary.failed += failed.length;

    // Lote incompleto: no queda nada más para hoy.
    if (rows.length < EXPO_BATCH) break;
  }

  return json({ ok: true, ...summary });
});
