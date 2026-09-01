-- 0038 · «No responde» es una pregunta sobre el sismo de AHORA.
--
-- ## Lo que se vio en dos teléfonos el 2026-09-01
--
-- A la misma persona, sobre el mismo sismo, con ocho minutos de diferencia:
--
--   20:01:59  «Paolo Guerrero está bien»    — magnitud 5,5
--   20:10:00  «Paolo Guerrero no responde»  — magnitud 5,5
--
-- Guardián se contradijo solo. Para una función cuyo valor entero es que le
-- creas, no hay resultado peor: el que la recibe no sabe cuál de los dos avisos
-- vale, y a partir de ahí ninguno vale.
--
-- ## Por qué pasaba
--
-- `user_status` tiene **una fila por persona**: el estado actual, no un
-- historial. Paolo contestó el sismo #1. Llegó el #2, la captura automática le
-- sobrescribió la fila apuntando al #2, y con eso **desapareció la prueba de
-- que había contestado el #1**. El cron seguía preguntando por el #1 —su
-- entrega ya tenía más de 20 minutos— y al no encontrar fila concluyó silencio.
--
-- No lo introdujo la 0037: con la condición anterior (`st.user_id is null`) el
-- join fallaba igual y el falso aviso salía igual. La 0037 solo lo destapó, al
-- hacer que la función volviera a disparar seguido.
--
-- ## La corrección, que es de sentido y no de SQL
--
-- Con una tabla de estado actual, «¿contestó el sismo X?» **solo se puede
-- responder sobre el sismo vigente**. De los anteriores no queda registro, así
-- que preguntar por ellos es pedirle a los datos algo que no tienen — y lo que
-- devuelven en ese caso no es «no contestó», es «no sé».
--
-- Entonces: de cada persona se mira **su alerta más reciente**, y nada más. Si
-- esa lleva más de 20 minutos y sigue sin contestar, se avisa. Las anteriores
-- no se revisitan, y no se pierde nada: mientras cada una fue la más reciente,
-- tuvo su turno.
--
-- Ojo con el orden de las condiciones, que es donde estuvo la tentación de
-- equivocarse: el «más reciente» se elige **antes** del filtro de los 20
-- minutos. Al revés —filtrar primero, elegir después— un sismo nuevo que
-- todavía no cumple los 20 minutos queda fuera y el «más reciente» vuelve a ser
-- el viejo, que es exactamente el bug que esto arregla.

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
      -- Una fila por persona: la alerta más reciente que le llegó de verdad.
      -- Sin filtro de tiempo acá a propósito (ver la nota de arriba).
      select distinct on (d.user_id)
        d.user_id,
        d.quake_event_id,
        d.sent_at,
        q.magnitude,
        q.place,
        q.region
      from public.alert_deliveries d
      join public.quake_events q on q.id = d.quake_event_id
      where d.status = 'sent'
        and q.occurred_at > now() - interval '6 hours'
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
