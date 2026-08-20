-- ============================================================================
-- 0016 · Qué simulacro gobierna un reporte
--
-- Corrección de 0015 §5.3, encontrada por su propia prueba.
--
-- El simulacro que decide si el círculo recibe aviso es **el que está en
-- curso**, no simplemente el último que empezó. La versión de 0015 ordenaba
-- solo por `started_at desc`, y cuando dos simulacros comparten instante no
-- había con qué desempatar.
--
-- Lo destapó la aserción del simulacro con aviso: dentro de una transacción
-- `now()` devuelve la hora de la **transacción**, así que los dos simulacros
-- que insertaba la prueba quedaban con el mismo `started_at` al microsegundo y
-- ganaba cualquiera. Salió 0 donde tenía que salir 1.
--
-- En producción dos simulacros al mismo microsegundo son improbables, pero
-- "improbable" acá significa una de dos cosas feas: mandarle a todo un círculo
-- un «necesita ayuda» que la persona pidió que fuera silencioso, o callar uno
-- que pidió que se avisara. Las dos rompen una promesa escrita en la pantalla
-- de simulacro.
-- ============================================================================
create or replace function private.on_status_needs_help()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  modo text;
  circulo uuid[] := private.accepted_circle_of(new.user_id);
begin
  if array_length(circulo, 1) is null then
    return new;
  end if;

  if new.is_drill then
    select d.mode into modo
    from public.drills d
    where d.user_id = new.user_id
      and d.cancelled_at is null
      and d.started_at > now() - interval '2 hours'
    -- Un simulacro sin terminar gana sobre uno ya cerrado, sin importar la hora.
    order by (d.completed_at is null) desc, d.started_at desc
    limit 1;

    -- Silencioso, o sin simulacro que lo respalde: no se manda nada. Ante la
    -- duda se calla, porque el daño de un falso «necesita ayuda» es mayor que
    -- el de un simulacro que no avisa.
    if coalesce(modo, 'silent') <> 'notify' then
      return new;
    end if;

    perform private.enqueue_notifications(
      circulo,
      'contact_needs_help',
      'Simulacro · ' || nombre,
      'Está practicando y marcó que necesita ayuda. NO es una emergencia real.',
      jsonb_build_object('type', 'contact_needs_help', 'userId', new.user_id, 'isDrill', true),
      'alerts'
    );

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
