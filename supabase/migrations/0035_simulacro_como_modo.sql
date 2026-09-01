-- ===========================================================================
-- 0035 · El simulacro deja de ser una pantalla y pasa a ser un MODO
--
-- ---------------------------------------------------------------------------
-- Qué estaba mal
-- ---------------------------------------------------------------------------
-- El simulacro vivía entero en `/drill`: una pantalla con su propia alerta de
-- mentira, su propio selector de estado y su propio resumen. Practicabas en una
-- maqueta y aprendías a usar **esa maqueta**, no la app. El día del sismo, la
-- pantalla que ibas a ver era otra.
--
-- Ahora el simulacro **enciende la app de verdad**: la Home entra en modo alerta,
-- la red se pinta, la ubicación se captura. Lo único falso es el sismo, y eso
-- solo vive en el teléfono — acá no se siembra ninguna fila en `quake_events`,
-- porque el disparador `quake_ingested_fan_out` la repartiría a usuarios reales.
--
-- ---------------------------------------------------------------------------
-- Lo que agrega esta migración
-- ---------------------------------------------------------------------------
--   1. Un simulacro puede ser **de un grupo**, y entonces tiene participantes.
--   2. Caduca solo a los 60 minutos.
--   3. Se avisa a los participantes cuando empieza y cuando se cierra.
--   4. El cupo se descuenta **al iniciar**, no al completar.
--
-- ---------------------------------------------------------------------------
-- El cupo cuenta lo que CONVOCAS, no lo que te hacen
-- ---------------------------------------------------------------------------
-- Participar en el simulacro de otro es gratis e ilimitado, siempre. Si gastara
-- cupo, quien arma el grupo estaría gastando el de los demás: corre tres y su
-- familia se queda en cero sin haber decidido nada, y choca con un paywall que
-- no disparó. Es la misma regla que el tope de grupos de la 0034.
--
-- **Y se descuenta al INICIAR, no al completar** (antes era al completar). Con
-- simulacros grupales eso era un agujero: convocás, no cerrás, repetís. Una sola
-- regla, sin letra chica, y el diálogo de confirmación la dice.
--
-- ---------------------------------------------------------------------------
-- Por qué la audiencia del «necesito ayuda» de un simulacro cambia
-- ---------------------------------------------------------------------------
-- `on_status_reported` mandaba el aviso de un simulacro en modo `notify` a la
-- RED ENTERA. Eso era demasiado: practicar con tu familia no tiene por qué
-- interrumpirle el día a los 24 contactos que no están practicando. Ahora la
-- audiencia son **los participantes del simulacro**, y un simulacro individual
-- no avisa a nadie — que es lo que «privado» significa.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · El simulacro puede ser de un grupo, y caduca
-- ---------------------------------------------------------------------------
alter table public.drills
  add column group_id uuid references public.groups (id) on delete cascade;

alter table public.drills add column ends_at timestamptz;

update public.drills set ends_at = started_at + interval '60 minutes' where ends_at is null;

alter table public.drills
  alter column ends_at set not null,
  alter column ends_at set default (now() + interval '60 minutes');

comment on column public.drills.ends_at is
  'Caducidad automática (0035). Sin esto, un simulacro grupal cuyo convocante se queda sin batería dejaría a los demás en modo simulacro para siempre.';

create index drills_group_active_idx
  on public.drills (group_id)
  where completed_at is null and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- 2 · Quiénes practican
--
-- Sin políticas de RLS a propósito: todo lo de esta tabla pasa por RPC. Una
-- política de SELECT tendría que preguntar «¿estoy en este simulacro?»
-- consultando esta misma tabla, que es la recursión que ya nos costó un rato en
-- la 0004 y en la 0034.
-- ---------------------------------------------------------------------------
create table public.drill_participants (
  drill_id uuid not null references public.drills (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (drill_id, user_id)
);

create index drill_participants_activos_idx
  on public.drill_participants (user_id)
  where left_at is null;

alter table public.drill_participants enable row level security;

comment on table public.drill_participants is
  'Quiénes están en un simulacro grupal. Cada uno puede irse cuando quiera; el convocante lo cierra para todos.';

-- ---------------------------------------------------------------------------
-- 3 · Preferencia y tipos de aviso
--
-- La regla de los CUATRO lugares de la 0028, cumplida entera:
--   1. el CHECK de `notification_deliveries.kind`
--   2. la rama del `case` en `enqueue_notifications`
--   3. la columna de `notification_preferences`
--   4. quien lo emite  (más abajo, en `start_drill` y `end_my_drill`)
--
-- `drill_invites` en `false` no apaga solo el push: **te deja fuera del
-- simulacro**. Recibir el aviso y ser arrastrado al modo simulacro igual sería
-- respetar la preferencia a medias, que es peor que no tenerla.
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column drill_invites boolean not null default true;

alter table public.notification_deliveries
  drop constraint notification_deliveries_kind_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_kind_check
  check (kind = any (array[
    'connection_request',
    'connection_accepted',
    'contact_needs_help',
    'contact_message',
    'contact_not_responding',
    'quake_national',
    'quake_worldwide',
    'contact_in_quake_zone',
    'contact_is_safe',
    'contact_reported',
    'drill_started',
    'drill_ended'
  ]));

create or replace function private.enqueue_notifications(
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_channel text default 'social',
  p_dedupe_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  encolados integer;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return 0;
  end if;

  insert into public.notification_deliveries (user_id, kind, title, body, data, channel, dedupe_key)
  select u.id, p_kind, p_title, p_body, p_data, p_channel, p_dedupe_key
  from unnest(p_user_ids) as u(id)
  left join public.notification_preferences n on n.user_id = u.id
  where case p_kind
          when 'connection_request'     then coalesce(n.connection_request, true)
          when 'connection_accepted'    then coalesce(n.connection_accepted, true)
          when 'contact_needs_help'     then coalesce(n.contact_needs_help, true)
          when 'contact_message'        then coalesce(n.contact_message, true)
          when 'contact_not_responding' then coalesce(n.contact_not_responding, true)
          when 'drill_started'          then coalesce(n.drill_invites, true)
          when 'drill_ended'            then coalesce(n.drill_invites, true)
          else true
        end
  on conflict do nothing;

  get diagnostics encolados = row_count;
  return encolados;
end;
$$;

revoke execute on function private.enqueue_notifications(uuid[], text, text, text, jsonb, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Empezar
--
-- `p_group_id` va al final y con default para que la firma vieja siga
-- resolviendo: la build que está en revisión de App Store llama
-- `start_drill(drill_mode)` y no puede empezar a fallar desde el servidor.
--
-- 🔴 Y por eso se DROPEA la de un argumento antes de crear esta. `create or
-- replace` con un parámetro nuevo no reemplaza: **crea una sobrecarga**, y
-- quedarían dos `start_drill` con reglas de cupo distintas —la vieja contando
-- completados, esta contando iniciados— resolviendo según cuántos argumentos
-- mande cada build. Con el default, una sola función atiende a las dos.
-- ---------------------------------------------------------------------------
drop function if exists public.start_drill(text);

create or replace function public.start_drill(drill_mode text, p_group_id uuid default null)
returns public.drills
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  premium boolean;
  usados integer;
  result public.drills;
  participantes uuid[];
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if p_group_id is not null and not private.is_group_owner(p_group_id) then
    raise exception 'solo quien creó el grupo puede convocar un simulacro'
      using errcode = '42501';
  end if;

  -- Uno activo por grupo. Dos simulacros simultáneos sobre la misma gente no
  -- son un caso de uso: son dos avisos contradictorios en el mismo teléfono.
  if p_group_id is not null and exists (
    select 1 from public.drills d
    where d.group_id = p_group_id
      and d.completed_at is null
      and d.cancelled_at is null
      and d.ends_at > now()
  ) then
    raise exception 'ya hay un simulacro activo en este grupo' using errcode = '42501';
  end if;

  select is_premium into premium from public.user_settings where user_id = me;

  -- El cupo cuenta lo que CONVOCASTE: una fila por simulacro iniciado. Antes
  -- contaba `completed_at is not null`, y por eso se podía empezar y abandonar
  -- sin gastar nada.
  select count(*) into usados from public.drills where user_id = me;

  if not coalesce(premium, false) and usados >= 3 then
    raise exception 'limite_simulacros_free' using errcode = '42501';
  end if;

  -- Un simulacro propio que quedó abierto se cancela solo.
  update public.drills
     set cancelled_at = now()
   where user_id = me
     and completed_at is null
     and cancelled_at is null;

  insert into public.drills (user_id, mode, group_id)
  values (me, drill_mode, p_group_id)
  returning * into result;

  -- El contador visible pasa a significar «usados», no «completados».
  update public.user_settings
     set drills_completed = (select count(*) from public.drills where user_id = me)
   where user_id = me;

  if p_group_id is null then
    return result;
  end if;

  -- Los integrantes del grupo que no apagaron los simulacros. Quien lo apagó no
  -- entra: ni participa ni recibe el aviso.
  select coalesce(array_agg(m.member_id), '{}'::uuid[]) into participantes
  from public.group_members m
  left join public.notification_preferences n on n.user_id = m.member_id
  where m.group_id = p_group_id
    and coalesce(n.drill_invites, true);

  insert into public.drill_participants (drill_id, user_id)
  select result.id, u
  from unnest(array_append(participantes, me)) as u
  on conflict do nothing;

  perform private.enqueue_notifications(
    participantes,
    'drill_started',
    'Simulacro · ' || (select g.name from public.groups g where g.id = p_group_id),
    private.display_name_of(me) || ' inició un simulacro. NO es un sismo real. Abre la app para practicar.',
    jsonb_build_object('type', 'drill_started', 'drillId', result.id, 'groupId', p_group_id),
    'alerts'
  );

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · El simulacro que tengo encima ahora mismo
--
-- Devuelve como mucho una fila. `is_mine` es lo que decide qué botón se pinta:
-- el convocante ve «Cerrar para todos», el resto ve «Salir».
-- ---------------------------------------------------------------------------
create or replace function public.get_active_drill()
returns table (
  id uuid,
  mode text,
  group_id uuid,
  group_name text,
  started_by uuid,
  started_by_name text,
  is_mine boolean,
  started_at timestamptz,
  ends_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.mode,
    d.group_id,
    (select g.name from public.groups g where g.id = d.group_id),
    d.user_id,
    private.display_name_of(d.user_id),
    (d.user_id = (select auth.uid())),
    d.started_at,
    d.ends_at
  from public.drills d
  where d.completed_at is null
    and d.cancelled_at is null
    and d.ends_at > now()
    and (
      d.user_id = (select auth.uid())
      or exists (
        select 1 from public.drill_participants p
        where p.drill_id = d.id
          and p.user_id = (select auth.uid())
          and p.left_at is null
      )
    )
  order by d.started_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 6 · Salir
--
-- Una sola función para las dos cosas, porque desde la pantalla son un solo
-- botón que cambia de rótulo: quien convocó cierra para todos, el resto se va.
-- Tener dos RPC obligaría al cliente a decidir cuál llamar, y equivocarse ahí
-- sería dejar a alguien encerrado en un simulacro.
-- ---------------------------------------------------------------------------
create or replace function public.end_my_drill(p_drill_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  convocante uuid;
  grupo uuid;
  restantes uuid[];
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select d.user_id, d.group_id into convocante, grupo
  from public.drills d
  where d.id = p_drill_id
    and d.completed_at is null
    and d.cancelled_at is null;

  -- Sin fila viva no hay nada que hacer, y no es un error: pudo caducar solo, o
  -- el convocante pudo cerrarlo un segundo antes. El cliente ya salió del modo.
  if convocante is null then
    return;
  end if;

  if convocante = me then
    select coalesce(array_agg(p.user_id), '{}'::uuid[]) into restantes
    from public.drill_participants p
    where p.drill_id = p_drill_id and p.user_id <> me and p.left_at is null;

    update public.drills set completed_at = now() where id = p_drill_id;
    update public.drill_participants
       set left_at = now()
     where drill_id = p_drill_id and left_at is null;

    if grupo is not null then
      perform private.enqueue_notifications(
        restantes,
        'drill_ended',
        'Simulacro terminado',
        private.display_name_of(me) || ' cerró el simulacro. Ya puedes volver a lo tuyo.',
        jsonb_build_object('type', 'drill_ended', 'drillId', p_drill_id),
        'social'
      );
    end if;

    return;
  end if;

  -- Un participante solo se saca a sí mismo. El simulacro sigue para los demás.
  update public.drill_participants
     set left_at = now()
   where drill_id = p_drill_id and user_id = me and left_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7 · La audiencia del «necesito ayuda» de un simulacro
--
-- Antes: la red entera, si el modo era `notify`. Practicar con tu familia no
-- tiene por qué interrumpirle el día a los 24 contactos que no practican.
-- Ahora: **los participantes del simulacro**, y un simulacro individual no
-- avisa a nadie — que es lo que «privado» significa.
-- ---------------------------------------------------------------------------
-- El `when` de los dos disparadores ya filtra `status = 'needs_help'` y la
-- transición, así que acá no se vuelve a comprobar: se reemplaza el cuerpo y los
-- disparadores de la 0015 siguen igual.
create or replace function private.on_status_needs_help()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  circulo uuid[] := private.accepted_circle_of(new.user_id);
  audiencia uuid[];
begin
  if new.is_drill then
    -- Los compañeros de MI simulacro activo. `is_mine or soy participante`
    -- resuelto en el propio where, y con paréntesis: `and` liga más fuerte que
    -- `or`, y sin ellos esta consulta devolvería los participantes de cualquier
    -- simulacro que yo hubiera convocado alguna vez.
    select coalesce(array_agg(p.user_id), '{}'::uuid[]) into audiencia
    from public.drills d
    join public.drill_participants p
      on p.drill_id = d.id and p.left_at is null and p.user_id <> new.user_id
    where d.completed_at is null
      and d.cancelled_at is null
      and d.ends_at > now()
      and (
        d.user_id = new.user_id
        or exists (
          select 1 from public.drill_participants mp
          where mp.drill_id = d.id
            and mp.user_id = new.user_id
            and mp.left_at is null
        )
      );

    -- Un simulacro individual no tiene a quién avisarle, y eso es exactamente
    -- lo que «privado» significa. Ante la duda se calla: el daño de un falso
    -- «necesita ayuda» es mayor que el de un simulacro que no avisa.
    if coalesce(array_length(audiencia, 1), 0) = 0 then
      return new;
    end if;

    perform private.enqueue_notifications(
      audiencia,
      'contact_needs_help',
      'Simulacro · ' || nombre,
      'Está practicando y marcó que necesita ayuda. NO es una emergencia real.',
      jsonb_build_object('type', 'contact_needs_help', 'userId', new.user_id, 'isDrill', true),
      'alerts'
    );

    return new;
  end if;

  if array_length(circulo, 1) is null then
    return new;
  end if;

  perform private.enqueue_notifications(
    circulo,
    'contact_needs_help',
    nombre || ' necesita ayuda',
    'Marcó que necesita ayuda. Abre la app para ver dónde está.',
    jsonb_build_object('type', 'contact_needs_help', 'userId', new.user_id),
    'alerts'
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8 · `complete_drill` cuenta con la regla nueva
--
-- Ya no la llama el cliente nuevo —para salir está `end_my_drill`—, pero sigue
-- viva porque la build en revisión la usa. Lo que no puede hacer es recalcular
-- `drills_completed` con la regla vieja: dejaría el contador de la pantalla
-- diciendo un número y el cupo real del servidor otro.
-- ---------------------------------------------------------------------------
create or replace function public.complete_drill(
  drill_id uuid,
  status_reported text default null
)
returns public.drills
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result public.drills;
begin
  update public.drills
     set completed_at = now(),
         reported_status = status_reported
   where id = drill_id
     and user_id = me
     and completed_at is null
     and cancelled_at is null
  returning * into result;

  if result.id is null then
    raise exception 'simulacro no encontrado o ya cerrado' using errcode = '22023';
  end if;

  update public.user_settings
     set drills_completed = (select count(*) from public.drills where user_id = me)
   where user_id = me;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9 · Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.start_drill(text, uuid) from public, anon;
revoke execute on function public.get_active_drill() from public, anon;
revoke execute on function public.end_my_drill(uuid) from public, anon;

grant execute on function public.start_drill(text, uuid) to authenticated;
grant execute on function public.get_active_drill() to authenticated;
grant execute on function public.end_my_drill(uuid) to authenticated;
