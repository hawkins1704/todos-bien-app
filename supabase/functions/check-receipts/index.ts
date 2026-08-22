import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * ¿El push llegó de verdad?
 *
 * Los dos senders anotan que Expo **aceptó** cada mensaje. Eso no es entrega:
 * con una credencial de APNs mal asignada el ticket sale `ok` igual, y el
 * fallo aparece recién en el *receipt*, que hay que pedir después con el
 * `ticket_id`.
 *
 *   send-alerts / send-notifications → push_receipts → [ESTA FUNCIÓN] → Expo
 *
 * Esto no es un camino de entrega sino de **auditoría**: nada de lo que pasa
 * acá hace que un aviso llegue. Lo que hace es que la pregunta "¿por qué no me
 * llegó?" tenga respuesta, que es lo que no tuvo el 2026-08-21 cuando hubo que
 * explicar por qué un sismo real no despertó ninguna app.
 *
 * También es donde de verdad se limpian los tokens muertos:
 * `DeviceNotRegistered` aparece mucho más en el receipt que en el ticket.
 *
 * ## Las dos ventanas, las dos de Expo
 *
 * - **15 minutos de piso.** Expo recomienda esperar ese rato antes de pedir un
 *   receipt; antes puede no existir todavía y se gasta el viaje.
 * - **24 horas de techo.** Después Expo los borra. Por eso el barrido corre
 *   cada 15 minutos y lo que pasa las 20 h se da por vencido (migración 0018).
 */

const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';

/** Expo acepta hasta 300 ids por request. */
const EXPO_BATCH = 300;

/** Cuántos lotes drena una corrida antes de devolver el control al cron. */
const MAX_ROUNDS = 5;

const FETCH_TIMEOUT_MS = 20_000;

type Receipt = { status: 'ok' | 'error'; message?: string; details?: { error?: string } };

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

async function fetchReceipts(ids: string[]): Promise<Record<string, Receipt>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(EXPO_RECEIPTS_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });

    if (!response.ok) throw new Error(`Expo HTTP ${response.status}`);

    const payload = await response.json();

    if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
      throw new Error(payload.errors.map((e: { message?: string }) => e.message).join(' | '));
    }

    return (payload?.data ?? {}) as Record<string, Receipt>;
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

  const summary = {
    revisados: 0,
    entregados: 0,
    fallados: 0,
    tokens_borrados: 0,
    rounds: 0,
    /** Los errores distintos que devolvió APNs/FCM, con su conteo. */
    errores: {} as Record<string, number>,
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const { data: pending, error: listError } = await admin.rpc('list_pending_receipts', {
      p_limit: EXPO_BATCH,
    });

    if (listError) return json({ error: 'list_failed', detail: listError.message }, 500);
    if (!pending || pending.length === 0) break;

    summary.rounds++;

    const ids = (pending as { ticket_id: string }[]).map((row) => row.ticket_id);

    let receipts: Record<string, Receipt>;
    try {
      receipts = await fetchReceipts(ids);
    } catch (caught) {
      // No se anota nada: las filas quedan sin revisar y el próximo ciclo lo
      // reintenta. Es auditoría, puede esperar 15 minutos.
      const message = caught instanceof Error ? caught.message : String(caught);
      return json({ error: 'expo_failed', detail: message, summary }, 500);
    }

    const rows = Object.entries(receipts).map(([ticketId, receipt]) => {
      const error = receipt.status === 'error'
        ? (receipt.details?.error ?? receipt.message ?? 'error')
        : null;

      if (error) summary.errores[error] = (summary.errores[error] ?? 0) + 1;

      return { ticket_id: ticketId, status: receipt.status, error };
    });

    if (rows.length === 0) break;

    const { data: applied, error: recordError } = await admin.rpc('record_push_receipts', {
      p_rows: rows,
    });

    if (recordError) return json({ error: 'record_failed', detail: recordError.message, summary }, 500);

    summary.revisados += rows.length;
    summary.entregados += rows.filter((r) => r.status === 'ok').length;
    summary.fallados += rows.filter((r) => r.status === 'error').length;
    summary.tokens_borrados += (applied as { tokens_borrados: number }[] | null)?.[0]
      ?.tokens_borrados ?? 0;

    // Lote incompleto: no queda nada más para revisar.
    if (pending.length < EXPO_BATCH) break;
  }

  return json({ ok: true, ...summary });
});
