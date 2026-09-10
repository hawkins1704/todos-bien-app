-- 0052 · Tres correcciones del Centro, salidas del primer recorrido en teléfono.
--
--   1 · Un hogar **nace con su mochila**. Pedirle a alguien que cree una lista
--       vacía antes de poder marcar nada es una pantalla en blanco con forma de
--       tarea. El botón se queda, pero para la SEGUNDA.
--   2 · Una persona puede tener **varias tareas**. La 0049 puso `unique (group_id,
--       member_id)` con el argumento de que repartir con varias etiquetas por
--       cabeza «deja de ser un reparto». En una casa real no se sostiene: el
--       mismo que cierra el gas es el que carga al bebé.
--   3 · El progreso de roles pasa a contar **personas, no filas**. Sin el único
--       índice, `count(*)` podía dar 5 tareas entre 3 personas y devolver 167%.

-- ---------------------------------------------------------------------------
-- 1 · El hogar nace con una mochila
-- ---------------------------------------------------------------------------
--
-- `security definer` como todo lo que corre acá adentro: la RLS de
-- `emergency_kits` pide `household_premium`, y en el instante en que se crea el
-- hogar la sesión que dispara esto es la del dueño —que sí paga—, pero el
-- backfill de abajo corre sin sesión ninguna. Hacerlo del definidor es lo que lo
-- vuelve válido en los dos casos.
--
-- El disparador `emergency_kits_seed` de la 0049 se encadena solo y la llena con
-- el catálogo del INDECI.

create or replace function private.seed_household_kit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Idempotente a propósito: el disparador escucha también el `update` del
  -- flag, y marcar dos veces el mismo grupo no puede dejar dos mochilas.
  if exists (select 1 from public.emergency_kits where group_id = new.id) then
    return null;
  end if;

  insert into public.emergency_kits (group_id, name, sort_order)
  values (new.id, 'Mochila 1', 0);

  return null;
end;
$$;

drop trigger if exists groups_seed_household_kit on public.groups;
create trigger groups_seed_household_kit
  after insert or update of is_household on public.groups
  for each row when (new.is_household)
  execute function private.seed_household_kit();

comment on function private.seed_household_kit() is
  'Le da su primera mochila a un hogar recién marcado. El botón «agregar '
  'mochila» queda para la segunda, que es cuando de verdad hace falta: una '
  'familia grande no mete veinte litros de agua en una sola.';

-- Los hogares que ya existían cuando esto se escribió.
insert into public.emergency_kits (group_id, name, sort_order)
select g.id, 'Mochila 1', 0
  from public.groups g
 where g.is_household
   and not exists (select 1 from public.emergency_kits k where k.group_id = g.id);

-- ---------------------------------------------------------------------------
-- 2 · Varias tareas por persona
-- ---------------------------------------------------------------------------

alter table public.household_roles
  drop constraint if exists household_roles_group_id_member_id_key;

-- Lo que sí se impide es la MISMA tarea dos veces en la misma cabeza, que no es
-- un reparto sino un doble toque en el botón.
create unique index if not exists household_roles_sin_repetir
  on public.household_roles (group_id, member_id, label);

create index if not exists household_roles_member_idx
  on public.household_roles (group_id, member_id);

comment on table public.household_roles is
  'Quién hace qué cuando tiemble. Varias tareas por persona: en una casa real el '
  'mismo que cierra el gas es el que carga al bebé. El progreso cuenta PERSONAS '
  'con al menos una tarea, no filas.';

-- ---------------------------------------------------------------------------
-- 3 · El progreso de roles cuenta personas
-- ---------------------------------------------------------------------------
--
-- Idéntica a la de la 0051 salvo el `count(distinct member_id)`. Se reescribe
-- entera y no se parchea porque `create or replace function` no admite otra cosa.

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
  dueno uuid;
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

  select g.owner_id into dueno from public.groups g where g.id = hogar;
  select count(*) into integrantes from private.household_members(hogar);

  select count(*), count(*) filter (where i.checked_at is not null)
    into items_total, items_ok
    from public.kit_items i
    join public.emergency_kits k on k.id = i.kit_id
   where k.group_id = hogar;
  mochila := case when coalesce(items_total, 0) = 0 then 0
                  else round(100.0 * items_ok / items_total) end;

  plan_pct := case when exists (
      select 1 from public.action_plans
       where group_id = hogar and coalesce(btrim(meeting_point), '') <> ''
    ) then 100 else 0 end;

  -- ⚠️ `distinct member_id`. Desde esta migración una persona puede tener varias
  -- tareas, y con `count(*)` una casa de 3 con 5 tareas repartidas habría
  -- devuelto 167%.
  select count(distinct member_id) into con_rol
    from public.household_roles where group_id = hogar;
  roles_pct := round(100.0 * least(con_rol, integrantes) / greatest(integrantes, 1));

  select count(*) into tips_activos from public.tips where is_active;
  if tips_activos = 0 then
    curso := 0;
  else
    select count(*) into terminaron from (
      select tp.user_id from public.tip_progress tp
       where tp.user_id in (select private.household_members(hogar))
       group by tp.user_id
      having count(distinct tp.tip_id) >= tips_activos
    ) t;
    curso := round(100.0 * terminaron / greatest(integrantes, 1));
  end if;

  simulacro := case when exists (
      select 1 from public.drills
       where group_id = hogar and started_at > now() - interval '6 months'
    ) then 100 else 0 end;

  return jsonb_build_object(
    'householdId', hogar,
    'householdName', (select g.name from public.groups g where g.id = hogar),
    'isOwner', dueno = me,
    'premium', private.household_premium(me),
    'members', integrantes,
    'total', round((mochila + plan_pct + roles_pct + curso + simulacro) / 5.0),
    'modules', jsonb_build_object(
      'kit',    jsonb_build_object('pct', mochila,   'done', items_ok, 'total', items_total),
      'plan',   jsonb_build_object('pct', plan_pct),
      'roles',  jsonb_build_object('pct', roles_pct, 'done', con_rol, 'total', integrantes),
      'course', jsonb_build_object('pct', curso,     'done', coalesce(terminaron,0), 'total', integrantes),
      'drill',  jsonb_build_object('pct', simulacro)
    )
  );
end;
$$;

grant execute on function public.get_household_preparedness() to authenticated;
