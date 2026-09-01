-- 0037 · «No reportó» no es lo mismo que «no tiene fila».
--
-- ## El agujero
--
-- `notify_silent_contacts` buscaba a los callados con un `left join ... where
-- st.user_id is null`: **quien no tiene fila de estado para ese sismo**. Pero
-- la app escribe una fila sin que la persona reporte nada — es
-- `captureLocationForActiveAlert`, que ante una alerta activa guarda dónde
-- estás sin esperar a que toques un botón, con `status = 'unconfirmed'` a
-- propósito para no contar como confirmada.
--
-- O sea que la fila existía y la persona no había dicho nada. Resultado:
-- **cuanto mejor funciona el teléfono de tu contacto, menos probable es que
-- Guardián te avise de su silencio.** La captura automática es justo lo que la
-- app hace bien; apagaba el aviso que se cobra.
--
-- Medido antes de tocar nada, con una transacción revertida sobre el sismo de
-- prueba: sin fila, 1 aviso; con la fila `unconfirmed` de la captura
-- automática, 0.
--
-- El contador «X/Y confirmados» ya sabía esto —exige `status <> 'unconfirmed'`
-- desde la 0025— y a esta función nunca se le enseñó. La regla, ahora en un
-- solo lugar: **`unconfirmed` no es un reporte.** No lo puede elegir nadie; el
-- selector de la app no lo ofrece, es el valor con el que nace el sistema.
--
-- ## El pariente que sigue abierto
--
-- Esta es la segunda forma en que «X no responde» se muere en silencio. La otra
-- es la deuda 1.14: a quien no tiene ningún dispositivo registrado, su entrega
-- le cierra como `no_token` y el filtro `d.status = 'sent'` de abajo lo deja
-- fuera. Las dos comparten la forma —el aviso no falla, simplemente nunca
-- ocurre— y por eso ninguna aparece en un error.

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
      -- 🔴 Acá estaba el agujero: era `st.user_id is null`. Sin fila y con fila
      -- `unconfirmed` significan lo mismo —no dijo nada—, y solo la primera
      -- contaba. `coalesce` cubre las dos con la misma frase.
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

-- La 0036 dejó esto como obligación de toda migración que toque el despachador.
-- Acá no se toca, pero llamarla es gratis y el día que alguien copie este
-- archivo como plantilla, la copia va a traerla puesta.
select private.assert_notification_kinds_mapped();
