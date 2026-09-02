-- 0039 · Quién de tu red no puede recibir el aviso (deuda 1.14).
--
-- ## El problema, que es de honestidad y no de avisos
--
-- Si alguien de tu red no tiene ningún dispositivo registrado, su entrega de
-- alerta cierra como `no_token` en vez de `sent`. Y `notify_silent_contacts`
-- solo mira las `sent`, así que **nunca se dispara «X no responde» por esa
-- persona** — ni gratis ni con Guardián. El silencio de la app coincide con el
-- silencio de quien más te preocuparía.
--
-- **El arreglo NO es quitar ese filtro.** Si a la persona nunca le llegó la
-- alerta, no está callada: está incomunicada. Decir «no responde» de alguien a
-- quien nadie le preguntó es el ruido sin antecedente que la 0020 ya había
-- corregido, y además llegaría en el peor momento — durante un sismo, sobre
-- alguien que quizá está perfectamente bien.
--
-- Lo honesto es decirlo **antes**, como estado permanente y no como
-- notificación: en la ficha del contacto y en la grilla de la red. Cero avisos
-- nuevos. Se lee un martes cualquiera, que es cuando se puede hacer algo —
-- escribirle y pedirle que abra la app.
--
-- ## Por qué el texto habla del efecto y no de la causa
--
-- El servidor sabe que **no hay a dónde mandar**. No sabe por qué: permiso
-- denegado, teléfono nuevo, o una reinstalación sin abrir la app. Prometer un
-- diagnóstico que no se tiene haría que la mitad de las veces el consejo fuera
-- equivocado, así que el texto dice lo único que es seguro: no le va a llegar.
--
-- ## Por qué una función aparte
--
-- `push_tokens` tiene RLS `_own`: cada quien ve los suyos y nada más, y así se
-- queda. `get_circle` no es security definer —corre como quien llama y se apoya
-- en RLS— así que no puede leerla. Esto es el mismo patrón que
-- `get_circle_alert_scope` de la 0025, que existe por este mismo motivo:
-- elevar privilegios para exponer **un solo booleano**, y solo sobre la red
-- aceptada de quien pregunta. Nunca un token, nunca alguien de fuera.

create or replace function public.get_circle_push_reach()
returns table(user_id uuid, reachable boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    m.id,
    exists (select 1 from public.push_tokens t where t.user_id = m.id)
  from unnest(private.accepted_circle_of((select auth.uid()))) as m(id);
$$;

revoke execute on function public.get_circle_push_reach() from public, anon;
grant execute on function public.get_circle_push_reach() to authenticated;

comment on function public.get_circle_push_reach() is
  'Un booleano por contacto ACEPTADO: si tiene algún dispositivo donde recibir avisos. Security definer porque push_tokens es privada; no expone tokens ni sale de la red de quien pregunta. Deuda 1.14.';

-- ---------------------------------------------------------------------------
-- `get_circle` gana la columna
--
-- Va acá y no en una consulta aparte para que el dato viaje con el resto de la
-- red: se cachea en SQLite con todo lo demás y funciona sin conexión, que es la
-- regla de la spec §16.1. Una llamada extra tendría que fallar por su cuenta.
--
-- `coalesce(..., true)` — o sea, ante la duda no se avisa. Las conexiones
-- `pending` no aparecen en `accepted_circle_of` y quedan en null: todavía no
-- hay relación, y estrenar el vínculo con una advertencia sobre la otra persona
-- sería empezar mal.
--
-- ⚠️ Hay que **soltarla y recrearla**: `create or replace` no puede cambiar el
-- tipo de retorno, y agregar una columna al `returns table` lo cambia. Con el
-- drop se van los permisos, así que el `grant` de abajo no es opcional — sin él
-- la app entera se queda sin red. No la depende ninguna vista ni ninguna otra
-- función (comprobado antes de soltarla).
-- ---------------------------------------------------------------------------
drop function if exists public.get_circle();

create function public.get_circle()
returns table(
  connection_id uuid, user_id uuid, display_name text, avatar_url text,
  action_plan text, action_plan_updated_at timestamptz, action_plans jsonb,
  connection_status text, requested_by uuid, connection_created_at timestamptz,
  responded_at timestamptz, status text, status_message text,
  latitude double precision, longitude double precision,
  location_accuracy_m double precision, location_at timestamptz,
  quake_event_id uuid, is_drill boolean, reported_at timestamptz,
  status_updated_at timestamptz, alerted_quake_ids jsonb,
  receives_notifications boolean
)
language sql
stable
set search_path = ''
as $$
  with alcance as (
    select sc.user_id, jsonb_agg(sc.quake_event_id) as ids
    from public.get_circle_alert_scope() sc
    group by sc.user_id
  ),
  alcanzables as (
    select r.user_id, r.reachable
    from public.get_circle_push_reach() r
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
    coalesce(a.ids, '[]'::jsonb),
    coalesce(al.reachable, true)
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  left join public.user_status s
    on s.user_id = p.id
  left join alcance a
    on a.user_id = p.id
  left join alcanzables al
    on al.user_id = p.id
  where (select auth.uid()) in (c.user_a, c.user_b)
    and c.status in ('pending', 'accepted');
$$;

revoke execute on function public.get_circle() from public, anon;
grant execute on function public.get_circle() to authenticated;
