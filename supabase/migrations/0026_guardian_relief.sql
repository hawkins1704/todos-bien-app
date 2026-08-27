-- ===========================================================================
-- 0026 · El alivio después de la alarma
--
-- EL HUECO, encontrado probando con dos teléfonos el 2026-08-27:
--
--   20:36  Paolo → «estoy bien»        → aviso enviado
--   20:51  Paolo → «necesita ayuda»    → aviso enviado
--   21:00  Paolo → «necesita ayuda»    → aviso enviado
--   21:05  Paolo → «necesita ayuda»    → aviso enviado
--   21:05  Paolo → «estoy bien»        → SILENCIO
--
-- La clave de deduplicación era `guardian_safe:<sismo>:<persona>`: UNA sola por
-- sismo. El primer «está bien» la consumía, así que el «ya estoy bien» que
-- viene DESPUÉS de una alarma —el mensaje que más importa en todo el producto—
-- se descartaba en silencio.
--
-- Mientras tanto `contact_needs_help` no tiene clave ninguna y se repite cuatro
-- veces. La asimetría es exactamente al revés de lo que debería: la alarma
-- suena sin límite y el alivio suena una vez.
--
-- Es el fallo contra el que advierte la cabecera de 0022: «avisar que tembló
-- cerca de tu madre y nunca avisar que está bien». Acá era peor — te avisan
-- cuatro veces que necesita ayuda y ninguna que ya está bien.
--
-- LA REGLA NUEVA: se avisa al ENTRAR al grupo «está bien» desde fuera de él.
--
--   sin reportar  → safe/helping   avisa   (el cierre de siempre)
--   needs_help    → safe/helping   avisa   (el alivio, que faltaba)
--   safe          → helping        calla   (mismo grupo: no es novedad)
--   helping       → safe           calla   (idem)
--
-- Y la clave lleva el `reported_at`, así que cada reporte genuino pasa y un
-- reintento del mismo reporte se sigue deduplicando.
-- ===========================================================================
create or replace function private.on_status_safe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  destinatarios uuid[];
  titulo text;
  cuerpo text;
  estado_previo text;
  venia_de_alarma boolean;
begin
  -- Fuera de un sismo no hay nada que cerrar, y un simulacro no abre Guardián.
  if new.quake_event_id is null or new.is_drill then
    return new;
  end if;

  -- `old` solo existe en UPDATE. En INSERT no hay estado previo que comparar.
  estado_previo := case when tg_op = 'UPDATE' then old.status else null end;

  -- Moverse dentro del grupo «está bien» no es novedad para quien espera
  -- noticias: ya sabe que la persona está bien. Avisarlo otra vez es ruido, y
  -- el ruido a las 3 AM es lo que hace que se apaguen las notificaciones.
  if tg_op = 'UPDATE'
     and estado_previo in ('safe', 'helping')
     and old.quake_event_id is not distinct from new.quake_event_id then
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

  venia_de_alarma := estado_previo = 'needs_help';

  -- El alivio se redacta distinto a propósito. Quien recibe esto acaba de leer
  -- «necesita ayuda»: repetirle el mismo «está bien» de un cierre normal no le
  -- dice que la situación CAMBIÓ, que es justo lo que necesita saber.
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

  perform private.enqueue_notifications(
    destinatarios,
    'contact_is_safe',
    titulo,
    cuerpo,
    jsonb_build_object('type', 'contact_is_safe', 'userId', new.user_id),
    'alerts',
    -- El `reported_at` es lo que deja pasar un reporte nuevo y sigue frenando
    -- el reenvío del mismo. Sin él, un solo cierre por sismo — que es el bug.
    'guardian_safe:' || new.quake_event_id::text || ':' || new.user_id::text
      || ':' || extract(epoch from coalesce(new.reported_at, new.updated_at))::bigint::text
  );

  return new;
end;
$$;
