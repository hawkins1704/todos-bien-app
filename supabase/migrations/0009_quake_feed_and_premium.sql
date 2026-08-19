-- ============================================================================
-- 0009 · Noticias Sísmicas + cierre de la fuga premium
--
-- Dos cosas relacionadas:
--
-- 1. El feed informativo de la nueva pestaña (Nacional / Global).
-- 2. Un agujero que existía desde antes: las alertas mundiales, que la spec §12
--    define como premium, NO validaban `is_premium` en ningún lado. Peor:
--    `authenticated` tenía permiso de UPDATE sobre `alert_worldwide_enabled`,
--    así que cualquier usuario gratis podía activárselas solo. Como la pestaña
--    Global reutiliza ese mismo beneficio, se cierra acá.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Solo el service role decide quién es premium
--
-- `is_premium` ya estaba fuera del grant de UPDATE (lo escribirá RevenueCat vía
-- webhook). Faltaba sacar el interruptor que dependía de él.
-- ---------------------------------------------------------------------------
revoke update (alert_worldwide_enabled) on public.user_settings from authenticated;

comment on column public.user_settings.alert_worldwide_enabled is
  'Alertas de sismos fuera del país (spec §12: premium). Solo lo escribe el service role, junto con is_premium. El usuario no puede activárselo por su cuenta.';

-- ---------------------------------------------------------------------------
-- 2 · La alerta mundial ahora exige premium de verdad
--
-- Se reemplaza la condición `me.alert_worldwide_enabled` por
-- `me.is_premium and me.alert_worldwide_enabled`: aunque el flag quedara en
-- true por cualquier motivo, sin premium no dispara.
-- ---------------------------------------------------------------------------
create or replace function public.get_active_alert()
returns setof public.quake_events
language sql
stable
security invoker
set search_path = ''
as $$
  with me as (
    select
      s.alert_radius_km,
      s.alert_min_magnitude,
      s.alert_countrywide_magnitude,
      s.alert_worldwide_enabled,
      s.is_premium,
      s.country_code,
      st.latitude as my_lat,
      st.longitude as my_lon
    from public.user_settings s
    left join public.user_status st on st.user_id = s.user_id
    where s.user_id = (select auth.uid())
  ),
  relevante as (
    select q.id, q.canonical_id, q.occurred_at
    from public.quake_events q, me
    where q.occurred_at > now() - interval '6 hours'
      and (
        -- Premium: sismos grandes en cualquier parte del mundo (spec §12).
        (me.is_premium and me.alert_worldwide_enabled
          and q.magnitude >= me.alert_countrywide_magnitude)
        -- Regla 2: magnitud alta en el país, sin importar el radio.
        or (q.country_code = me.country_code and q.magnitude >= me.alert_countrywide_magnitude)
        -- Regla 1: magnitud sobre el umbral dentro del radio configurado.
        or (
          me.my_lat is not null
          and q.magnitude >= me.alert_min_magnitude
          and public.distance_km(me.my_lat, me.my_lon, q.latitude, q.longitude)
              <= me.alert_radius_km
        )
      )
    order by q.occurred_at desc
    limit 1
  )
  select c.*
  from relevante r
  join public.quake_events c on c.id = coalesce(r.canonical_id, r.id);
$$;

revoke execute on function public.get_active_alert() from public, anon;
grant execute on function public.get_active_alert() to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · get_quake_feed · la lista de la pestaña Noticias Sísmicas
--
-- 'nacional' → sismos en Perú de los últimos 7 días, SIN piso de magnitud.
--              Gratis. Volumen bajo (~2,4/día verificado sobre datos reales).
-- 'global'   → sismos del mundo de los últimos 7 días con magnitud >= 4.5.
--              Premium. ~143/semana (~20/día) medido contra el feed real.
--
-- Devuelve solo eventos canónicos, así que un mismo sismo reportado por IGP y
-- USGS aparece UNA vez en la lista, no dos.
--
-- Nota honesta sobre el bloqueo premium: los datos del USGS son públicos, así
-- que esto no es un secreto criptográfico. Es la puerta por la que entra la
-- app, y respetarla del lado del servidor evita que baste con tocar una
-- variable en el cliente para saltearla.
-- ---------------------------------------------------------------------------
create or replace function public.get_quake_feed(scope text)
returns setof public.quake_events
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  premium boolean;
  mi_pais text;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if scope not in ('nacional', 'global') then
    raise exception 'scope invalido: %', scope using errcode = '22023';
  end if;

  select s.is_premium, s.country_code into premium, mi_pais
  from public.user_settings s where s.user_id = me;

  if scope = 'global' and not coalesce(premium, false) then
    -- El cliente lo traduce a la vista bloqueada con el paywall.
    raise exception 'requiere_premium' using errcode = '42501';
  end if;

  if scope = 'nacional' then
    return query
      select q.*
      from public.quake_events q
      where q.canonical_id is null
        and q.country_code = coalesce(mi_pais, 'PE')
        and q.occurred_at > now() - interval '7 days'
      order by q.occurred_at desc;
  else
    return query
      select q.*
      from public.quake_events q
      where q.canonical_id is null
        and q.magnitude >= 4.5
        and q.occurred_at > now() - interval '7 days'
      order by q.occurred_at desc;
  end if;
end;
$$;

revoke execute on function public.get_quake_feed(text) from public, anon;
grant execute on function public.get_quake_feed(text) to authenticated;

-- El feed nacional filtra por país y ordena por fecha; el global por magnitud.
create index if not exists quake_events_feed_nacional_idx
  on public.quake_events (country_code, occurred_at desc)
  where canonical_id is null;

create index if not exists quake_events_feed_global_idx
  on public.quake_events (occurred_at desc)
  where canonical_id is null;
