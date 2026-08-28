import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Compara hashes de teléfonos contra los números ya registrados (spec §3, paso 3).
 *
 * El cliente manda SOLO hashes SHA-256 calculados en el dispositivo; la agenda
 * en texto plano nunca llega acá. La función necesita el service role porque
 * tiene que mirar `user_settings` de terceros, que RLS bloquea a propósito.
 *
 * Devuelve únicamente los matches, con el estado de conexión que ya exista con
 * quien pregunta, para que el cliente sepa a quién puede mandarle solicitud.
 */

const MAX_HASHES = 2000;

/**
 * Cuántos hashes entran en UNA consulta a PostgREST.
 *
 * `.in()` no manda la lista en el cuerpo: la mete entera en el query string, y
 * cada hash son 64 caracteres hex más la coma. Con una agenda real eso arma una
 * URL de decenas de KB y la petición **ni siquiera sale**: el cliente HTTP de
 * Deno corta con `TypeError: error sending request` y la función devuelve 500.
 *
 * Medido contra este proyecto: 200 hashes (~13 KB) pasa, 240 (~15,6 KB) ya
 * falla. O sea que el techo está cerca de los 16 KB de cabecera. Se usan 100
 * (~6,5 KB) para dejar margen: es un límite de infraestructura que nadie
 * garantiza por escrito y que puede bajar sin avisar.
 *
 * Este era el bug: cualquiera con más de ~230 números en la agenda —o sea casi
 * cualquiera— veía "No pudimos revisar tu agenda", y con 50 contactos de prueba
 * no se reproducía nunca.
 */
const HASHES_PER_QUERY = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'missing_authorization' }, 401);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: userError,
  } = await caller.auth.getUser();

  if (userError || !user) return json({ error: 'unauthorized' }, 401);

  let hashes: unknown;
  try {
    ({ hashes } = await req.json());
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!Array.isArray(hashes)) return json({ error: 'hashes_must_be_array' }, 400);

  // Solo hex de 64 caracteres: descarta basura antes de tocar la base.
  const clean = Array.from(
    new Set(
      hashes.filter((h): h is string => typeof h === 'string' && /^[0-9a-f]{64}$/.test(h)),
    ),
  ).slice(0, MAX_HASHES);

  if (clean.length === 0) return json({ matches: [] });

  const admin = createClient(url, serviceKey);

  const pages = await Promise.all(
    chunk(clean, HASHES_PER_QUERY).map((group) =>
      admin.from('user_settings').select('user_id, phone_hash').in('phone_hash', group),
    ),
  );

  const failed = pages.find((page) => page.error);
  if (failed?.error) return json({ error: failed.error.message }, 500);

  const settings = pages.flatMap((page) => page.data ?? []);

  const matched = settings.filter((s) => s.user_id !== user.id);
  if (matched.length === 0) return json({ matches: [] });

  const ids = matched.map((s) => s.user_id);

  const [{ data: profiles, error: profilesError }, { data: connections, error: connectionsError }] =
    await Promise.all([
      // Sin `avatar_url`: la app no tiene foto de perfil, el avatar es de
      // iniciales. Devolverlo era mandar un campo que nadie lee.
      admin.from('profiles').select('id, display_name').in('id', ids),
      admin
        .from('connections')
        .select('user_a, user_b, status, blocked_by')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    ]);

  if (profilesError) return json({ error: profilesError.message }, 500);
  if (connectionsError) return json({ error: connectionsError.message }, 500);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const connectionByOther = new Map<string, string>();

  /**
   * A quién bloqueó **quien está preguntando**, y solo eso.
   *
   * `blocked_by` NUNCA sale de acá tal cual, y es deliberado: el estado
   * `'blocked'` es el mismo para los dos lados, así que devolverlo sin más le
   * diría a la persona bloqueada que la bloquearon. Un bloqueo que se anuncia
   * no protege de nada — invita a buscar otra vía.
   *
   * Este conjunto solo puede contener a alguien si el que consulta es el que
   * bloqueó, así que decírselo no le revela nada que no sepa; le recuerda algo
   * que hizo. Del otro lado el campo llega en `false` y la pantalla los agrupa
   * con el resto de "no se puede agregar", sin dar razón.
   */
  const bloqueadosPorMi = new Set<string>();

  for (const c of connections ?? []) {
    const other = c.user_a === user.id ? c.user_b : c.user_a;
    connectionByOther.set(other, c.status);
    if (c.status === 'blocked' && c.blocked_by === user.id) bloqueadosPorMi.add(other);
  }

  const matches = matched
    .map((s) => {
      const profile = profileById.get(s.user_id);
      if (!profile) return null;
      return {
        user_id: s.user_id,
        phone_hash: s.phone_hash,
        display_name: profile.display_name,
        connection_status: connectionByOther.get(s.user_id) ?? null,
        blocked_by_me: bloqueadosPorMi.has(s.user_id),
      };
    })
    .filter((m) => m !== null);

  return json({ matches });
});
