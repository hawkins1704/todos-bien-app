-- ============================================================================
-- 0021 · Bloquear de verdad
--
-- El estado `'blocked'` existe en el check de `connections` desde 0002 y en el
-- tipo de TypeScript, y **nada lo escribió nunca**. Cuarta aparición del mismo
-- patrón en este proyecto —la pieza existe, se ve completa y le falta el lado
-- que la alimenta—, después de los interruptores que no mandaban nada (§1.13),
-- el permiso que no guardaba coordenadas (§1.6.3.1) y el auto-vínculo por
-- teléfono que nunca se disparó (§1.15).
--
-- ## Qué estaba roto de verdad
--
-- «Quitar de mi círculo» hace `delete` de la fila, así que:
--
-- 1. La persona removida **puede volver a mandar solicitud enseguida**, y cada
--    intento dispara la notificación de «solicitud recibida» (0015). Alguien
--    decidido sigue apareciendo en el teléfono de quien lo sacó.
-- 2. Peor: la política `messages_insert_member` solo comprueba **membresía de
--    la conversación**, no la conexión. La conversación y sus miembros no se
--    borran al quitar el vínculo, así que **la persona removida podía seguir
--    escribiendo en el chat que ya existía**.
--
-- Para acoso —que es exactamente el caso para el que existe denunciar (0020)—
-- las dos cosas importan, y la segunda convierte «bloquear» en una etiqueta.
--
-- ## Quitar y bloquear son dos cosas distintas, y las dos se quedan
--
-- Quitar es el caso amable y es la mayoría: ya no quiero compartir mi ubicación
-- con esta persona. Borra la fila y las dos partes pueden volver a agregarse.
-- Bloquear es el caso hostil: la fila queda en `'blocked'`, no se puede pedir
-- conexión, no se puede escribir, y solo quien bloqueó puede deshacerlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Quién bloqueó
--
-- Hace falta porque `user_a`/`user_b` están en orden canónico —una restricción
-- de 0002 para que el par sea único—, así que la fila sola no dice quién de los
-- dos bloqueó a quién, y eso es lo que decide quién puede deshacerlo.
-- ---------------------------------------------------------------------------
alter table public.connections
  add column if not exists blocked_by uuid references public.profiles (id) on delete set null;

alter table public.connections
  drop constraint if exists connections_blocked_by_coherent;

alter table public.connections
  add constraint connections_blocked_by_coherent
  check ((status = 'blocked') = (blocked_by is not null));

-- `blocked_by` NO entra en el grant de UPDATE de `authenticated`: se escribe
-- solo desde las funciones de abajo. Si se pudiera escribir directo, cualquiera
-- podría marcar que lo bloqueó el otro y quedarse con la llave para desbloquear.
grant update (status, responded_at) on public.connections to authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Los dos predicados
-- ---------------------------------------------------------------------------
create or replace function private.is_blocked_pair(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.connections c
    where c.status = 'blocked'
      and (
        (c.user_a = (select auth.uid()) and c.user_b = other_user_id)
        or (c.user_b = (select auth.uid()) and c.user_a = other_user_id)
      )
  );
$$;

revoke execute on function private.is_blocked_pair(uuid) from public, anon;
grant execute on function private.is_blocked_pair(uuid) to authenticated;

-- Simétrico a propósito: quien bloqueó tampoco escribe. Un bloqueo de una sola
-- dirección deja al que bloqueó mandando mensajes a alguien que no le puede
-- contestar, que es acoso con otro nombre.
create or replace function private.conversation_blocked(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations cv
    join public.conversation_members otro
      on otro.conversation_id = cv.id
     and otro.user_id <> (select auth.uid())
    join public.connections c
      on c.status = 'blocked'
     and (
       (c.user_a = (select auth.uid()) and c.user_b = otro.user_id)
       or (c.user_b = (select auth.uid()) and c.user_a = otro.user_id)
     )
    where cv.id = conv_id
      and cv.kind = 'direct'
  );
$$;

revoke execute on function private.conversation_blocked(uuid) from public, anon;
grant execute on function private.conversation_blocked(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3 · El chat se cierra
--
-- Solo la escritura. Leer el historial sigue permitido: esconder lo que ya se
-- dijo no protege a nadie y borra la evidencia de lo que se denunció.
-- ---------------------------------------------------------------------------
drop policy if exists messages_insert_member on public.messages;

create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
    and kind = 'text'
    and not private.conversation_blocked(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- 4 · Bloquear y desbloquear
-- ---------------------------------------------------------------------------
create or replace function public.block_connection(other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  lo uuid;
  hi uuid;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if other_user_id = me then
    raise exception 'no puedes bloquearte a ti mismo' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = other_user_id) then
    raise exception 'esa persona no existe' using errcode = '23503';
  end if;

  lo := least(me, other_user_id);
  hi := greatest(me, other_user_id);

  -- Vale con o sin vínculo previo: se puede bloquear a alguien que mandó una
  -- solicitud y todavía no se aceptó, que es cuando más falta hace.
  insert into public.connections (user_a, user_b, requested_by, status, blocked_by, responded_at)
  values (lo, hi, me, 'blocked', me, now())
  on conflict (user_a, user_b) do update
    set status = 'blocked',
        blocked_by = me,
        responded_at = now(),
        updated_at = now();
end;
$$;

revoke execute on function public.block_connection(uuid) from public, anon;
grant execute on function public.block_connection(uuid) to authenticated;

create or replace function public.unblock_connection(other_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  quien uuid;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select c.blocked_by into quien
  from public.connections c
  where c.status = 'blocked'
    and c.user_a = least(me, other_user_id)
    and c.user_b = greatest(me, other_user_id);

  if quien is null then
    return;                        -- No estaba bloqueado: nada que hacer.
  end if;

  if quien <> me then
    -- El bloqueado no puede levantarse su propio bloqueo. Sin esto, bloquear no
    -- sería más que un botón de "ocultar" que el otro deshace.
    raise exception 'solo quien bloqueó puede desbloquear' using errcode = '42501';
  end if;

  -- Se borra la fila en vez de dejarla en 'declined': desbloquear devuelve a
  -- "no hay ninguna relación", que es de donde se partió, y deja que cualquiera
  -- de los dos vuelva a pedir conexión si quiere.
  delete from public.connections
   where user_a = least(me, other_user_id)
     and user_b = greatest(me, other_user_id);
end;
$$;

revoke execute on function public.unblock_connection(uuid) from public, anon;
grant execute on function public.unblock_connection(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5 · La lista de bloqueados
--
-- `security definer` por una razón concreta: la política de `profiles` deja ver
-- el perfil de quien es contacto **aceptado**, y un bloqueado por definición no
-- lo es. Sin esto, la pantalla de bloqueados mostraría una lista de nombres
-- vacíos y nadie podría desbloquear a quien no puede ver.
-- ---------------------------------------------------------------------------
create or replace function public.get_blocked()
returns table (user_id uuid, display_name text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, c.responded_at
  from public.connections c
  join public.profiles p
    on p.id = case when c.user_a = (select auth.uid()) then c.user_b else c.user_a end
  where c.status = 'blocked'
    and c.blocked_by = (select auth.uid())
  order by c.responded_at desc nulls last;
$$;

revoke execute on function public.get_blocked() from public, anon;
grant execute on function public.get_blocked() to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · Las dos funciones que ahora tienen que respetar el bloqueo
-- ---------------------------------------------------------------------------
create or replace function public.request_connection(target_user_id uuid)
returns public.connections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  lo uuid;
  hi uuid;
  result public.connections;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if target_user_id = me then
    raise exception 'no puedes conectarte contigo mismo' using errcode = '22023';
  end if;

  -- El agregado de 0021. Antes, con la fila bloqueada, el `on conflict do
  -- nothing` devolvía la fila existente y el cliente veía un "pendiente" que no
  -- existía; ahora falla claro. El mensaje es el mismo lo bloquee quien lo
  -- bloquee, para no delatar quién bloqueó a quién.
  if private.is_blocked_pair(target_user_id) then
    raise exception 'no puedes enviar una solicitud a esta persona'
      using errcode = '42501';
  end if;

  lo := least(me, target_user_id);
  hi := greatest(me, target_user_id);

  insert into public.connections (user_a, user_b, requested_by, status)
  values (lo, hi, me, 'pending')
  on conflict (user_a, user_b) do nothing
  returning * into result;

  if result.id is null then
    select * into result
    from public.connections
    where user_a = lo and user_b = hi;
  end if;

  return result;
end;
$$;

comment on column public.connections.blocked_by is
  'Quién bloqueó. Es lo único que distingue las dos direcciones, porque user_a/user_b están en orden canónico. Solo lo escriben block_connection() y unblock_connection().';
comment on function public.block_connection is
  'Bloquea a una persona: corta el vínculo, impide nuevas solicitudes y cierra la escritura en el chat directo. Solo quien bloqueó puede deshacerlo.';
