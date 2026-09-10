-- 0050 · El plan del hogar vive en `action_plans`, y el progreso del Centro.
--
-- ## Por qué NO se hizo una tabla aparte
--
-- El primer diseño le daba tabla propia al plan del hogar, por privacidad: la
-- RLS de `action_plans` lo muestra a **todo el círculo aceptado** y `get_circle`
-- lo manda a la caché de cada contacto, así que un plan de casa colgado ahí se
-- le filtraría a gente que no vive ahí.
--
-- Se descartó por una razón mejor: **dos tablas son dos conceptos**, y el dueño
-- del producto lo dijo sin rodeos — nadie quiere tener un plan personal llamado
-- «Casa» y además un plan del hogar también llamado «Casa». Una sola lista.
--
-- La privacidad se resuelve con tres cambios chicos en vez de una tabla:
--
--   1. la política de lectura gana `or private.is_household_member(group_id)`;
--   2. `get_circle()` **excluye** los de hogar (`ap.group_id is null`);
--   3. el tope de 1/5 cuenta solo los personales.
--
-- ## `meeting_point` es una columna, y el mapa sigue descartado
--
-- El punto de encuentro se separa del cuerpo porque el progreso necesita saber
-- si existe, y «buscar la palabra encuentro en 1000 caracteres» no es una
-- respuesta. Sigue siendo **texto libre**: el selector en mapa está descartado
-- por decisión (`ESTADO` §1.2.2), no pospuesto.
--
-- ## Quién edita el plan del hogar
--
-- Cualquier integrante, no solo el dueño. Un plan que solo puede tocar una
-- persona no es de la casa. Es una excepción deliberada al «manda el dueño» de
-- los grupos (0034), y aplica **solo** a las filas con `group_id`.

-- ---------------------------------------------------------------------------
-- 1 · Las dos columnas
-- ---------------------------------------------------------------------------

alter table public.action_plans
  add column if not exists group_id uuid references public.groups (id) on delete cascade,
  add column if not exists meeting_point text;

do $$
begin
  alter table public.action_plans
    add constraint action_plans_meeting_point_len
    check (meeting_point is null or char_length(btrim(meeting_point)) between 1 and 200);
exception when duplicate_object then null;
end $$;

comment on column public.action_plans.group_id is
  'NULL = plan personal, como siempre. Con valor = el plan del HOGAR, uno solo '
  'por casa, que ven y editan sus integrantes. No viaja en get_circle().';

-- Un solo plan por hogar: es «el plan de la casa», no una lista.
create unique index if not exists action_plans_one_per_household
  on public.action_plans (group_id)
  where group_id is not null;

-- ---------------------------------------------------------------------------
-- 2 · El tope de 1/5 no cuenta el del hogar
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
  -- El plan del hogar no ocupa cupo personal: es de la casa, y su límite lo
  -- pone el índice único de arriba.
  if new.group_id is not null then
    return new;
  end if;

  select s.is_premium into premium
  from public.user_settings s where s.user_id = new.user_id;

  tope := case when coalesce(premium, false) then 5 else 1 end;

  select count(*) into usados
  from public.action_plans
  where user_id = new.user_id and group_id is null;

  if usados >= tope then
    raise exception 'limite_planes' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3 · RLS
-- ---------------------------------------------------------------------------

drop policy if exists action_plans_select_visible on public.action_plans;
create policy action_plans_select_visible on public.action_plans
  for select to authenticated
  using (
    (select auth.uid()) = user_id
    or private.is_connected(user_id)
    or private.is_household_member(group_id)
  );

drop policy if exists action_plans_insert_own on public.action_plans;
create policy action_plans_insert_own on public.action_plans
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and (
      group_id is null
      or (private.is_household_member(group_id)
          and private.household_premium((select auth.uid())))
    )
  );

drop policy if exists action_plans_update_own on public.action_plans;
create policy action_plans_update_own on public.action_plans
  for update to authenticated
  using (
    (select auth.uid()) = user_id
    or (private.is_household_member(group_id)
        and private.household_premium((select auth.uid())))
  )
  with check (
    (select auth.uid()) = user_id
    or (private.is_household_member(group_id)
        and private.household_premium((select auth.uid())))
  );

drop policy if exists action_plans_delete_own on public.action_plans;
create policy action_plans_delete_own on public.action_plans
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    or (private.is_household_member(group_id)
        and private.household_premium((select auth.uid())))
  );

-- El punto de encuentro lo lee toda la casa: mismo criterio que la 0047.
drop trigger if exists action_plans_moderar_meeting on public.action_plans;
create trigger action_plans_moderar_meeting
  before insert or update of meeting_point on public.action_plans
  for each row execute function private.rechazar_contenido_ofensivo('meeting_point');

-- ---------------------------------------------------------------------------
-- 4 · `get_circle()` no manda el plan del hogar
-- ---------------------------------------------------------------------------
--
-- Una línea: `and ap.group_id is null`. Sin ella, el punto de encuentro de tu
-- casa viajaría a la caché de cada contacto aceptado, que es exactamente lo que
-- este diseño evita. El resto del cuerpo es idéntico al de la 0039.

create or replace function public.get_circle()
returns table(
  connection_id uuid, user_id uuid, display_name text, avatar_url text,
  action_plan text, action_plan_updated_at timestamptz, action_plans jsonb,
  connection_status text, requested_by uuid, connection_created_at timestamptz,
  responded_at timestamptz, status text, status_message text,
  latitude double precision, longitude double precision,
  location_accuracy_m double precision, location_at timestamptz,
  quake_event_id uuid, is_drill boolean, reported_at timestamptz,
  status_updated_at timestamptz, alerted_quake_ids jsonb,
  receives_notifications boolean
)
language sql
stable
set search_path = ''
as $$
  with alcance as (
    select sc.user_id, jsonb_agg(sc.quake_event_id) as ids
    from public.get_circle_alert_scope() sc
    group by sc.user_id
  ),
  alcanzables as (
    select r.user_id, r.reachable
    from public.get_circle_push_reach() r
  )
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
                 'id', ap.id, 'name', ap.name, 'body', ap.body, 'updatedAt', ap.updated_at
               )
               order by ap.sort_order asc, ap.created_at asc
             )
      from public.action_plans ap
      where ap.user_id = p.id
        and ap.group_id is null
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
    s.updated_at,
    coalesce(a.ids, '[]'::jsonb),
    -- ⚠️ `true` por defecto, no `false`: sin entrega registrada se asume que SÍ
    -- recibe. Al revés, toda la red aparecería marcada «No recibe
    -- notificaciones» el día que se despliegue esto.
    coalesce(al.reachable, true)
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join public.user_status s
    on s.user_id = p.id
  left join alcance a
    on a.user_id = p.id
  left join alcanzables al
    on al.user_id = p.id
  where (select auth.uid()) in (c.user_a, c.user_b)
    -- ⚠️ Sin este filtro, un contacto BLOQUEADO vuelve a aparecer en la red.
    and c.status in ('pending', 'accepted');
$$;

grant execute on function public.get_circle() to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · Quiénes viven en la casa
-- ---------------------------------------------------------------------------

create or replace function private.household_members(p_group uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select g.owner_id from public.groups g where g.id = p_group
  union
  select m.member_id from public.group_members m where m.group_id = p_group;
$$;

-- ---------------------------------------------------------------------------
-- 6 · El progreso
-- ---------------------------------------------------------------------------
--
-- Cinco áreas, cada una vale lo mismo. Sin ponderaciones: el reparto tiene que
-- poder explicarse en una línea, o la barra deja de significar algo.
--
-- Va por RPC `security definer` porque necesita **contar el avance ajeno del
-- minicurso**, y la RLS de `tip_progress` no deja leer el de nadie más. Devuelve
-- solo agregados: cuántos terminaron, nunca quién.

create or replace function public.get_household_preparedness()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  hogar uuid;
  integrantes int;
  items_total int; items_ok int;
  tips_activos int; terminaron int; con_rol int;
  mochila int; plan_pct int; roles_pct int; curso int; simulacro int;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  hogar := private.household_of(me);
  if hogar is null then
    return null;
  end if;

  select count(*) into integrantes from private.household_members(hogar);

  -- Mochila: ítems marcados sobre el total, sumando TODAS las mochilas.
  select count(*), count(*) filter (where i.checked_at is not null)
    into items_total, items_ok
    from public.kit_items i
    join public.emergency_kits k on k.id = i.kit_id
   where k.group_id = hogar;
  mochila := case when coalesce(items_total, 0) = 0 then 0
                  else round(100.0 * items_ok / items_total) end;

  -- Plan: existe y tiene punto de encuentro escrito.
  plan_pct := case when exists (
      select 1 from public.action_plans
       where group_id = hogar
         and coalesce(btrim(meeting_point), '') <> ''
    ) then 100 else 0 end;

  -- Roles: personas con rol sobre personas de la casa.
  select count(*) into con_rol from public.household_roles where group_id = hogar;
  roles_pct := round(100.0 * least(con_rol, integrantes) / greatest(integrantes, 1));

  -- Minicurso: cuántos lo terminaron entero.
  select count(*) into tips_activos from public.tips where is_active;
  if tips_activos = 0 then
    curso := 0;
  else
    select count(*) into terminaron from (
      select tp.user_id
        from public.tip_progress tp
       where tp.user_id in (select private.household_members(hogar))
       group by tp.user_id
      having count(distinct tp.tip_id) >= tips_activos
    ) t;
    curso := round(100.0 * terminaron / greatest(integrantes, 1));
  end if;

  -- Simulacro: uno de la casa en los últimos seis meses.
  simulacro := case when exists (
      select 1 from public.drills
       where group_id = hogar
         and started_at > now() - interval '6 months'
    ) then 100 else 0 end;

  return jsonb_build_object(
    'householdId', hogar,
    'members', integrantes,
    'total', round((mochila + plan_pct + roles_pct + curso + simulacro) / 5.0),
    'modules', jsonb_build_object(
      'kit',   jsonb_build_object('pct', mochila,   'done', items_ok, 'total', items_total),
      'plan',  jsonb_build_object('pct', plan_pct),
      'roles', jsonb_build_object('pct', roles_pct, 'done', con_rol,  'total', integrantes),
      'course',jsonb_build_object('pct', curso,     'done', coalesce(terminaron,0), 'total', integrantes),
      'drill', jsonb_build_object('pct', simulacro)
    )
  );
end;
$$;

grant execute on function public.get_household_preparedness() to authenticated;
