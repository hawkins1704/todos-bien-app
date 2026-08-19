-- ============================================================================
-- 0006 · Endurecimiento tras correr los advisors de Supabase
--
-- 1. Postgres otorga EXECUTE a PUBLIC en toda función nueva, así que cada RPC
--    de `public` quedaba invocable por el rol `anon` vía /rest/v1/rpc/...
--    Las funciones ya validan auth.uid(), pero la superficie no debe existir.
--
-- 2. profiles y user_status tenían varias políticas permisivas de SELECT para
--    el mismo rol. Postgres evalúa TODAS en cada fila; se consolidan en una.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Solo usuarios autenticados pueden invocar los RPC
-- ---------------------------------------------------------------------------
revoke execute on function public.request_connection(uuid) from public, anon;
revoke execute on function public.respond_to_connection(uuid, boolean) from public, anon;
revoke execute on function public.create_invitation(text, text) from public, anon;
revoke execute on function public.redeem_invitation(text) from public, anon;
revoke execute on function public.get_circle() from public, anon;
revoke execute on function public.report_status(
  text, text, double precision, double precision, double precision,
  timestamptz, uuid, boolean, timestamptz
) from public, anon;
revoke execute on function public.distance_km(
  double precision, double precision, double precision, double precision
) from public, anon;
revoke execute on function public.get_or_create_direct_conversation(uuid) from public, anon;
revoke execute on function public.create_group_conversation(text, uuid[]) from public, anon;
revoke execute on function public.start_drill(text) from public, anon;
revoke execute on function public.complete_drill(uuid, text) from public, anon;

grant execute on function public.request_connection(uuid) to authenticated;
grant execute on function public.respond_to_connection(uuid, boolean) to authenticated;
grant execute on function public.create_invitation(text, text) to authenticated;
grant execute on function public.redeem_invitation(text) to authenticated;
grant execute on function public.get_circle() to authenticated;
grant execute on function public.report_status(
  text, text, double precision, double precision, double precision,
  timestamptz, uuid, boolean, timestamptz
) to authenticated;
grant execute on function public.distance_km(
  double precision, double precision, double precision, double precision
) to authenticated;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
grant execute on function public.create_group_conversation(text, uuid[]) to authenticated;
grant execute on function public.start_drill(text) to authenticated;
grant execute on function public.complete_drill(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Una sola política de SELECT por tabla
--
-- has_connection_with() cubre pendientes + aceptadas y es superconjunto de
-- is_connected(), así que reemplaza a las dos políticas anteriores de profiles.
-- user_status se mantiene más estricto: ubicación y estado solo para conexiones
-- ACEPTADAS, nunca para una solicitud todavía sin responder.
-- ---------------------------------------------------------------------------
drop policy profiles_select_own on public.profiles;
drop policy profiles_select_connected on public.profiles;
drop policy profiles_select_pending_party on public.profiles;

create policy profiles_select_visible on public.profiles
  for select to authenticated
  using (
    (select auth.uid()) = id
    or private.has_connection_with(id)
  );

drop policy user_status_select_own on public.user_status;
drop policy user_status_select_connected on public.user_status;

create policy user_status_select_visible on public.user_status
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or private.is_connected(user_id)
  );
