-- ============================================================================
-- 0003 · Estado del usuario y eventos sísmicos (spec §4, §5, §6)
--
-- Decisión de escala: NO existe una tabla de "alerta por usuario". Un sismo que
-- afecta a 200k personas generaría 200k filas por evento. En su lugar,
-- user_status guarda a qué quake_event_id corresponde el último reporte, y
-- "sin confirmar" se deriva en el cliente: si user_status.quake_event_id no es
-- el del sismo activo, esa persona todavía no confirma. Así una alerta nueva no
-- necesita reescribir ninguna fila.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- quake_events · ingeridos por la edge function desde IGP y USGS
-- ---------------------------------------------------------------------------
create table public.quake_events (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('igp', 'usgs')),
  source_event_id text not null,
  magnitude numeric(3, 1) not null,
  depth_km numeric(6, 2),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  place text,
  region text,
  country_code text,
  -- Escala de Mercalli que reporta el IGP cuando está disponible (spec §6).
  intensity_mmi text,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now(),
  raw jsonb,
  constraint quake_events_source_unique unique (source, source_event_id)
);

create index quake_events_occurred_at_idx on public.quake_events (occurred_at desc);
create index quake_events_magnitude_idx on public.quake_events (magnitude, occurred_at desc);

alter table public.quake_events enable row level security;

-- ---------------------------------------------------------------------------
-- ingest_runs · alimenta el banner "Sin alertas activas · última verificada
-- hace X" de la pantalla en calma (spec §5.2)
-- ---------------------------------------------------------------------------
create table public.ingest_runs (
  id bigint generated always as identity primary key,
  source text not null check (source in ('igp', 'usgs')),
  ran_at timestamptz not null default now(),
  ok boolean not null,
  events_found integer not null default 0,
  error text
);

create index ingest_runs_source_ran_at_idx on public.ingest_runs (source, ran_at desc);

alter table public.ingest_runs enable row level security;

-- ---------------------------------------------------------------------------
-- user_status · una fila por usuario, la tabla caliente del dashboard
-- ---------------------------------------------------------------------------
create table public.user_status (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  status text not null default 'unconfirmed'
    check (status in ('unconfirmed', 'safe', 'needs_help', 'helping')),
  message text check (message is null or char_length(message) <= 280),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision,
  location_at timestamptz,
  quake_event_id uuid references public.quake_events (id) on delete set null,
  -- Marca inequívoca de simulacro: viaja con el estado para que el círculo
  -- nunca confunda una práctica con un evento real (spec §9).
  is_drill boolean not null default false,
  reported_at timestamptz,
  updated_at timestamptz not null default now()
);

create index user_status_quake_event_id_idx on public.user_status (quake_event_id);

alter table public.user_status enable row level security;

create trigger user_status_moddatetime
  before update on public.user_status
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Distancia great-circle sin depender de PostGIS/earthdistance, para el
-- cálculo de destinatarios de una alerta.
-- ---------------------------------------------------------------------------
create or replace function public.distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select 6371.0 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2)
    + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)
  ));
$$;

-- ---------------------------------------------------------------------------
-- Ver el perfil de quien te mandó una solicitud todavía sin aceptar: hace falta
-- para poder decidir si la aceptas.
-- ---------------------------------------------------------------------------
create or replace function private.has_connection_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.connections c
    where c.status in ('pending', 'accepted')
      and (
        (c.user_a = (select auth.uid()) and c.user_b = other_user_id)
        or (c.user_b = (select auth.uid()) and c.user_a = other_user_id)
      )
  );
$$;

revoke execute on function private.has_connection_with(uuid) from public;
grant execute on function private.has_connection_with(uuid) to authenticated;

create policy profiles_select_pending_party on public.profiles
  for select to authenticated
  using (private.has_connection_with(id));

-- ---------------------------------------------------------------------------
-- get_circle · una sola llamada para pintar el dashboard y llenar la caché
-- local de SQLite. Devuelve pendientes y aceptadas; el cliente separa.
-- ---------------------------------------------------------------------------
create or replace function public.get_circle()
returns table (
  connection_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  action_plan text,
  action_plan_updated_at timestamptz,
  connection_status text,
  requested_by uuid,
  connection_created_at timestamptz,
  responded_at timestamptz,
  status text,
  status_message text,
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  location_at timestamptz,
  quake_event_id uuid,
  is_drill boolean,
  reported_at timestamptz,
  status_updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    p.id,
    p.display_name,
    p.avatar_url,
    p.action_plan,
    p.action_plan_updated_at,
    c.status,
    c.requested_by,
    c.created_at,
    c.responded_at,
    s.status,
    s.message,
    s.latitude,
    s.longitude,
    s.location_accuracy_m,
    s.location_at,
    s.quake_event_id,
    s.is_drill,
    s.reported_at,
    s.updated_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join public.user_status s
    on s.user_id = p.id
  where (select auth.uid()) in (c.user_a, c.user_b)
    and c.status in ('pending', 'accepted');
$$;

-- ---------------------------------------------------------------------------
-- report_status · escritura idempotente del propio estado + ubicación.
-- El cliente la llama tanto desde el outbox offline como en vivo.
-- ---------------------------------------------------------------------------
create or replace function public.report_status(
  new_status text,
  new_message text default null,
  lat double precision default null,
  lng double precision default null,
  accuracy_m double precision default null,
  located_at timestamptz default null,
  quake_id uuid default null,
  drill boolean default false,
  reported timestamptz default null
)
returns public.user_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result public.user_status;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  insert into public.user_status as us (
    user_id, status, message, latitude, longitude,
    location_accuracy_m, location_at, quake_event_id, is_drill, reported_at
  )
  values (
    me, new_status, new_message, lat, lng,
    accuracy_m, located_at, quake_id, drill, coalesce(reported, now())
  )
  on conflict (user_id) do update
    set status = excluded.status,
        message = excluded.message,
        -- Un reporte sin GPS (permiso denegado, sin fix) no debe borrar la
        -- última ubicación conocida.
        latitude = coalesce(excluded.latitude, us.latitude),
        longitude = coalesce(excluded.longitude, us.longitude),
        location_accuracy_m = coalesce(excluded.location_accuracy_m, us.location_accuracy_m),
        location_at = coalesce(excluded.location_at, us.location_at),
        quake_event_id = excluded.quake_event_id,
        is_drill = excluded.is_drill,
        reported_at = excluded.reported_at
    -- Descarta escrituras del outbox que lleguen fuera de orden.
    where excluded.reported_at >= coalesce(us.reported_at, 'epoch'::timestamptz)
  returning * into result;

  if result.user_id is null then
    select * into result from public.user_status where user_id = me;
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
grant select on public.quake_events to authenticated;
grant select on public.ingest_runs to authenticated;
grant select, insert, update on public.user_status to authenticated;

-- Los sismos son información pública; solo el service role los escribe.
create policy quake_events_select_all on public.quake_events
  for select to authenticated
  using (true);

create policy ingest_runs_select_all on public.ingest_runs
  for select to authenticated
  using (true);

create policy user_status_select_own on public.user_status
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- Ubicación y estado solo para conexiones ACEPTADAS (no para pendientes).
create policy user_status_select_connected on public.user_status
  for select to authenticated
  using (private.is_connected(user_id));

create policy user_status_insert_own on public.user_status
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_status_update_own on public.user_status
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
