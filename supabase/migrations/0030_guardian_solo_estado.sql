-- ===========================================================================
-- 0030 · Guardián se reduce a lo único que no se sustituye: el estado de tu gente
--
-- QUÉ SE QUITA: `notify_guardians` — el aviso «Tembló cerca de María» del
-- minuto 0, con nombre y distancia.
--
-- POR QUÉ. Dos motivos, y el segundo es el que decide:
--
--  1. **No se podía explicar.** Su valor dependía de una condición que la
--     persona no puede ver ni verificar —¿este sismo también me alcanzó a mí?—,
--     que a su vez depende del radio, de la magnitud mínima, de la magnitud
--     nacional y del `country_code`. Enunciarlo bien exigía leer cuatro
--     migraciones. Una función que no entra en una frase no se vende, y peor:
--     se recibe sin entender por qué llegó.
--
--  2. **Se volvió redundante.** Desde que la noticia nacional llega a todos sin
--     importar dónde esté la persona, cualquiera se entera de que hubo un sismo
--     M4,5+ en el Perú. «Tembló cerca de María» pasó a ser una versión más
--     precisa de algo que ya llegaba por el canal gratuito.
--
-- QUÉ SE QUEDA, y es lo único que ninguna noticia puede dar porque hace falta
-- saber quién es tu gente: **enterarte de qué pasó con ellos** — que reportaron,
-- o que no reportaron — aunque a ti el sismo no te haya tocado.
--
-- EL CORTE, ahora en una línea y sin asteriscos:
--
--   El sismo te alcanzó a ti  → gratis   (interruptor `contact_reported`)
--   El sismo NO te alcanzó    → premium  (interruptor `guardian_alerts`)
--
-- ⚠️ EL ANTECEDENTE, que es la condición para poder quitar la apertura.
-- La cabecera de 0022 advertía —con razón— que un «María está bien» a alguien
-- que nunca supo que tembló cerca de María es un sobresalto, no una
-- tranquilidad. Antes el antecedente lo daba el aviso de apertura. Ahora que no
-- existe, **el antecedente viaja dentro del propio mensaje**: todo aviso a quien
-- está fuera de la zona nombra el sismo (magnitud y lugar). Sin eso, esta
-- migración fabricaría exactamente la ansiedad contra la que 0022 advertía.
--
-- LO QUE NO SE TOCA: el valor `contact_in_quake_zone` sigue en el CHECK de
-- `notification_deliveries.kind`. Quitarlo invalidaría las filas ya escritas con
-- ese tipo. Deja de emitirse, que es lo que importa.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · El interruptor cambia de significado, así que cambia su comentario
--
-- Sigue llamándose `guardian_alerts` y sigue viviendo bajo el título «Guardián»
-- en Ajustes: renombrar la columna obligaría a tocar el cliente y los tipos sin
-- ganar nada. Lo que cambia es qué gobierna.
-- ---------------------------------------------------------------------------
comment on column public.notification_preferences.guardian_alerts is
  'Guardián: avisos sobre el estado de un contacto (reportó / no reportó) cuando el sismo NO me alcanzó a mí. Solo tiene efecto con premium. El caso contrario —el sismo también me alcanzó— es gratis y vive en `contact_reported`.';

-- ---------------------------------------------------------------------------
-- 2 · El antecedente, en un solo lugar
--
-- Se usa en los dos avisos que van hacia fuera de la zona. Vive acá y no
-- duplicado en cada disparador porque la regla de la cabecera —«todo aviso a
-- quien no sintió el sismo lo nombra»— tiene que ser imposible de olvidar al
-- agregar el tercero.
-- ---------------------------------------------------------------------------
create or replace function private.quake_reference(
  p_magnitude numeric,
  p_place text,
  p_region text
)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Coma decimal: "5.3" se lee como otra cosa en español (ESTADO §1.10).
  select 'Hubo un sismo de magnitud '
         || replace(to_char(p_magnitude, 'FM990.0'), '.', ',')
         || coalesce(
              ' en ' || nullif(btrim(coalesce(nullif(btrim(p_place), ''), p_region)), ''),
              ''
            )
         || '.';
$$;

revoke execute on function private.quake_reference(numeric, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3 · «X está bien» — las dos audiencias, sin depender de la apertura
--
-- El cambio real está en (b): antes los destinatarios salían de quién había
-- recibido el aviso de apertura (`dedupe_key = 'guardian:<sismo>'`). Sin
-- apertura, ese camino queda vacío y el aviso no llegaría nunca. Ahora se
-- calculan directo: el círculo, menos quienes recibieron alerta de este sismo.
--
-- Las dos audiencias siguen siendo mutuamente excluyentes por construcción —una
-- exige tener entrega de alerta y la otra exige no tenerla—, así que nadie
-- recibe el aviso dos veces.
-- ---------------------------------------------------------------------------
create or replace function private.on_status_safe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  q public.quake_events;
  circulo uuid[];
  en_zona uuid[];
  fuera_zona uuid[];
  titulo text;
  cuerpo text;
  cuerpo_fuera text;
  estado_previo text;
  venia_de_alarma boolean;
  clave text;
begin
  if new.quake_event_id is null or new.is_drill then
    return new;
  end if;

  estado_previo := case when tg_op = 'UPDATE' then old.status else null end;

  -- Moverse DENTRO del grupo «está bien» (de safe a helping, o viceversa) no es
  -- noticia: repetirlo a las 3 AM es el ruido que hace que alguien apague las
  -- notificaciones para siempre. Se avisa al ENTRAR al grupo (migración 0026).
  if tg_op = 'UPDATE'
     and estado_previo in ('safe', 'helping')
     and old.quake_event_id is not distinct from new.quake_event_id then
    return new;
  end if;

  circulo := private.accepted_circle_of(new.user_id);
  if array_length(circulo, 1) is null then
    return new;
  end if;

  select * into q from public.quake_events where id = new.quake_event_id;

  venia_de_alarma := estado_previo = 'needs_help';

  -- El alivio se redacta distinto a propósito (migración 0026): quien recibe
  -- esto acaba de leer «necesita ayuda», y necesita saber que la situación
  -- CAMBIÓ, no volver a leer el mismo texto de un cierre normal.
  if venia_de_alarma then
    titulo := nombre || ' ya está bien';
    cuerpo := case new.status
      when 'helping' then 'Cambió su estado: ya no necesita ayuda y está ayudando a otros.'
      else 'Cambió su estado: ya no necesita ayuda.'
    end;
  else
    titulo := nombre || ' está bien';
    cuerpo := case new.status
      when 'helping' then 'Reportó que está bien y está ayudando a otros.'
      else 'Reportó que está bien.'
    end;
  end if;

  -- El antecedente, solo para quien no sintió este sismo (ver cabecera).
  cuerpo_fuera := case
    when q.id is null then cuerpo
    else private.quake_reference(q.magnitude, q.place, q.region) || ' ' || cuerpo
  end;

  -- La clave lleva el instante del reporte para que el alivio posterior a una
  -- alarma no se descarte como repetido (migración 0026).
  clave := new.quake_event_id::text || ':' || new.user_id::text || ':'
           || extract(epoch from coalesce(new.reported_at, new.updated_at))::bigint::text;

  -- (a) EN ZONA — gratis, sin condición de plan: a quien el MISMO sismo también
  --     alcanzó. Cuando el sismo te toca a ti, la app funciona completa sin
  --     pagar (MONETIZACION.md §3, migración 0027).
  select coalesce(array_agg(d.user_id), '{}'::uuid[])
  into en_zona
  from public.alert_deliveries d
  where d.quake_event_id = new.quake_event_id
    and d.user_id = any (circulo);

  perform private.enqueue_notifications(
    en_zona, 'contact_reported', titulo, cuerpo,
    jsonb_build_object('type', 'contact_is_safe', 'userId', new.user_id),
    'alerts', 'en_zona_safe:' || clave
  );

  -- (b) FUERA DE ZONA — premium: a quien el sismo no alcanzó. Es lo que se
  --     compra, y lo único que no llega por ningún canal gratuito.
  --     El interruptor `guardian_alerts` lo aplica `enqueue_notifications` en la
  --     rama del tipo `contact_is_safe`.
  select coalesce(array_agg(s.user_id), '{}'::uuid[])
  into fuera_zona
  from public.user_settings s
  where s.user_id = any (circulo)
    and s.is_premium
    and not exists (
      select 1 from public.alert_deliveries d
      where d.quake_event_id = new.quake_event_id
        and d.user_id = s.user_id
    );

  perform private.enqueue_notifications(
    fuera_zona, 'contact_is_safe', titulo, cuerpo_fuera,
    jsonb_build_object('type', 'contact_is_safe', 'userId', new.user_id),
    'alerts', 'fuera_zona_safe:' || clave
  );

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4 · «X no responde» — la otra mitad del par
--
-- Hasta ahora solo llegaba a quien tenía entrega de alerta de ESE sismo
-- (migración 0020, que lo acotó por una razón que sigue siendo válida: sin ese
-- filtro, «no responde... desde el sismo» le llegaba a gente para la que «el
-- sismo» no existía). El antecedente en el cuerpo resuelve ahora ese mismo
-- problema para quien está fuera, así que la audiencia se puede ampliar sin
-- reintroducir el fallo.
--
-- DOS INTERRUPTORES gobiernan este aviso para quien está fuera de la zona:
-- `guardian_alerts` (que se filtra acá) y `contact_not_responding` (que aplica
-- `enqueue_notifications` para todos). Es a propósito: el primero decide si
-- quieres saber de sismos que no te tocaron, el segundo si quieres saber de
-- silencios. Apagar cualquiera de los dos silencia este aviso.
-- ---------------------------------------------------------------------------
create or replace function private.notify_silent_contacts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  circulo uuid[];
  destinatarios uuid[];
  cuerpo text;
  total integer := 0;
begin
  for fila in
    select distinct
      d.user_id as callado,
      d.quake_event_id,
      q.magnitude,
      q.place,
      q.region
    from public.alert_deliveries d
    join public.quake_events q on q.id = d.quake_event_id
    left join public.user_status st
      on st.user_id = d.user_id and st.quake_event_id = d.quake_event_id
    where d.status = 'sent'
      and d.sent_at < now() - interval '20 minutes'
      and q.occurred_at > now() - interval '6 hours'
      and st.user_id is null
  loop
    circulo := private.accepted_circle_of(fila.callado);
    if array_length(circulo, 1) is null then
      continue;
    end if;

    -- Del círculo: los que recibieron alerta de ESTE sismo (gratis), más los
    -- premium con Guardián encendido que no la recibieron.
    select coalesce(array_agg(s.user_id), '{}'::uuid[])
    into destinatarios
    from public.user_settings s
    left join public.notification_preferences n on n.user_id = s.user_id
    where s.user_id = any (circulo)
      and (
        exists (
          select 1 from public.alert_deliveries d2
          where d2.quake_event_id = fila.quake_event_id
            and d2.user_id = s.user_id
        )
        or (s.is_premium and coalesce(n.guardian_alerts, true))
      );

    cuerpo := private.quake_reference(fila.magnitude, fila.place, fila.region)
              || ' No reportó cómo está. Quizá quieras escribirle.';

    total := total + private.enqueue_notifications(
      destinatarios,
      'contact_not_responding',
      private.display_name_of(fila.callado) || ' no responde',
      cuerpo,
      jsonb_build_object('type', 'contact_not_responding', 'userId', fila.callado),
      'alerts',
      'not_responding:' || fila.quake_event_id::text || ':' || fila.callado::text
    );
  end loop;

  return total;
end;
$$;

revoke execute on function private.notify_silent_contacts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5 · El reparto deja de llamar a Guardián
--
-- Idéntica a la de 0022 salvo por la línea que falta. `notify_quake_news` sigue
-- después del INSERT en `alert_deliveries` porque lee esas filas para excluir a
-- quien ya recibió alerta.
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

  perform private.notify_quake_news(q.id);

  update public.quake_events set fanned_out_at = now() where id = q.id;

  return encolados;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6 · Fuera el aviso de apertura
--
-- Se elimina la función, no se deja apagada: una función viva que nadie llama
-- es una que alguien vuelve a enganchar sin leer por qué se había desenganchado.
-- El código completo sigue en `0022_guardian_alerts.sql` §5 si alguna vez se
-- quiere reponer.
-- ---------------------------------------------------------------------------
drop function if exists private.notify_guardians(uuid);
