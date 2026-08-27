-- ===========================================================================
-- 0025 · El círculo distingue a quién le llegó la alerta
--
-- EL HUECO: el servidor y la pantalla no decían lo mismo.
--
-- `notify_silent_contacts` (0015, afinada en 0020) ya decidió que a quien el
-- sismo NO alcanzó está fuera del asunto: los destinatarios de «X no responde»
-- salen de `alert_deliveries` de ESE sismo, así que nunca se avisa por alguien
-- que jamás fue alertado.
--
-- La Home no tenía ese filtro. `effectiveStatus` marca «sin confirmar» a todo
-- el que no haya reportado para el sismo activo, sin preguntar si alguna vez le
-- pidieron reportar. Y el contador usa `accepted.length` de denominador, o sea
-- el círculo entero.
--
-- Resultado: un contacto a 265 km, al que la alerta nunca le llegó, aparece
-- como si estuviera callado. No es un caso raro — es el caso NORMAL en cuanto
-- alguien del círculo vive en otra ciudad. Y le pega justo a quien le vendemos
-- Guardián, que es precisamente el que tiene familia lejos.
--
-- LA SOLUCIÓN: el cliente necesita saber a quién le llegó cada sismo. Hoy no
-- puede: `alert_deliveries` tiene RLS activo y CERO políticas, así que
-- `authenticated` no lee ni una fila (correcto, y no se toca).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · La ventana de alertas del círculo propio
--
-- `security definer` porque `alert_deliveries` es ilegible para `authenticated`
-- y así debe seguir. Es seguro **por construcción**, no por disciplina de quien
-- la use: no recibe parámetros. El usuario sale de `auth.uid()` y el alcance de
-- `accepted_circle_of`, así que quien la llame solo puede obtener su propio
-- círculo — no hay argumento que manipular para espiar a un tercero.
--
-- Solo aceptados: a una solicitud pendiente no se le ve el estado, y menos
-- todavía qué sismos la alcanzaron.
--
-- Las 6 horas son la misma ventana de `get_active_alert` y de
-- `ACTIVE_ALERT_WINDOW_MS` en el cliente. Fuera de ahí no hay alerta activa que
-- contrastar, así que traer más filas sería peso muerto.
-- ---------------------------------------------------------------------------
create or replace function public.get_circle_alert_scope()
returns table (user_id uuid, quake_event_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id, d.quake_event_id
  from public.alert_deliveries d
  join public.quake_events q on q.id = d.quake_event_id
  where q.occurred_at > now() - interval '6 hours'
    and d.user_id = any (private.accepted_circle_of((select auth.uid())));
$$;

revoke execute on function public.get_circle_alert_scope() from public, anon;
grant execute on function public.get_circle_alert_scope() to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · `get_circle` devuelve los sismos que alcanzaron a cada contacto
--
-- Hay que DROP y CREATE porque cambia el tipo de retorno, que
-- `create or replace` no admite. Se recrea idéntica salvo la columna nueva.
--
-- ⚠️ El `c.status in ('pending', 'accepted')` del final NO es decorativo: es lo
-- que deja fuera a los bloqueados de 0021. Se ha estado a punto de perder cada
-- vez que esta función se recrea.
--
-- Sigue siendo `security invoker`: el alcance de las filas lo pone RLS, y el
-- único dato que RLS no dejaba ver se pide a la función de arriba, que trae
-- solo lo del círculo propio.
-- ---------------------------------------------------------------------------
drop function if exists public.get_circle();

create function public.get_circle()
returns table (
  connection_id uuid,
  user_id uuid,
  display_name text,
  avatar_url text,
  action_plan text,
  action_plan_updated_at timestamp with time zone,
  action_plans jsonb,
  connection_status text,
  requested_by uuid,
  connection_created_at timestamp with time zone,
  responded_at timestamp with time zone,
  status text,
  status_message text,
  latitude double precision,
  longitude double precision,
  location_accuracy_m double precision,
  location_at timestamp with time zone,
  quake_event_id uuid,
  is_drill boolean,
  reported_at timestamp with time zone,
  status_updated_at timestamp with time zone,
  alerted_quake_ids jsonb
)
language sql
stable
set search_path = ''
as $$
  -- El alcance se agrega UNA vez y se cruza, en vez de llamar a la función por
  -- cada fila del círculo.
  with alcance as (
    select sc.user_id, jsonb_agg(sc.quake_event_id) as ids
    from public.get_circle_alert_scope() sc
    group by sc.user_id
  )
  select
    c.id,
    p.id,
    p.display_name,
    p.avatar_url,
    p.action_plan,
    p.action_plan_updated_at,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', ap.id, 'name', ap.name, 'body', ap.body, 'updatedAt', ap.updated_at
               )
               order by ap.sort_order asc, ap.created_at asc
             )
      from public.action_plans ap
      where ap.user_id = p.id
    ), '[]'::jsonb),
    c.status,
    c.requested_by,
    c.created_at,
    c.responded_at,
    s.status,
    s.message,
    s.latitude,
    s.longitude,
    s.location_accuracy_m,
    s.location_at,
    s.quake_event_id,
    s.is_drill,
    s.reported_at,
    s.updated_at,
    coalesce(a.ids, '[]'::jsonb)
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join public.user_status s
    on s.user_id = p.id
  left join alcance a
    on a.user_id = p.id
  where (select auth.uid()) in (c.user_a, c.user_b)
    and c.status in ('pending', 'accepted');
$$;

revoke execute on function public.get_circle() from public, anon;
grant execute on function public.get_circle() to authenticated;
