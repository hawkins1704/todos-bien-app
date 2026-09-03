-- 0042 · «La más reciente» es la que existe, no la que ya se despachó.
--
-- ## Lo que se vio en dos teléfonos el 2026-09-02
--
-- Con un sismo sembrado y las dos apps abiertas, a las 20:45:00 salieron estos
-- dos avisos, cruzados:
--
--   → Renzo:  «Paolo Guerrero no responde — sismo de magnitud 5,5 en Pisco»
--   → Paolo:  «Renzo Arroyo no responde  — sismo de magnitud 5,5 en Pisco»
--
-- **Los dos habían reportado.** Y el aviso hablaba del sismo de las 19:42,
-- cuando el vigente era otro, de las 20:44.
--
-- Es el mismo fallo que la 0038 arregló, y de hecho es el que su propia
-- cabecera advierte:
--
--   «el "más reciente" se elige antes del filtro de los 20 minutos. Al revés
--    —filtrar primero, elegir después— un sismo nuevo que todavía no cumple
--    los 20 minutos queda fuera y el "más reciente" vuelve a ser el viejo, que
--    es exactamente el bug que esto arregla.»
--
-- La 0038 sacó el filtro de **tiempo** del CTE, que era la trampa que tenía
-- delante. Dejó `d.status = 'sent'`, que hace exactamente lo mismo por otra
-- puerta: descarta el sismo nuevo mientras su push está en la cola.
--
-- ## La ventana, medida
--
--   20:44:43  se inserta el sismo 2; el fan-out crea las entregas en `pending`
--   20:44:5x  las apps, abiertas, ven la alerta —`get_active_alert` NO mira el
--             estado del envío— y la captura automática reescribe `user_status`
--             apuntando al sismo 2. Con eso desaparece la prueba de que habían
--             contestado el 1.
--   20:45:00  corre `notify-silent-contacts`. El sismo 2 sigue en `pending`, así
--             que `ultima_alerta` elige el 1, de 62 minutos atrás. Busca la fila
--             de estado del sismo 1, no la encuentra, y concluye silencio.
--   20:45:12  `send_after` del sismo 2
--   20:46:00  recién ahí se despacha
--
-- La ventana es el jitter de `send_after` (hasta 30 s) más lo que falte para el
-- siguiente minuto del cron de envío: hasta ~90 segundos en los que el sismo
-- vigente es invisible para esta función. `notify-silent-contacts` corre cada 5
-- minutos, así que cae ahí una de cada tres veces y pico.
--
-- ## Por qué importa más que un aviso de más
--
-- Guardián se vende sobre que le creas. Un «no responde» falso sobre alguien
-- que sí contestó es la misma contradicción que la 0038 fue escrita para
-- eliminar: quien lo recibe no sabe cuál de los dos avisos vale, y a partir de
-- ahí no vale ninguno.
--
-- ## El arreglo
--
-- Una línea: `ultima_alerta` deja de filtrar por estado de envío. La pregunta
-- que responde es **«¿cuál es el sismo vigente de esta persona?»**, y un sismo
-- que ya entró al fan-out es su sismo vigente aunque el push siga en la cola —
-- su propia app ya se lo está mostrando.
--
-- El filtro de los 20 minutos sigue abajo y sigue haciendo su trabajo: una
-- entrega sin despachar tiene `sent_at` en NULL, y `NULL < now() - interval
-- '20 minutes'` es NULL, así que la fila no pasa. O sea que el sismo nuevo
-- ahora **gana** la elección de «más reciente» y **acto seguido** queda fuera
-- por no cumplir los 20 minutos, que es justo lo que tiene que pasar: sobre el
-- sismo de hace un minuto todavía no hay nada que decir, y sobre el anterior ya
-- no se puede decir nada.

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
    with ultima_alerta as (
      -- Una fila por persona: la alerta más reciente que le CORRESPONDE.
      --
      -- Sin filtro de tiempo y sin filtro de estado de envío, los dos a
      -- propósito (ver la cabecera). Lo que se elige acá es «cuál es su sismo
      -- de ahora», y eso lo decide el fan-out, no el despachador de push.
      select distinct on (d.user_id)
        d.user_id,
        d.quake_event_id,
        d.sent_at,
        q.magnitude,
        q.place,
        q.region
      from public.alert_deliveries d
      join public.quake_events q on q.id = d.quake_event_id
      where q.occurred_at > now() - interval '6 hours'
      order by d.user_id, q.occurred_at desc
    )
    select
      u.user_id as callado,
      u.quake_event_id,
      u.magnitude,
      u.place,
      u.region
    from ultima_alerta u
    left join public.user_status st
      on st.user_id = u.user_id and st.quake_event_id = u.quake_event_id
    -- Acá sí el tiempo, y acá sí el envío: `sent_at` es NULL mientras la entrega
    -- no salió, y `NULL <` da NULL, así que una alerta sin despachar no dispara
    -- nada. Es el mismo predicado cumpliendo las dos funciones.
    where u.sent_at < now() - interval '20 minutes'
      -- `unconfirmed` no es un reporte: es el valor con el que nace el sistema y
      -- el que deja la captura automática de ubicación. Nadie puede elegirlo —
      -- el selector de la app no lo ofrece. Ver 0037.
      and coalesce(st.status, 'unconfirmed') = 'unconfirmed'
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

select private.assert_notification_kinds_mapped();
