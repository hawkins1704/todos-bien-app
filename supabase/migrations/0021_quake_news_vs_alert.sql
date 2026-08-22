-- ============================================================================
-- 0021 · Separar la ALERTA de la NOTICIA
--
-- Son dos cosas distintas y estaban mezcladas en una sola tubería:
--
--   ALERTA    → "tembló cerca tuyo": pone la app en modo emergencia, dispara el
--               push silencioso que captura tu ubicación, activa el contador
--               "X/Y confirmados" y, si no reportás, avisa a tu círculo.
--   NOTICIA   → "hubo un sismo": informativo. No activa nada.
--
-- El M6,7 del mar de Scotia (§1.13.5) mostró el costo de mezclarlas: un sismo a
-- 5.887 km puso la app de un usuario premium en modo emergencia y terminó
-- mandándole a sus contactos "no responde... desde el sismo".
--
-- Modelo nuevo:
--
--   ALERTA    → cercanía (radio + magnitud mínima) o magnitud nacional.
--               **Idéntica para free y premium.** El premium no compra alertas.
--   NOTICIA   → free: sismos de su país. Premium: los de su país y los del
--               mundo. Con interruptor propio cada una, y sin doble aviso: a
--               quien el sismo ya le disparó una ALERTA no le llega la noticia.
--
-- Umbrales, medidos sobre esta misma base a 7 días:
--   nacional ≥ 4,5 → 3 por semana   (23 sismos peruanos en total; ≥4,0 daría 10)
--   mundial  ≥ 6,0 → 3 por semana
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La regla de ALERTA deja de mirar si sos premium
-- ---------------------------------------------------------------------------
create or replace function private.quake_applies(
  p_is_premium boolean,
  p_worldwide_enabled boolean,
  p_country_code text,
  p_radius_km integer,
  p_min_magnitude numeric,
  p_countrywide_magnitude numeric,
  p_lat double precision,
  p_lon double precision,
  q_magnitude numeric,
  q_country_code text,
  q_lat double precision,
  q_lon double precision
)
returns boolean
language sql
immutable parallel safe
set search_path = ''
as $$
  -- `p_is_premium` y `p_worldwide_enabled` se conservan en la firma para no
  -- romper a los seis llamadores, pero YA NO SE USAN: una alerta es una
  -- emergencia y no se compra. Lo mundial vive ahora en `notify_quake_news()`.
  --
  -- El `coalesce` y los `is not null` no son decoración. Un sismo en mar
  -- abierto llega con `country_code` NULL —el del mar de Scotia, sin ir más
  -- lejos—, y `NULL = 'PE'` es NULL, no false. La versión sin blindar devolvía
  -- NULL: en un WHERE se comporta como false y no rompe nada, pero cualquier
  -- llamador que escriba `not quake_applies(...)` recibiría NULL y el filtro
  -- se caería en silencio.
  select coalesce(
    (q_country_code is not null
      and p_country_code is not null
      and q_country_code = p_country_code
      and q_magnitude >= p_countrywide_magnitude)
    or (
      p_lat is not null
      and q_magnitude >= p_min_magnitude
      and public.distance_km(p_lat, p_lon, q_lat, q_lon) <= p_radius_km
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- 2 · Los dos interruptores nuevos
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column quake_national boolean not null default true,
  add column quake_worldwide boolean not null default true;

comment on column public.notification_preferences.quake_national is
  'Noticias de sismos en el país de la persona que NO le dispararon una alerta.';
comment on column public.notification_preferences.quake_worldwide is
  'Noticias de sismos grandes en el resto del mundo. Solo tiene efecto con premium.';

grant select (quake_national, quake_worldwide),
      insert (quake_national, quake_worldwide),
      update (quake_national, quake_worldwide)
  on public.notification_preferences to authenticated;

alter table public.notification_deliveries
  drop constraint notification_deliveries_kind_check,
  add constraint notification_deliveries_kind_check check (
    kind = any (array[
      'connection_request', 'connection_accepted', 'contact_needs_help',
      'contact_message', 'contact_not_responding',
      'quake_national', 'quake_worldwide'
    ])
  );

-- Canal propio. En Android eso es una categoría que la persona puede silenciar
-- desde los ajustes del sistema sin tocar las alertas de sismo, que es
-- justamente la distinción que esta migración existe para hacer.
alter table public.notification_deliveries
  drop constraint notification_deliveries_channel_check,
  add constraint notification_deliveries_channel_check check (
    channel = any (array['alerts', 'messages', 'social', 'quakes'])
  );

-- ---------------------------------------------------------------------------
-- 3 · La compuerta de preferencias aprende los dos tipos nuevos
--
-- Se mantiene el principio de 0015: el chequeo vive en UN solo lugar, para que
-- un disparador nuevo no se pueda olvidar de hacerlo.
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
          else true
        end
  on conflict do nothing;

  get diagnostics encolados = row_count;
  return encolados;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 · La noticia
-- ---------------------------------------------------------------------------
create or replace function private.notify_quake_news(p_quake_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  q public.quake_events;
  titulo text;
  cuerpo text;
  lugar text;
  destinatarios uuid[];
  clave text;
  total integer := 0;
begin
  select * into q from public.quake_events where id = p_quake_id;
  if not found or q.canonical_id is not null then
    return 0;
  end if;

  lugar := coalesce(nullif(btrim(q.place), ''), nullif(btrim(q.region), ''));

  -- Coma decimal: "6.7" se lee como otra cosa en español (§1.10).
  titulo := 'Sismo de magnitud ' || replace(to_char(q.magnitude, 'FM990.0'), '.', ',');
  cuerpo := coalesce(lugar || '.', 'Sin ubicación precisa.');

  -- Una sola clave para los dos tipos: el índice único es (user_id,
  -- dedupe_key), así que si alguien calificara por las dos vías solo entra una.
  clave := 'quake_news:' || q.id::text;

  -- NACIONAL · sismos del país de la persona que NO le dispararon alerta.
  if q.country_code is not null and q.magnitude >= 4.5 then
    select coalesce(array_agg(s.user_id), '{}'::uuid[])
    into destinatarios
    from public.user_settings s
    where s.onboarding_completed_at is not null
      and s.country_code = q.country_code
      -- La exclusión que evita el doble aviso. A quien le tembló cerca ya le
      -- llegó la alerta; contarle la noticia sería decírselo dos veces.
      and not exists (
        select 1 from public.alert_deliveries d
        where d.quake_event_id = q.id and d.user_id = s.user_id
      );

    total := total + private.enqueue_notifications(
      destinatarios, 'quake_national', titulo, cuerpo,
      jsonb_build_object('type', 'quake_news', 'quakeEventId', q.id),
      'quakes', clave
    );
  end if;

  -- MUNDIAL · solo premium, y solo lo grande.
  if q.magnitude >= 6.0 then
    select coalesce(array_agg(s.user_id), '{}'::uuid[])
    into destinatarios
    from public.user_settings s
    where s.onboarding_completed_at is not null
      and s.is_premium
      and s.country_code is distinct from q.country_code
      and not exists (
        select 1 from public.alert_deliveries d
        where d.quake_event_id = q.id and d.user_id = s.user_id
      );

    total := total + private.enqueue_notifications(
      destinatarios, 'quake_worldwide', titulo, cuerpo,
      jsonb_build_object('type', 'quake_news', 'quakeEventId', q.id),
      'quakes', clave
    );
  end if;

  return total;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5 · Engancharla donde ya se reparten las alertas
--
-- Va dentro de `fan_out_quake()` y no en un cron aparte: así la noticia sale en
-- la MISMA transacción que la ingesta, sin agregar ni una invocación de edge
-- function, igual que el fan-out inmediato de §1.13.4.
--
-- Idempotente por `dedupe_key`, que es lo que permite que el cron de repesca
-- vuelva a llamar a esta función sobre un sismo corregido sin duplicar avisos.
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

  -- Después de las alertas, no antes: la noticia excluye a quien ya recibió
  -- una, así que necesita esas filas ya escritas para poder mirarlas.
  perform private.notify_quake_news(q.id);

  update public.quake_events set fanned_out_at = now() where id = q.id;

  return encolados;
end;
$$;
