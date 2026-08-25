-- ===========================================================================
-- 0022 · Guardián: enterarse cuando tiembla donde está tu gente
--
-- El hueco que cierra, y que es el producto entero de Premium
-- (docs/MONETIZACION.md §3.1):
--
--   Son las 3 AM en Madrid. Tiembla M6,8 en Lima. Tu mamá está ahí.
--   Hoy no te llega NADA hasta el minuto 20, y solo si ella no reporta.
--
-- El reparto de alertas mira **solo la posición propia** (`quake_applies`), así
-- que quien está lejos no recibe nada aunque medio círculo esté en la zona. Lo
-- único que existía era `notify_silent_contacts` (0015), que avisa a los 20
-- minutos y solo cuando alguien se quedó callado.
--
-- Ese corte se mantiene y es lo que hace legítimo cobrar por esto:
--
--   Gratis  → «María no responde». La señal de que algo salió MAL.
--   Premium → el minuto 0 y el cierre. Acompañar el evento.
--
-- Nadie queda menos seguro por no pagar: quien está en el sismo recibe la misma
-- alerta y reporta igual.
--
-- DOS AVISOS, NO UNO. `contact_in_quake_zone` sin `contact_is_safe` es una
-- máquina de fabricar ansiedad: se avisa que tembló cerca de tu madre y nunca
-- se avisa que está bien. Van juntos o no va ninguno, y por eso están en la
-- misma migración y bajo el MISMO interruptor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Los dos tipos nuevos
-- ---------------------------------------------------------------------------
alter table public.notification_deliveries
  drop constraint notification_deliveries_kind_check,
  add constraint notification_deliveries_kind_check check (
    kind = any (array[
      'connection_request', 'connection_accepted', 'contact_needs_help',
      'contact_message', 'contact_not_responding',
      'quake_national', 'quake_worldwide',
      'contact_in_quake_zone', 'contact_is_safe'
    ])
  );

-- ---------------------------------------------------------------------------
-- 2 · Un solo interruptor para los dos
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column guardian_alerts boolean not null default true;

comment on column public.notification_preferences.guardian_alerts is
  'Guardián: «tembló cerca de un contacto» y su cierre «ya reportó». Un solo interruptor para los dos tipos a propósito — poder apagar el cierre y no la mala noticia dejaría al usuario con la mitad ansiosa del par. Solo tiene efecto con premium.';

grant select (guardian_alerts),
      insert (guardian_alerts),
      update (guardian_alerts)
  on public.notification_preferences to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · La compuerta de preferencias aprende los dos tipos
--
-- Mismo principio que 0015 y 0021: el chequeo vive en UN solo lugar para que
-- ningún disparador nuevo se pueda olvidar de hacerlo.
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_notifications(
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_channel text default 'social'::text,
  p_dedupe_key text default null::text
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
          when 'quake_national'         then coalesce(n.quake_national, true)
          when 'quake_worldwide'        then coalesce(n.quake_worldwide, true)
          -- Los dos de Guardián comparten interruptor (ver §2).
          when 'contact_in_quake_zone'  then coalesce(n.guardian_alerts, true)
          when 'contact_is_safe'        then coalesce(n.guardian_alerts, true)
          else true
        end
  on conflict do nothing;

  get diagnostics encolados = row_count;
  return encolados;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 · Enumerar nombres como los diría una persona
--
-- «María, Jorge y 3 más» y no «María, Jorge, Ana, Luis, Rosa», que no entra en
-- una notificación y se corta en cualquier lado.
-- ---------------------------------------------------------------------------
create or replace function private.name_list(p_names text[], p_max integer default 2)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_names is null or array_length(p_names, 1) is null then ''
    when array_length(p_names, 1) = 1 then p_names[1]
    when array_length(p_names, 1) = 2 then p_names[1] || ' y ' || p_names[2]
    when array_length(p_names, 1) = 3 then p_names[1] || ', ' || p_names[2] || ' y ' || p_names[3]
    else array_to_string(p_names[1:p_max], ', ')
         || ' y ' || (array_length(p_names, 1) - p_max)::text || ' más'
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · El aviso del minuto 0
--
-- TRES REGLAS DE HONESTIDAD, que son lo que separa esto de vender humo:
--
-- a) **Solo contactos con coordenadas conocidas.** Alguien sin ubicación puede
--    haber recibido la alerta por la regla NACIONAL (magnitud ≥ 6 en su país),
--    y de ese no sabemos si estaba cerca: sabemos que está en el país. Decir
--    «tembló cerca de María» sin dato sería exactamente el tipo de afirmación
--    que este proyecto ya tuvo que retirar cuatro veces.
--
-- b) **Y encima, distancia real dentro de SU radio.** El mismo caso nacional
--    alcanza a gente con coordenadas a 900 km. Se usa el `alert_radius_km` de
--    la persona afectada, no una constante nueva: es, por su propia definición,
--    lo que ella considera «cerca mío».
--
-- c) **La distancia va siempre en el texto.** Un número verificable en el
--    cuerpo del aviso es lo que impide que el título se vuelva una exageración.
--
-- Y una exclusión: a quien recibió alerta por este mismo sismo NO se le manda.
-- Ya está en modo emergencia, y su pantalla de círculo hace justo esto. Es el
-- mismo criterio con el que `notify_quake_news` evita el aviso doble.
-- ---------------------------------------------------------------------------
create or replace function private.notify_guardians(p_quake_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quake_events;
  fila record;
  magnitud text;
  titulo text;
  cuerpo text;
  total integer := 0;
begin
  select * into q from public.quake_events where id = p_quake_id;
  if not found or q.canonical_id is not null then
    return 0;
  end if;

  -- Coma decimal: "6.7" se lee como otra cosa en español (§1.10).
  magnitud := replace(to_char(q.magnitude, 'FM990.0'), '.', ',');

  for fila in
    with afectados as (
      -- Quien recibió alerta por este sismo, tiene posición conocida, y esa
      -- posición está de verdad cerca del epicentro (reglas a y b).
      select
        d.user_id,
        private.display_name_of(d.user_id) as nombre,
        greatest(1, round(public.distance_km(
          st.latitude, st.longitude, q.latitude, q.longitude
        )))::integer as km
      from public.alert_deliveries d
      join public.user_status st on st.user_id = d.user_id
      join public.user_settings s on s.user_id = d.user_id
      where d.quake_event_id = q.id
        and st.latitude is not null
        and st.longitude is not null
        and public.distance_km(st.latitude, st.longitude, q.latitude, q.longitude)
              <= s.alert_radius_km
    ),
    pares as (
      -- Cada afectado × cada persona de su círculo aceptado. `accepted_circle_of`
      -- solo devuelve `status = 'accepted'`, así que los bloqueados de 0021
      -- quedan fuera solos.
      select a.user_id as afectado, a.nombre, a.km, c.destinatario
      from afectados a
      cross join lateral unnest(private.accepted_circle_of(a.user_id)) as c(destinatario)
    )
    select
      p.destinatario,
      count(*)::integer as cuantos,
      array_agg(p.nombre order by p.km) as nombres,
      min(p.km) as km_min,
      min(p.afectado::text) as afectado_unico
    from pares p
    join public.user_settings s on s.user_id = p.destinatario
    where s.is_premium
      and not exists (
        select 1 from afectados a2 where a2.user_id = p.destinatario
      )
    group by p.destinatario
  loop
    if fila.cuantos = 1 then
      titulo := 'Tembló cerca de ' || fila.nombres[1];
      cuerpo := 'Sismo de magnitud ' || magnitud || ', a ' || fila.km_min
                || ' km de donde está. Te avisamos apenas reporte cómo está.';
    else
      titulo := 'Tembló cerca de ' || fila.cuantos || ' de tus contactos';
      cuerpo := private.name_list(fila.nombres) || ' están en la zona del sismo de magnitud '
                || magnitud || '. Te avisamos a medida que reporten.';
    end if;

    total := total + private.enqueue_notifications(
      array[fila.destinatario],
      'contact_in_quake_zone',
      titulo,
      cuerpo,
      jsonb_build_object(
        'type', 'contact_in_quake_zone',
        'quakeEventId', q.id,
        -- Con un solo afectado se abre su ficha; con varios, el círculo.
        'userId', case when fila.cuantos = 1 then fila.afectado_unico else null end
      ),
      'alerts',
      -- Una sola por (sismo, destinatario), aunque tenga cinco contactos en la
      -- zona: son cinco líneas de un mismo aviso, no cinco avisos.
      'guardian:' || q.id::text
    );
  end loop;

  return total;
end;
$$;

revoke execute on function private.notify_guardians(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6 · El cierre: «ya reportó»
--
-- Hoy `on_status_needs_help` es el ÚNICO aviso de estado que existe: marcar
-- «estoy bien» no notifica a nadie. Para el que está lejos, ese silencio es
-- justamente lo que lo deja mirando el teléfono.
--
-- A quién se le manda: **exactamente a quien recibió el aviso de apertura**.
-- No a todo el círculo premium. Un «María está bien» a alguien que nunca supo
-- que tembló cerca de María es un sobresalto, no una tranquilidad. Por eso el
-- destinatario sale de `notification_deliveries` con la clave de Guardián: si
-- no hubo apertura, no hay cierre.
-- ---------------------------------------------------------------------------
create or replace function private.on_status_safe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  destinatarios uuid[];
  cuerpo text;
begin
  -- Fuera de un sismo no hay nada que cerrar, y un simulacro no abre Guardián.
  if new.quake_event_id is null or new.is_drill then
    return new;
  end if;

  select coalesce(array_agg(nd.user_id), '{}'::uuid[])
  into destinatarios
  from public.notification_deliveries nd
  join public.user_settings s on s.user_id = nd.user_id
  where nd.dedupe_key = 'guardian:' || new.quake_event_id::text
    and s.is_premium
    and nd.user_id = any (private.accepted_circle_of(new.user_id));

  if array_length(destinatarios, 1) is null then
    return new;
  end if;

  cuerpo := case new.status
    when 'helping' then 'Reportó que está bien y está ayudando a otros.'
    else 'Reportó que está bien.'
  end;

  perform private.enqueue_notifications(
    destinatarios,
    'contact_is_safe',
    nombre || ' está bien',
    cuerpo,
    jsonb_build_object('type', 'contact_is_safe', 'userId', new.user_id),
    'alerts',
    'guardian_safe:' || new.quake_event_id::text || ':' || new.user_id::text
  );

  return new;
end;
$$;

-- Dos disparadores por el mismo motivo que en 0015: Postgres prohíbe nombrar
-- `old` en el `when` de un INSERT, y el `when` del UPDATE es lo que evita
-- repetir el aviso cuando la fila se reescribe (una ubicación que llega
-- después, por ejemplo).
drop trigger if exists status_safe_notify on public.user_status;
create trigger status_safe_notify
  after insert on public.user_status
  for each row
  when (new.status in ('safe', 'helping'))
  execute function private.on_status_safe();

drop trigger if exists status_safe_notify_update on public.user_status;
create trigger status_safe_notify_update
  after update on public.user_status
  for each row
  when (
    new.status in ('safe', 'helping')
    and (
      old.status is distinct from new.status
      or old.quake_event_id is distinct from new.quake_event_id
    )
  )
  execute function private.on_status_safe();

-- ---------------------------------------------------------------------------
-- 7 · Engancharlo donde se reparten las alertas
--
-- Después del INSERT en `alert_deliveries`, porque lee justamente esas filas
-- para saber a quién le tembló cerca.
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

  -- Los dos leen `alert_deliveries`, así que van después de escribirlas:
  -- Guardián para saber a quién le tembló cerca, la noticia para excluir a
  -- quien ya recibió alerta.
  perform private.notify_guardians(q.id);
  perform private.notify_quake_news(q.id);

  update public.quake_events set fanned_out_at = now() where id = q.id;

  return encolados;
end;
$$;
