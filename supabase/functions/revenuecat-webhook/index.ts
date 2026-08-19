import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Webhook de RevenueCat — el único lugar que otorga o quita Premium.
 *
 * `user_settings.is_premium` está fuera del grant de UPDATE de `authenticated`
 * (migración 0001) y `alert_worldwide_enabled` también (0009). Ninguna app
 * puede escribirlos: los escribe esta función con service role, y solo cuando
 * RevenueCat confirma que la tienda cobró.
 *
 * ⚠️ Se despliega con `--no-verify-jwt`. RevenueCat no puede firmar un JWT de
 * Supabase; en su lugar manda un header `Authorization` con un valor fijo que
 * configuramos nosotros. Si Supabase validara el JWT, rechazaría el pedido
 * antes de que esta función pudiera comparar el secreto.
 *
 *   supabase functions deploy revenuecat-webhook --no-verify-jwt
 *
 * El secreto se genera en la migración 0012 y vive en Vault:
 *
 *   select public.get_revenuecat_secret();
 *
 * Ese valor se pega en RevenueCat → Integrations → Webhooks → Authorization
 * header.
 */

/** Forma de un `user_id` de Supabase, para descartar los ids anónimos del SDK. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Eventos que significan "esta persona tiene acceso ahora".
 *
 * `NON_RENEWING_PURCHASE` es el plan de por vida: compra no consumible, sin
 * fecha de vencimiento. `TEMPORARY_ENTITLEMENT_GRANT` lo manda RevenueCat
 * cuando la tienda está caída y decide dar acceso mientras tanto.
 */
const GRANT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'PURCHASE_REDEEMED',
  'REFUND_REVERSED',
]);

/**
 * Eventos que significan "se acabó el acceso".
 *
 * `CANCELLATION` NO está acá y no es un olvido: cancelar significa "no se va a
 * renovar", no "se terminó ahora". Quien cancela a mitad de mes conserva el
 * beneficio hasta que llega el `EXPIRATION`. Quitárselo antes sería cobrarle un
 * mes y no dárselo. El caso del reembolso, que sí termina el acceso al
 * instante, se detecta por la fecha de vencimiento vencida.
 *
 * `BILLING_ISSUE` tampoco: es un cobro que falló y la tienda va a reintentar
 * durante el período de gracia. Si nunca prospera, llega el `EXPIRATION`.
 */
const REVOKE_EVENTS = new Set(['EXPIRATION', 'SUBSCRIPTION_PAUSED']);

type Decision = { userIds: string[]; premium: boolean };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Comparación de largo constante: no filtra el secreto por tiempo de respuesta. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * De qué usuarios nuestros habla el evento.
 *
 * La app llama a `Purchases.logIn(userId)` con el UUID de Supabase, así que el
 * `app_user_id` normalmente ya es ese UUID. Pero un mismo cliente puede tener
 * varios ids en RevenueCat (los `aliases`): el anónimo que el SDK crea antes de
 * que haya sesión, y el nuestro. Se miran todos y se filtran a los que tienen
 * forma de UUID; `$RCAnonymousID:...` queda descartado solo.
 */
function userIdsFrom(...candidates: unknown[]): string[] {
  const ids = new Set<string>();

  for (const candidate of candidates.flat()) {
    if (typeof candidate === 'string' && UUID_RE.test(candidate)) {
      ids.add(candidate.toLowerCase());
    }
  }

  return [...ids];
}

/**
 * Traduce el evento a "a quién y qué".
 *
 * Devuelve una lista porque `TRANSFER` es el único evento que hace las dos
 * cosas a la vez: le saca el beneficio a un usuario y se lo da a otro (pasa
 * cuando alguien usa el mismo ID de Apple en dos cuentas de la app).
 */
// deno-lint-ignore no-explicit-any
function decide(event: any): { decisions: Decision[]; outcome: string } {
  const type = String(event?.type ?? '');

  if (type === 'TRANSFER') {
    const from = userIdsFrom(event?.transferred_from);
    const to = userIdsFrom(event?.transferred_to);
    const decisions: Decision[] = [];

    if (from.length) decisions.push({ userIds: from, premium: false });
    if (to.length) decisions.push({ userIds: to, premium: true });

    return { decisions, outcome: decisions.length ? 'transfer' : 'unmapped' };
  }

  const userIds = userIdsFrom(event?.app_user_id, event?.original_app_user_id, event?.aliases);
  if (userIds.length === 0) return { decisions: [], outcome: 'unmapped' };

  // Una fecha de vencimiento ya pasada gana sobre el tipo de evento. Es lo que
  // distingue un reembolso (llega como CANCELLATION con el vencimiento movido
  // al pasado) de una cancelación común.
  const expiration = typeof event?.expiration_at_ms === 'number' ? event.expiration_at_ms : null;
  const alreadyExpired = expiration !== null && expiration <= Date.now();

  if (REVOKE_EVENTS.has(type) || (alreadyExpired && type === 'CANCELLATION')) {
    return { decisions: [{ userIds, premium: false }], outcome: 'revoke' };
  }

  if (GRANT_EVENTS.has(type)) {
    if (alreadyExpired) return { decisions: [{ userIds, premium: false }], outcome: 'revoke' };
    return { decisions: [{ userIds, premium: true }], outcome: 'grant' };
  }

  // CANCELLATION vigente, BILLING_ISSUE, TEST, eventos de paywall y todo lo que
  // RevenueCat agregue en el futuro: se registran, no cambian el acceso.
  return { decisions: [], outcome: 'ignored' };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, serviceKey);

  const { data: expected, error: secretError } = await admin.rpc('get_revenuecat_secret');
  if (secretError) return json({ error: 'secret_unavailable', detail: secretError.message }, 500);
  if (!expected) return json({ error: 'secret_missing' }, 500);

  // RevenueCat manda el valor tal cual se escribió en el dashboard, sin prefijo
  // `Bearer`. Se acepta también un header propio por si el campo Authorization
  // se usa para otra cosa.
  const provided = req.headers.get('authorization') ?? req.headers.get('x-revenuecat-secret') ?? '';
  if (!secretsMatch(provided.replace(/^Bearer\s+/i, ''), expected)) {
    return json({ error: 'unauthorized' }, 401);
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const event = body?.event;
  if (!event || typeof event !== 'object') return json({ error: 'missing_event' }, 400);

  // El id del evento es la clave de idempotencia. Si algún día faltara, se
  // arma uno estable con lo que identifica al evento: mejor un candado
  // aproximado que ninguno.
  const eventId =
    typeof event.id === 'string' && event.id
      ? event.id
      : `${event.type}:${event.app_user_id}:${event.event_timestamp_ms ?? ''}`;

  const { data: seen } = await admin
    .from('revenuecat_events')
    .select('event_id')
    .eq('event_id', eventId)
    .maybeSingle();

  // Reintento de RevenueCat sobre un evento ya aplicado. Hay que responder 200:
  // un error lo haría reintentar otras cuatro veces para nada.
  if (seen) return json({ skipped: 'duplicate', event_id: eventId });

  const { decisions, outcome } = decide(event);
  const affected: string[] = [];

  for (const decision of decisions) {
    const { data, error } = await admin
      .from('user_settings')
      // Los dos campos van juntos: las alertas mundiales son el beneficio
      // premium que se resuelve del lado del servidor (spec §12), y `is_premium`
      // por sí solo no las activa.
      .update({ is_premium: decision.premium, alert_worldwide_enabled: decision.premium })
      .in('user_id', decision.userIds)
      .select('user_id');

    // Se corta con 500 para que RevenueCat reintente: el evento todavía no se
    // registró, así que el reintento lo va a reprocesar entero.
    if (error) return json({ error: 'update_failed', detail: error.message }, 500);

    affected.push(...(data ?? []).map((row: { user_id: string }) => row.user_id));
  }

  const { error: logError } = await admin.from('revenuecat_events').insert({
    event_id: eventId,
    type: String(event.type ?? 'UNKNOWN'),
    app_user_id: typeof event.app_user_id === 'string' ? event.app_user_id : null,
    environment: typeof event.environment === 'string' ? event.environment : null,
    // Si el evento apuntaba a usuarios pero ninguna fila cambió, el id no existe
    // en esta base. Pasa con los eventos de prueba del dashboard y con los
    // sandbox de otro entorno.
    outcome: decisions.length > 0 && affected.length === 0 ? 'unmapped' : outcome,
    affected_user_ids: affected,
    payload: body,
  });

  // La escritura de permisos ya ocurrió: fallar acá solo perdería la bitácora,
  // y un 500 haría reaplicar todo. Se responde 200 y se deja rastro en los logs.
  if (logError) console.error('[revenuecat] no se pudo registrar el evento', logError.message);

  return json({ ok: true, event_id: eventId, outcome, affected: affected.length });
});
