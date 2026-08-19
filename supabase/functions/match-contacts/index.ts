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

  const { data: settings, error: settingsError } = await admin
    .from('user_settings')
    .select('user_id, phone_hash')
    .in('phone_hash', clean);

  if (settingsError) return json({ error: settingsError.message }, 500);

  const matched = (settings ?? []).filter((s) => s.user_id !== user.id);
  if (matched.length === 0) return json({ matches: [] });

  const ids = matched.map((s) => s.user_id);

  const [{ data: profiles, error: profilesError }, { data: connections, error: connectionsError }] =
    await Promise.all([
      admin.from('profiles').select('id, display_name, avatar_url').in('id', ids),
      admin
        .from('connections')
        .select('user_a, user_b, status')
        .or(`user_a.eq.${user.id},user_b.eq.${user.id}`),
    ]);

  if (profilesError) return json({ error: profilesError.message }, 500);
  if (connectionsError) return json({ error: connectionsError.message }, 500);

  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));

  const connectionByOther = new Map<string, string>();
  for (const c of connections ?? []) {
    const other = c.user_a === user.id ? c.user_b : c.user_a;
    connectionByOther.set(other, c.status);
  }

  const matches = matched
    .map((s) => {
      const profile = profileById.get(s.user_id);
      if (!profile) return null;
      return {
        user_id: s.user_id,
        phone_hash: s.phone_hash,
        display_name: profile.display_name,
        avatar_url: profile.avatar_url,
        connection_status: connectionByOther.get(s.user_id) ?? null,
      };
    })
    .filter((m) => m !== null);

  return json({ matches });
});
