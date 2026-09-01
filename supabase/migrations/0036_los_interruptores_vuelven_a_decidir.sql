-- 0036 · Los interruptores de Ajustes vuelven a decidir.
--
-- ## Qué se rompió
--
-- La 0035 (anoche) agregó `drill_started` y `drill_ended` a
-- `private.enqueue_notifications` haciendo `create or replace` sobre un cuerpo
-- **desactualizado**. El `case` que decide si una notificación respeta la
-- preferencia de su dueño quedó con siete ramas donde tenía doce, y todo lo que
-- perdió su rama cayó en el `else true`: se manda siempre.
--
-- Cinco interruptores de Ajustes dejaron de hacer efecto:
--
--   quake_national         «Sismos en el país»            (gratis)
--   quake_worldwide        «Sismos en el mundo»           (premium)
--   contact_reported       «Alguien reportó que está bien» (gratis, 0027)
--   contact_is_safe        Guardián, la mitad del «reportó» (premium, 0030)
--   contact_in_quake_zone  kind muerto desde la 0030
--
-- Nadie lo vivió: `send-notifications` corre cada 5 minutos y desde anoche no
-- se emitió ninguno de esos tipos. Pero es exactamente el fallo que un usuario
-- no puede diagnosticar ni evitar — apaga un aviso, el aviso llega igual, y lo
-- único que puede concluir es que la app no lo escucha.
--
-- ## La lección, que es más útil que el arreglo
--
-- La «regla de los 4 lugares» de la 0028 existe para no OLVIDARSE de un lugar
-- al agregar un tipo. No previene lo que pasó acá, que es lo contrario:
-- agregar un tipo correctamente en los cuatro lugares y, en el mismo gesto,
-- **borrar cuatro tipos ajenos** por pegar un cuerpo viejo. Un `create or
-- replace` de una función de despacho no es una adición: es un reemplazo total,
-- y lo que no se vuelve a escribir desaparece sin ruido.
--
-- Por eso acá abajo la regla deja de ser un comentario y pasa a ser una
-- función que falla: `private.assert_notification_kinds_mapped()` compara el
-- CHECK contra el cuerpo del despachador. **Toda migración que vuelva a tocar
-- `enqueue_notifications` tiene que llamarla al final.** Un documento se puede
-- no leer; una excepción, no.

-- ---------------------------------------------------------------------------
-- 1 · El CHECK, sin el tipo que la 0030 dejó sin emisor
--
-- `contact_in_quake_zone` era «Tembló cerca de María», que la 0030 quitó porque
-- no se podía enunciar en una frase. No lo emite ninguna función viva y no hay
-- ninguna fila con ese tipo. Sacarlo del CHECK es lo que permite que la
-- comprobación de abajo signifique algo: mientras el CHECK admita un tipo que
-- nadie manda, «todo tipo válido tiene rama» es una exigencia sobre un fantasma.
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
    'drill_ended'
  ]));

-- ---------------------------------------------------------------------------
-- 2 · El despachador, con las once ramas
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
-- 3 · La regla, ejecutable
--
-- Lee los tipos del CHECK y busca la rama de cada uno en el cuerpo del
-- despachador. Es deliberadamente tonta —compara texto— porque tiene que
-- sobrevivir a que la escriba alguien apurado, y porque el fallo que previene
-- es justamente el de alguien apurado.
-- ---------------------------------------------------------------------------
create or replace function private.assert_notification_kinds_mapped()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cuerpo text;
  faltantes text[];
begin
  select p.prosrc into cuerpo
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'private' and p.proname = 'enqueue_notifications';

  if cuerpo is null then
    raise exception 'no existe private.enqueue_notifications';
  end if;

  select coalesce(array_agg(m[1]), '{}'::text[])
  into faltantes
  from pg_constraint c,
       lateral regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') as m
  where c.conname = 'notification_deliveries_kind_check'
    and position('when ''' || m[1] || '''' in cuerpo) = 0;

  if array_length(faltantes, 1) is not null then
    raise exception
      'enqueue_notifications no decide sobre: %. Cada tipo del CHECK necesita su rama, o se manda ignorando la preferencia de su dueño.',
      faltantes;
  end if;
end;
$$;

revoke execute on function private.assert_notification_kinds_mapped()
  from public, anon, authenticated;

comment on function private.assert_notification_kinds_mapped() is
  'Falla si algún tipo de notification_deliveries.kind no tiene rama en enqueue_notifications. Llamarla al final de toda migración que toque esa función (ver 0036).';

-- Y se comprueba a sí misma, acá y ahora.
select private.assert_notification_kinds_mapped();
