-- ============================================================================
-- 0010 · Fan-out de alertas: de un sismo a los usuarios a los que les aplica
--
-- Hasta acá la regla de disparo existía en una sola dirección: `get_active_alert()`
-- responde "¿hay un sismo activo PARA MÍ?" cuando el cliente pregunta. Para
-- notificar hace falta la dirección contraria: "¿a QUIÉNES les aplica este
-- sismo?", calculada sin que nadie pregunte.
--
-- DECISIÓN CENTRAL: la regla se escribe UNA sola vez.
-- Tener dos copias del mismo criterio —una para consultar y otra para
-- notificar— garantiza que con el tiempo se separen y que la app termine
-- mostrando una alerta que nunca se notificó, o al revés. Por eso acá se extrae
-- el predicado a `private.quake_applies()` y `get_active_alert()` se reescribe
-- para llamarlo. Es exactamente el mismo motivo por el que la regla se movió
-- del cliente al servidor (§1.8): una sola fuente de verdad.
--
-- Esta migración calcula y ENCOLA. El envío (edge function + Expo Push) es la
-- pieza siguiente y no depende de nada de esto para escribirse.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · El predicado compartido
--
-- Recibe los ajustes del usuario y los datos del evento, y devuelve si ese
-- sismo le aplica. `immutable` + `parallel safe` para que Postgres lo pueda
-- inline-ar dentro del WHERE del fan-out en vez de llamarlo fila por fila.
-- ---------------------------------------------------------------------------
create or replace function private.quake_applies(
  -- Ajustes del usuario
  p_is_premium boolean,
  p_worldwide_enabled boolean,
  p_country_code text,
  p_radius_km integer,
  p_min_magnitude numeric,
  p_countrywide_magnitude numeric,
  p_lat double precision,
  p_lon double precision,
  -- Datos del evento
  q_magnitude numeric,
  q_country_code text,
  q_lat double precision,
  q_lon double precision
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select
    -- Premium: sismos grandes en cualquier parte del mundo (spec §12).
    (p_is_premium and p_worldwide_enabled and q_magnitude >= p_countrywide_magnitude)
    -- Regla 2: magnitud alta en el país, sin importar el radio.
    or (q_country_code = p_country_code and q_magnitude >= p_countrywide_magnitude)
    -- Regla 1: magnitud sobre el umbral dentro del radio configurado.
    or (
      p_lat is not null
      and q_magnitude >= p_min_magnitude
      and public.distance_km(p_lat, p_lon, q_lat, q_lon) <= p_radius_km
    );
$$;

comment on function private.quake_applies is
  'Regla de disparo de la spec §6, en un solo lugar. La usan get_active_alert() (usuario -> sismo) y el fan-out (sismo -> usuarios) para que no puedan separarse.';

-- ---------------------------------------------------------------------------
-- 2 · get_active_alert reescrita sobre el predicado compartido
--
-- Mismo comportamiento que en 0009; lo único que cambia es que el criterio ya
-- no está escrito acá.
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
      and private.quake_applies(
        me.is_premium, me.alert_worldwide_enabled, me.country_code,
        me.alert_radius_km, me.alert_min_magnitude, me.alert_countrywide_magnitude,
        me.my_lat, me.my_lon,
        q.magnitude, q.country_code, q.latitude, q.longitude
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
-- 3 · Marcas de control sobre quake_events
--
-- `updated_at` NO existía. Hace falta porque el USGS revisa magnitudes de
-- eventos ya publicados: un sismo que entra en 4.2 y se corrige a 4.8 tiene que
-- volver a evaluarse, o los usuarios con umbral 4.5 nunca se enteran. El upsert
-- de la ingesta es un UPDATE real, así que el trigger lo detecta.
-- ---------------------------------------------------------------------------
alter table public.quake_events
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists fanned_out_at timestamptz;

drop trigger if exists quake_events_moddatetime on public.quake_events;

create trigger quake_events_moddatetime
  before update on public.quake_events
  for each row execute function extensions.moddatetime (updated_at);

comment on column public.quake_events.fanned_out_at is
  'Última vez que se calculó a quiénes les aplica este sismo. NULL = todavía no se evaluó.';

-- ---------------------------------------------------------------------------
-- 4 · La cola
--
-- Una fila por (sismo canónico, usuario). El índice único es lo que hace que el
-- fan-out se pueda repetir sin duplicar avisos, que es justamente lo que
-- permite reevaluar un sismo cuando le corrigen la magnitud.
--
-- Tabla interna: RLS activa y SIN políticas, así que ni `anon` ni
-- `authenticated` ven nada. Solo la toca `service_role`.
-- ---------------------------------------------------------------------------
create table if not exists public.alert_deliveries (
  id uuid primary key default gen_random_uuid(),
  quake_event_id uuid not null references public.quake_events (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Jitter de la spec §6 (ver §6 de esta migración).
  send_after timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'expired', 'no_token')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint alert_deliveries_unique unique (quake_event_id, user_id)
);

alter table public.alert_deliveries enable row level security;

-- RLS sin políticas ya bloquea a los clientes, pero Supabase concede por defecto
-- todos los privilegios sobre el schema `public` a `anon` y `authenticated`.
-- Se revocan igual: si alguna vez alguien agrega una política permisiva por
-- error, los grants abiertos convertirían el descuido en escritura total. Misma
-- línea que la migración 0006.
revoke all on table public.alert_deliveries from anon, authenticated;

comment on table public.alert_deliveries is
  'Cola de avisos de sismo. Una fila por (sismo canónico, usuario). Interna: solo service_role.';

-- El sender solo consulta lo pendiente y vencido, así que el índice es parcial.
create index if not exists alert_deliveries_pendientes_idx
  on public.alert_deliveries (send_after)
  where status = 'pending';

create index if not exists alert_deliveries_quake_idx on public.alert_deliveries (quake_event_id);

-- ---------------------------------------------------------------------------
-- 5 · Fan-out de un sismo
--
-- Solo se encolan eventos CANÓNICOS: el mismo temblor entra dos veces (IGP y
-- USGS) y `canonical_id` los unifica (§0008). Sin este filtro cada sismo
-- generaría dos avisos para la misma persona.
--
-- Se excluye a quien no terminó el onboarding: todavía no eligió sus umbrales
-- ni dio permisos, y recibiría una alerta sin contexto.
-- ---------------------------------------------------------------------------
create or replace function private.fan_out_quake(p_quake_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quake_events;
  encolados integer;
begin
  select * into q from public.quake_events where id = p_quake_id;
  if not found or q.canonical_id is not null then
    return 0;
  end if;

  insert into public.alert_deliveries (quake_event_id, user_id, send_after)
  select
    q.id,
    s.user_id,
    -- Jitter: ver §6.
    now() + (random() * interval '30 seconds')
  from public.user_settings s
  left join public.user_status st on st.user_id = s.user_id
  where s.onboarding_completed_at is not null
    and private.quake_applies(
      s.is_premium, s.alert_worldwide_enabled, s.country_code,
      s.alert_radius_km, s.alert_min_magnitude, s.alert_countrywide_magnitude,
      st.latitude, st.longitude,
      q.magnitude, q.country_code, q.latitude, q.longitude
    )
  on conflict on constraint alert_deliveries_unique do nothing;

  get diagnostics encolados = row_count;

  update public.quake_events set fanned_out_at = now() where id = q.id;

  return encolados;
end;
$$;

revoke execute on function private.fan_out_quake(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6 · El barrido que corre por cron
--
-- Reevalúa los sismos recientes, no solo los nuevos. Dos motivos reales:
--
--   a) Las magnitudes se corrigen. Un 4.2 que pasa a 4.8 tiene que alcanzar a
--      los usuarios con umbral 4.5.
--   b) La ubicación del usuario puede llegar tarde. Alguien sin ubicación
--      guardada no matchea por radio; si reporta su estado dos minutos después
--      del sismo, en el siguiente barrido ya entra.
--
-- Repetir es seguro por el índice único, así que se reevalúa **incondicionalmente**
-- todo sismo dentro de la ventana.
--
-- Un intento anterior filtraba por `fanned_out_at < updated_at` para ahorrar
-- trabajo, y estaba mal: `now()` devuelve el instante de la TRANSACCIÓN, no el
-- del reloj, así que el `fanned_out_at` que escribe el fan-out y el `updated_at`
-- que escribe moddatetime quedan idénticos y la comparación con `<` nunca se
-- cumple. Un sismo corregido de 4.2 a 4.8 no volvía a evaluarse. Además ese
-- filtro solo cubría cambios en el evento: no detecta que al usuario le llegó la
-- ubicación tarde ni que cambió sus umbrales, que también alteran el resultado.
--
-- `fanned_out_at` queda solo como dato de observabilidad.
--
-- Costo: (sismos de los últimos 30 min) x (usuarios) por minuto. En Perú lo
-- normal es 0 o 1 sismo en esa ventana. Con un padrón grande conviene medirlo y,
-- si hace falta, indexar por ubicación en vez de recorrer `user_settings`.
--
-- La ventana de 30 min acota el trabajo: pasado ese tiempo el aviso ya no se
-- manda igual (ver la expiración en `claim_alert_deliveries`).
-- ---------------------------------------------------------------------------
create or replace function private.fan_out_pending_quakes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  total integer := 0;
begin
  for fila in
    select id
    from public.quake_events
    where canonical_id is null
      and occurred_at > now() - interval '30 minutes'
    order by occurred_at asc
  loop
    total := total + private.fan_out_quake(fila.id);
  end loop;

  return total;
end;
$$;

revoke execute on function private.fan_out_pending_quakes() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7 · Contrato con el sender
--
-- `claim_alert_deliveries` reserva un lote y lo marca 'sending' en la misma
-- transacción, con FOR UPDATE SKIP LOCKED: si mañana corren dos senders en
-- paralelo, no se pisan ni mandan el aviso dos veces.
--
-- Antes de reservar, expira lo viejo. Un aviso de sismo que llega tres horas
-- tarde no sirve y además es dañino: la persona ya no está donde estaba, y el
-- push dispararía una captura de ubicación que se guardaría como "dónde estaba
-- durante el sismo" siendo falso. Si el sistema estuvo caído, esos avisos se
-- descartan, no se acumulan para mandarse todos juntos al volver.
-- ---------------------------------------------------------------------------
create or replace function public.claim_alert_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  user_id uuid,
  quake_event_id uuid,
  magnitude numeric,
  place text,
  region text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.alert_deliveries d
  set status = 'expired'
  from public.quake_events q
  where q.id = d.quake_event_id
    and d.status = 'pending'
    and q.occurred_at < now() - interval '2 hours';

  return query
  with lote as (
    select d.id
    from public.alert_deliveries d
    where d.status = 'pending'
      and d.send_after <= now()
    order by d.send_after asc
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  )
  update public.alert_deliveries d
  set status = 'sending', attempts = d.attempts + 1
  from lote, public.quake_events q
  where d.id = lote.id and q.id = d.quake_event_id
  returning d.id, d.user_id, d.quake_event_id,
            q.magnitude, q.place, q.region, q.occurred_at;
end;
$$;

revoke execute on function public.claim_alert_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_alert_deliveries(integer) to service_role;

create or replace function public.mark_alert_deliveries(
  p_sent uuid[] default '{}',
  p_no_token uuid[] default '{}',
  p_failed uuid[] default '{}',
  p_error text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.alert_deliveries
  set status = 'sent', sent_at = now(), last_error = null
  where id = any(p_sent);

  update public.alert_deliveries
  set status = 'no_token'
  where id = any(p_no_token);

  -- Vuelven a 'pending' para reintentar, salvo que ya se hayan intentado
  -- demasiadas veces: un token revocado fallaría para siempre.
  update public.alert_deliveries
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      last_error = p_error
  where id = any(p_failed);
$$;

revoke execute on function public.mark_alert_deliveries(uuid[], uuid[], uuid[], text) from public, anon, authenticated;
grant execute on function public.mark_alert_deliveries(uuid[], uuid[], uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 8 · Cron
--
-- Cada minuto, la mitad del intervalo de la ingesta (2 min): así un sismo recién
-- ingerido no espera un ciclo entero para encolarse.
-- ---------------------------------------------------------------------------
select cron.unschedule('fan-out-quakes')
where exists (select 1 from cron.job where jobname = 'fan-out-quakes');

select cron.schedule(
  'fan-out-quakes',
  '* * * * *',
  $job$ select private.fan_out_pending_quakes() $job$
);

-- Retención: la cola es operativa, no un histórico.
select cron.unschedule('prune-alert-deliveries')
where exists (select 1 from cron.job where jobname = 'prune-alert-deliveries');

select cron.schedule(
  'prune-alert-deliveries',
  '23 4 * * *',
  $job$ delete from public.alert_deliveries where created_at < now() - interval '30 days' $job$
);
