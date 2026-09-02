-- 0040 · Que te metan en un grupo deja de ser un silencio.
--
-- ## El agujero (deuda 1.15)
--
-- Desde la 0034 el dueño de un grupo suma gente de su red y la persona **entra
-- sin enterarse**: el grupo y su chat le aparecen al siguiente refresco y punto.
--
-- No es un agujero de privacidad —solo puede sumarte alguien que ya es contacto
-- tuyo, y la pantalla del que suma avisa que quien entra lee todo lo anterior—
-- pero es un silencio raro en una app cuyo propósito es que la gente se entere.
-- Y pesa más que antes de la 0034: el grupo es visible, tiene nombre, tiene un
-- chat que aparece solo en la pestaña Chats, y adentro puede haber gente que no
-- es contacto tuyo.
--
-- ## La regla de los 4 lugares (0028), otra vez
--
--   1. `kind` en el CHECK de `notification_deliveries`      → parte 2
--   2. rama en `private.enqueue_notifications`              → parte 3
--   3. columna en `notification_preferences`                → parte 1
--   4. el emisor                                            → parte 4
--
-- Y al final, `private.assert_notification_kinds_mapped()`, que es lo que la
-- 0036 dejó puesto para que olvidarse de 1 o 2 sea una excepción y no un aviso
-- que se manda ignorando la preferencia de su dueño.

-- ---------------------------------------------------------------------------
-- 1 · La preferencia
--
-- Columna propia y NO colgada de `contact_message`, que era la idea anotada en
-- QUE-FALTA. El interruptor dice «Mensajes · Un contacto te escribió por chat»:
-- quien lo apaga quiere silenciar el chat, no dejar de enterarse de en qué
-- grupos está. Colgarlo ahí haría que el interruptor mienta, que es exactamente
-- la clase de fallo que la 0036 acaba de arreglar.
--
-- El vecino correcto es `connection_accepted`: los dos avisan de un cambio en
-- tu grafo social hecho por otra persona.
--
-- ⚠️ Nace en `true`, así que abre un agujero en el blindaje de las cuentas
-- ajenas durante las pruebas. Es la tercera vez que pasa (`contact_reported` en
-- la 0027, `drill_invites` en la 0035): el bloque de SQL de
-- VERIFICACION-EN-DISPOSITIVO §0 se actualiza en esta misma tanda.
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column group_added boolean not null default true;

comment on column public.notification_preferences.group_added is
  'Avisar cuando alguien de tu red te suma a uno de sus grupos (0040).';

-- ---------------------------------------------------------------------------
-- 2 · El CHECK
-- ---------------------------------------------------------------------------
alter table public.notification_deliveries
  drop constraint notification_deliveries_kind_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_kind_check
  check (kind = any (array[
    'connection_request',
    'connection_accepted',
    'contact_needs_help',
    'contact_message',
    'contact_not_responding',
    'quake_national',
    'quake_worldwide',
    'contact_is_safe',
    'contact_reported',
    'drill_started',
    'drill_ended',
    'group_added'
  ]));

-- ---------------------------------------------------------------------------
-- 3 · El despachador, con las doce ramas
--
-- 🔴 Es un `create or replace`: reemplaza el cuerpo ENTERO. Las once ramas de
-- la 0036 se vuelven a escribir acá a propósito. Pegar un cuerpo viejo es lo
-- que rompió cinco interruptores la noche del 1 de septiembre.
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_notifications(
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_channel text default 'social',
  p_dedupe_key text default null
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
          -- Las dos caras del mismo aviso, y por eso dos interruptores
          -- distintos: si el sismo TE alcanzó, enterarte de que tu gente
          -- reportó es gratis (0027); si no te alcanzó, es Guardián (0030).
          when 'contact_is_safe'        then coalesce(n.guardian_alerts, true)
          when 'contact_reported'       then coalesce(n.contact_reported, true)
          when 'drill_started'          then coalesce(n.drill_invites, true)
          when 'drill_ended'            then coalesce(n.drill_invites, true)
          when 'group_added'            then coalesce(n.group_added, true)
          -- Sin `else`: un tipo sin rama tiene que fallar en la comprobación de
          -- abajo, no colarse por la puerta de atrás. La alerta de sismo no
          -- pasa por acá — no es una preferencia, es la razón de la app.
        end
  on conflict do nothing;

  get diagnostics encolados = row_count;
  return encolados;
end;
$$;

revoke execute on function private.enqueue_notifications(uuid[], text, text, text, jsonb, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · El emisor
--
-- Va como disparador sobre `group_members` y no dentro de una función RPC
-- porque **el cliente inserta directo en la tabla** (`addGroupMember` en
-- `src/lib/api.ts`, permitido por la política `group_members_insert_owner` de
-- la 0034). Un emisor del lado del cliente se saltearía con cualquier otro
-- camino que se agregue después; acá cuelga de la fila, que es el hecho.
--
-- Es la misma decisión que `group_members_sync_chat`, que ya vive en esta tabla
-- por el mismo motivo.
--
-- **Sin `dedupe_key`, a propósito.** El aviso nace de un INSERT irrepetible: el
-- índice único de `group_members` impide sumarte dos veces, así que no hay nada
-- que deduplicar. Y si te sacan y te vuelven a sumar (paso 9d.13 del recorrido)
-- el aviso TIENE que salir de nuevo — un `dedupe_key` por grupo lo silenciaría
-- para siempre.
-- ---------------------------------------------------------------------------
create or replace function private.notify_group_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  g record;
begin
  select id, name, owner_id into g
  from public.groups
  where id = new.group_id;

  if g.id is null then
    return new;
  end if;

  -- El dueño no tiene fila en `group_members` (ver 0034), así que esto no
  -- debería pasar nunca. Se comprueba igual: avisarle a alguien que él mismo se
  -- sumó a su propio grupo sería ruido puro.
  if new.member_id = g.owner_id then
    return new;
  end if;

  -- El cuerpo NO promete ver el estado de los demás. Estar en un grupo no
  -- conecta a nadie (QUE-PROMETE §7): solo ves a los integrantes que ya están
  -- en tu red, y de eso se encarga el detalle del grupo, que lo explica con el
  -- botón de agregar al lado. Un push que dijera «ahora pueden verse» sería
  -- falso justo para el caso que el atajo de la 0034 existe para resolver.
  perform private.enqueue_notifications(
    array[new.member_id],
    'group_added',
    private.display_name_of(g.owner_id) || ' te sumó a un grupo',
    'Ahora estás en «' || g.name || '». Ábrelo para ver quiénes están.',
    jsonb_build_object('type', 'group_added', 'groupId', g.id),
    'social'
  );

  return new;
end;
$$;

drop trigger if exists group_members_notify_added on public.group_members;
create trigger group_members_notify_added
  after insert on public.group_members
  for each row execute function private.notify_group_added();

-- ---------------------------------------------------------------------------
-- 5 · La regla, comprobada
-- ---------------------------------------------------------------------------
select private.assert_notification_kinds_mapped();
