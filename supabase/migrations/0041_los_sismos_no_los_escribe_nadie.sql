-- 0041 · Nadie con sesión puede escribir sismos.
--
-- Deuda 1.11. `anon` y `authenticated` tenían INSERT, UPDATE, DELETE y TRUNCATE
-- sobre `public.quake_events`. Vienen del `grant all` que Supabase aplica por
-- defecto a las tablas nuevas del esquema `public`, no de una decisión.
--
-- ## Por qué NO era un agujero abierto
--
-- RLS bloquea las tres primeras —no hay política de escritura sobre esta tabla—
-- y PostgREST no expone TRUNCATE, así que por la API no se llegaba. Esto no
-- arregla un fallo: quita un permiso que nunca tuvo razón de existir, para que
-- el día que alguien agregue una política de escritura por error no encuentre el
-- terreno preparado.
--
-- ## Por qué es seguro
--
-- Los tres únicos caminos que tocan la tabla, verificados antes de aplicar:
--
--   · el cliente hace SOLO `.select()`      (`src/lib/api.ts:698`, `fetchQuakeById`)
--   · la ingesta usa `service_role`         (`supabase/functions/ingest-quakes/index.ts:274`)
--   · el fan-out son funciones `security definer`, que corren como su dueño
--
-- Y sembrar un sismo de prueba desde el editor SQL sigue funcionando: eso corre
-- como `postgres`, que conserva todo.

revoke insert, update, delete, truncate on public.quake_events from anon, authenticated;

-- `select` se queda: leer los sismos es media app.
