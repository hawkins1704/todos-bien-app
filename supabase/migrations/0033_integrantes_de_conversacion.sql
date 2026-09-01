-- ============================================================================
-- 0033 · Integrantes de una conversación grupal: verlos, sumarlos, sacarlos
--
-- Hasta acá una conversación grupal nacía cerrada. `create_group_conversation`
-- (0004) escribía la lista de integrantes una sola vez y no había forma de
-- tocarla después: `conversation_members` solo tiene grant de SELECT, de UPDATE
-- sobre `last_read_at` (0004) y de DELETE sobre la fila propia para salir de un
-- grupo (0032). Sumar a alguien que faltaba obligaba a armar otra conversación
-- desde cero y perder todo lo hablado.
--
-- ---------------------------------------------------------------------------
-- Por qué son tres funciones y no tres políticas
-- ---------------------------------------------------------------------------
-- Una política de INSERT sobre `conversation_members` no alcanza para el caso
-- de agregar: la condición no es sobre la fila que se escribe sino sobre la
-- relación entre QUIEN escribe y a QUIÉN mete —«el candidato tiene que ser
-- contacto aceptado MÍO»—, y eso ya se resuelve con `private.is_connected()`,
-- que es security definer. Meterlo en un `with check` funcionaría, pero deja la
-- validación repartida entre la política y el cliente. Con una RPC el error
-- vuelve con su propio mensaje y el cliente no tiene que adivinar qué falló.
--
-- ---------------------------------------------------------------------------
-- Quién puede hacer qué, y por qué
-- ---------------------------------------------------------------------------
--   ver integrantes  → cualquier integrante
--   cambiar nombre   → cualquier integrante (política de 0032)
--   sumar a alguien  → cualquier integrante, pero solo de SU PROPIA red
--   sacar a alguien  → solo quien creó la conversación
--   salir            → cualquiera, sobre sí mismo (política de 0032)
--
-- Sumar es simétrico con `create_group_conversation`: las conexiones no son
-- transitivas, así que cada quien mete a los suyos y no hace falta que los
-- integrantes se conozcan entre sí.
--
-- Sacar es la única asimétrica, y es a propósito. Sin dueño, cualquiera podría
-- vaciar de golpe la conversación donde una familia se está coordinando después
-- de un sismo. `conversations.created_by` ya existe desde 0004 y es el único
-- candidato honesto a «dueño»: no hay concepto de administrador en esta app y
-- inventarlo para esto sería una tabla más que mantener.
--
-- ---------------------------------------------------------------------------
-- El nombre de alguien que no es contacto tuyo
-- ---------------------------------------------------------------------------
-- `profiles_select_visible` (0006) solo deja leer el perfil de tus propias
-- conexiones. En un grupo puede haber gente que no está en tu red —el hermano de
-- tu mamá, que ella metió—, y sin esto su fila aparecería sin nombre.
--
-- `get_conversation_members` es security definer y devuelve el nombre de todos
-- los integrantes de una conversación a la que perteneces. Es una ampliación
-- deliberada y mínima de lo que ya se ve: esa persona te escribe en la misma
-- sala. Devuelve el NOMBRE y nada más — ni estado, ni ubicación, ni plan de
-- acción, que siguen atados a `is_connected`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ver
-- ---------------------------------------------------------------------------
create or replace function public.get_conversation_members(conv_id uuid)
returns table (user_id uuid, display_name text, is_creator boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select m.user_id,
         p.display_name,
         (m.user_id = c.created_by) as is_creator
  from public.conversation_members m
  join public.conversations c on c.id = m.conversation_id
  join public.profiles p on p.id = m.user_id
  where m.conversation_id = conv_id
    and private.is_conversation_member(conv_id)
  order by (m.user_id = c.created_by) desc, p.display_name;
$$;

comment on function public.get_conversation_members(uuid) is
  'Integrantes de una conversación propia, con su nombre. Security definer para '
  'poder nombrar a quien no es contacto tuyo pero comparte el grupo (0033).';

-- ---------------------------------------------------------------------------
-- Sumar
-- ---------------------------------------------------------------------------
create or replace function public.add_group_members(conv_id uuid, member_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  candidate uuid;
  agregados integer;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if not private.is_conversation_member(conv_id) then
    raise exception 'no perteneces a esta conversación' using errcode = '42501';
  end if;

  -- El mismo cerrojo que 0032: en un chat directo la lista de integrantes es el
  -- par y no se toca. Meter un tercero convertiría la conversación en algo que
  -- ninguno de los dos aceptó.
  if not exists (
    select 1 from public.conversations c where c.id = conv_id and c.kind = 'group'
  ) then
    raise exception 'solo las conversaciones grupales admiten integrantes'
      using errcode = '42501';
  end if;

  if coalesce(array_length(member_ids, 1), 0) = 0 then
    return 0;
  end if;

  foreach candidate in array member_ids loop
    if not private.is_connected(candidate) then
      raise exception 'solo puedes agregar contactos aceptados' using errcode = '42501';
    end if;
  end loop;

  -- `do nothing` y no un error: sumar a quien ya estaba deja el estado que se
  -- pedía. Un toque repetido no es una falla.
  insert into public.conversation_members (conversation_id, user_id)
  select conv_id, m from unnest(member_ids) as m
  on conflict (conversation_id, user_id) do nothing;

  get diagnostics agregados = row_count;
  return agregados;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sacar
-- ---------------------------------------------------------------------------
create or replace function public.remove_group_member(conv_id uuid, target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  creador uuid;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select c.created_by into creador
  from public.conversations c
  where c.id = conv_id and c.kind = 'group';

  if creador is null then
    raise exception 'solo las conversaciones grupales admiten integrantes'
      using errcode = '42501';
  end if;

  if creador <> me then
    raise exception 'solo quien creó la conversación puede sacar integrantes'
      using errcode = '42501';
  end if;

  -- Quien la creó no se saca a sí mismo por acá: para eso está salir, que borra
  -- la fila propia con la política de 0032. Si no, «sacar» y «salir» harían lo
  -- mismo con dos nombres y dos confirmaciones distintas.
  if target_id = creador then
    raise exception 'para salir de tu propia conversación usa salir'
      using errcode = '42501';
  end if;

  delete from public.conversation_members
   where conversation_id = conv_id and user_id = target_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function public.get_conversation_members(uuid) from public, anon;
revoke execute on function public.add_group_members(uuid, uuid[]) from public, anon;
revoke execute on function public.remove_group_member(uuid, uuid) from public, anon;

grant execute on function public.get_conversation_members(uuid) to authenticated;
grant execute on function public.add_group_members(uuid, uuid[]) to authenticated;
grant execute on function public.remove_group_member(uuid, uuid) to authenticated;
