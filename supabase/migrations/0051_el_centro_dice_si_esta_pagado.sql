-- 0051 · `get_household_preparedness()` también dice si la casa está pagada.
--
-- ## El hueco que cierra
--
-- La 0050 devolvía solo el progreso. Pero la pantalla necesita distinguir TRES
-- estados, no dos:
--
--   · sin hogar          → «arma tu hogar» + paywall
--   · con hogar sin pagar→ candado, pero mostrando lo que ya hay
--   · con hogar pagado   → el Centro entero
--
-- Y el cliente **no puede calcular el del medio**: la RLS de `user_settings` es
-- propia, así que un integrante no puede leer el `is_premium` del dueño de su
-- casa. Solo el servidor lo sabe.
--
-- Se agrega también `isOwner`, que decide si la pantalla ofrece sumar gente:
-- agregar es del dueño (0034) y ofrecerlo a los demás sería un botón que falla.

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

  select count(*) into con_rol from public.household_roles where group_id = hogar;
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
    -- La puerta de todo el Centro, resuelta donde se puede resolver.
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
