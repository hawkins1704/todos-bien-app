-- ============================================================================
-- 0008 · Evento canónico, alerta activa y retención
--
-- PROBLEMA QUE RESUELVE: la spec §6 pide consultar IGP y USGS y disparar si
-- cualquiera reporta el evento. Pero un mismo sismo entra como DOS filas, una
-- por fuente, con epicentro y hora levemente distintos.
--
-- Eso rompe el contador "X/Y confirmados" (spec §5.1), que compara
-- `user_status.quake_event_id` de cada contacto contra el sismo activo: si mi
-- app eligió la fila del IGP y la de mi contacto la del USGS, su reporte se
-- vería como "sin confirmar" aunque haya respondido. También generaría dos
-- alertas para un mismo temblor.
--
-- SOLUCIÓN: al insertar, un evento que caiga cerca en tiempo y espacio de otro
-- ya conocido apunta a él con `canonical_id`. Todos los clientes reportan
-- contra el canónico, así que convergen en un único id por sismo físico.
-- ============================================================================

alter table public.quake_events
  add column canonical_id uuid references public.quake_events (id) on delete set null;

comment on column public.quake_events.canonical_id is
  'Apunta al primer evento visto para este sismo físico. NULL = esta fila es la canónica. Unifica los reportes de IGP y USGS sobre un mismo temblor.';

create index quake_events_canonical_id_idx on public.quake_events (canonical_id);

-- Dos agencias distintas rara vez difieren más que esto para el mismo sismo.
-- Una réplica inmediata dentro de la ventana también se agrupa, lo cual es
-- deseable: queremos una alerta por sacudida, no una por catálogo.
create or replace function private.link_canonical_quake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_id uuid;
begin
  select coalesce(q.canonical_id, q.id) into match_id
  from public.quake_events q
  where q.id <> new.id
    and q.source <> new.source
    and abs(extract(epoch from (q.occurred_at - new.occurred_at))) <= 120
    and public.distance_km(q.latitude, q.longitude, new.latitude, new.longitude) <= 250
  order by abs(extract(epoch from (q.occurred_at - new.occurred_at))) asc
  limit 1;

  new.canonical_id := match_id;
  return new;
end;
$$;

create trigger quake_events_link_canonical
  before insert on public.quake_events
  for each row execute function private.link_canonical_quake();

-- ---------------------------------------------------------------------------
-- get_active_alert · el sismo activo para QUIEN LLAMA, resuelto en el servidor
--
-- Antes el cliente bajaba los 20 sismos más recientes y filtraba localmente.
-- Con el feed global del USGS eso se rompe: 50+ sismos diarios en todo el mundo
-- empujan fuera de esos 20 al que sí le importa a un usuario en Perú.
--
-- Acá se aplica la regla de disparo de la spec §6 contra los ajustes propios
-- del usuario y su última ubicación conocida, y se devuelve una sola fila: la
-- canónica.
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
        -- Premium: sismos grandes en cualquier parte del mundo.
        (me.alert_worldwide_enabled and q.magnitude >= me.alert_countrywide_magnitude)
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
-- Retención de ingest_runs
--
-- El cron corre cada 2 min y escribe una fila por fuente: ~1440 filas por día,
-- medio millón al año. Solo se usa para el "última verificada hace X" de la
-- pantalla en calma, así que una semana sobra.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'prune-ingest-runs',
  '17 4 * * *',
  $job$ delete from public.ingest_runs where ran_at < now() - interval '7 days' $job$
);
