-- ===========================================================================
-- 0024 · Planes de acción múltiples
--
-- Hasta acá el plan era UNA columna de texto en `profiles` (0001). Varios
-- planes estaban prometidos como Premium desde `QUE-PROMETE-LA-APP.md` §7 y
-- anotados en el editor, sin nada detrás.
--
-- LA DECISIÓN QUE ORDENA EL DISEÑO: los planes llevan NOMBRE y se ven TODOS.
-- La alternativa —elegir cuál está «activo»— se descartó: obliga a hacer algo
-- en el momento, que es exactamente lo que la app entera existe para no pedir.
-- Con nombre, tu mamá abre tu ficha un martes a las 3 de la tarde, lee «Si
-- estoy en el trabajo» y sabe adónde ir. El nombre no es decoración: es lo que
-- hace legible la lista.
--
-- Gratis 1, Premium 5. El tope se hace cumplir en un DISPARADOR y no en una
-- RPC, porque el cliente escribe la tabla directo por PostgREST y un chequeo
-- en el cliente no es un chequeo (es la lección de la migración 0009).
--
-- QUÉ PASA SI SE VENCE EL PREMIUM: los planes NO se borran ni se esconden. Se
-- siguen viendo los cinco; lo único que no se puede es agregar uno más. Borrar
-- información de seguridad de alguien porque se le venció una suscripción sería
-- exactamente lo que este producto promete no hacer.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · La tabla
--
-- `sort_order` y no `position`: POSITION es una función de SQL y el nombre
-- obliga a citar la columna en cada consulta.
-- ---------------------------------------------------------------------------
create table public.action_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  sort_order smallint not null default 0 check (sort_order between 0 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index action_plans_user_id_idx on public.action_plans (user_id, sort_order, created_at);

comment on table public.action_plans is
  'Planes de acción con nombre. Gratis 1, Premium 5 (docs/MONETIZACION.md §3). El círculo aceptado los ve todos.';

create trigger action_plans_moddatetime
  before update on public.action_plans
  for each row execute function extensions.moddatetime (updated_at);

alter table public.action_plans enable row level security;

grant select, insert, update, delete on public.action_plans to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Quién los ve
--
-- `is_connected` = solo conexiones ACEPTADAS, igual que `user_status`, y a
-- propósito más estricto que `profiles` (que usa `has_connection_with` e
-- incluye pendientes). Una solicitud que todavía no respondiste no tiene por
-- qué saber adónde vas a ir después de un sismo.
-- ---------------------------------------------------------------------------
create policy action_plans_select_visible on public.action_plans
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or private.is_connected(user_id)
  );

create policy action_plans_insert_own on public.action_plans
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy action_plans_update_own on public.action_plans
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy action_plans_delete_own on public.action_plans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3 · Traer lo que ya había escrito la gente
--
-- Va ANTES del disparador del tope: si no, el propio backfill chocaría contra
-- el límite de los que hoy son gratuitos.
-- ---------------------------------------------------------------------------
insert into public.action_plans (user_id, name, body, sort_order, created_at, updated_at)
select
  p.id,
  'Mi plan',
  btrim(p.action_plan),
  0,
  coalesce(p.action_plan_updated_at, now()),
  coalesce(p.action_plan_updated_at, now())
from public.profiles p
where p.action_plan is not null
  and btrim(p.action_plan) <> '';

-- ---------------------------------------------------------------------------
-- 4 · El tope, del lado del servidor
-- ---------------------------------------------------------------------------
create or replace function private.enforce_action_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  premium boolean;
  usados integer;
  tope integer;
begin
  select s.is_premium into premium
  from public.user_settings s where s.user_id = new.user_id;

  tope := case when coalesce(premium, false) then 5 else 1 end;

  select count(*) into usados
  from public.action_plans where user_id = new.user_id;

  if usados >= tope then
    -- Mismo errcode que el tope de simulacros (0005), para que el cliente
    -- traduzca los dos casos por la misma vía.
    raise exception 'limite_planes' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger action_plans_enforce_limit
  before insert on public.action_plans
  for each row execute function private.enforce_action_plan_limit();

-- ---------------------------------------------------------------------------
-- 5 · Espejo hacia la columna vieja
--
-- `profiles.action_plan` queda como COPIA de solo lectura del primer plan.
-- No es indecisión: hay builds de TestFlight instaladas que leen esa columna
-- por `get_circle`, y si deja de actualizarse el plan les desaparece de la
-- pantalla sin ningún error. El origen de verdad es `action_plans`; esto es un
-- puente, y se borra cuando no quede ninguna build vieja en circulación.
-- ---------------------------------------------------------------------------
create or replace function private.mirror_primary_action_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  duenio uuid := coalesce(new.user_id, old.user_id);
  cuerpo text;
  cuando timestamptz;
begin
  select ap.body, ap.updated_at into cuerpo, cuando
  from public.action_plans ap
  where ap.user_id = duenio
  order by ap.sort_order asc, ap.created_at asc
  limit 1;

  update public.profiles
     set action_plan = cuerpo,
         action_plan_updated_at = cuando
   where id = duenio;

  return null;
end;
$$;

create trigger action_plans_mirror
  after insert or update or delete on public.action_plans
  for each row execute function private.mirror_primary_action_plan();

-- ---------------------------------------------------------------------------
-- 6 · get_circle los devuelve
--
-- Van acá adentro y no en una consulta aparte porque el plan tiene que quedar
-- en la caché local de SQLite: se lee justo después de un sismo, que es cuando
-- puede no haber red. Una consulta en vivo dejaría la pantalla vacía en el
-- único momento que importa.
--
-- Hay que borrar y recrear: Postgres no deja cambiar el tipo de retorno con un
-- `create or replace`.
--
-- La función es `security invoker`, así que la subconsulta pasa por la política
-- de arriba: de una conexión pendiente devuelve `[]`, no sus planes.
-- ---------------------------------------------------------------------------
drop function if exists public.get_circle();

create function public.get_circle()
returns table (
  connection_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  action_plan text,
  action_plan_updated_at timestamptz,
  action_plans jsonb,
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
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', ap.id,
                 'name', ap.name,
                 'body', ap.body,
                 'updatedAt', ap.updated_at
               )
               order by ap.sort_order asc, ap.created_at asc
             )
      from public.action_plans ap
      where ap.user_id = p.id
    ), '[]'::jsonb),
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
  -- `status in ('pending','accepted')` es lo que deja fuera a los BLOQUEADOS
  -- (0021). Se copia tal cual de la versión viva: recrear la función perdiendo
  -- este filtro los devolvería al círculo sin que nadie lo note.
  where (select auth.uid()) in (c.user_a, c.user_b)
    and c.status in ('pending', 'accepted');
$$;
