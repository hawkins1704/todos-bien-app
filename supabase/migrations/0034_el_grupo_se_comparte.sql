-- ===========================================================================
-- 0034 · El grupo se comparte, y absorbe a la conversación grupal
--
-- ---------------------------------------------------------------------------
-- Qué estaba mal
-- ---------------------------------------------------------------------------
-- Había DOS objetos que la gente llamaba «grupo» y que no lo eran:
--
--   · el círculo (0031): etiqueta PRIVADA sobre personas, solo la ve su dueño;
--   · la conversación grupal (0004): sala COMPARTIDA con nombre y chat.
--
-- Convivían mal. Un círculo podía «precargar» una conversación y después las dos
-- quedaban independientes: sumabas a alguien al círculo y no entraba al chat. La
-- prueba de que el modelo no cerraba es que hubo que inventar vocabulario —
-- «círculo» contra «grupal» — para que las pantallas no se contradijeran.
--
-- Cuando hay que inventar palabras para que dos conceptos no se pisen, casi
-- siempre es que debería haber uno.
--
-- ---------------------------------------------------------------------------
-- El modelo nuevo, en cuatro reglas
-- ---------------------------------------------------------------------------
--   1. Un GRUPO es gente + un chat. Una sola cosa.
--   2. Se comparte: todos los integrantes ven el nombre y a los demás.
--   3. Es de quien lo creó. Solo él suma, saca y renombra. Cualquiera se va.
--   4. Los integrantes del grupo SON los del chat, siempre. Un disparador lo
--      garantiza; no hay forma de que se desincronicen.
--
-- ---------------------------------------------------------------------------
-- 🔴 Lo único que NO se comparte, y no es una limitación que se pueda levantar
-- ---------------------------------------------------------------------------
-- El estado y la ubicación siguen siendo **de a dos**. Si Renzo arma FAMILIA con
-- Mamá, Ana y Abuela, y Mamá solo está conectada con Renzo:
--
--   · Mamá ve el grupo, los tres nombres y les escribe en el chat  ✅
--   · Mamá NO ve el estado ni la ubicación de Ana y Abuela          ❌
--
-- Hacerlo de otro modo exigiría que las conexiones fueran transitivas, y eso es
-- exactamente lo que la app promete no hacer: alguien podría meterte en un grupo
-- y darle tu ubicación a un desconocido sin que aceptaras nada.
--
-- Por eso `get_groups()` devuelve `in_my_network` por integrante. La pantalla lo
-- usa para ofrecer el atajo —«Ana no está en tu red · Agregar»— y así el grupo
-- deja de ser una etiqueta y pasa a ser una PRESENTACIÓN. Es lo que hace que la
-- red se teja sola en vez de quedar toda colgando de quien instaló la app.
--
-- ---------------------------------------------------------------------------
-- El tope: 2 gratis, ilimitados con Premium, y cuenta lo que CREAS
-- ---------------------------------------------------------------------------
-- Contar los grupos donde estás dejaría que un tercero te bloqueara la creación
-- de los tuyos con solo sumarte a los suyos. El tope es sobre `owner_id`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Los nombres. `circle_groups` ya no describe nada: no hay más «círculos»
-- ---------------------------------------------------------------------------
alter table public.circle_groups rename to groups;
alter table public.circle_group_members rename to group_members;
alter table public.groups rename column user_id to owner_id;

alter index circle_groups_user_name_idx rename to groups_owner_name_idx;
alter index circle_groups_user_idx rename to groups_owner_idx;
alter index circle_group_members_member_idx rename to group_members_member_idx;

comment on table public.groups is
  'Un grupo: gente + un chat. Compartido — todos los integrantes lo ven. Es de quien lo creó: solo el dueño suma, saca y renombra. Gratis 2, Premium ilimitados (docs/MONETIZACION.md).';

comment on table public.group_members is
  'Quiénes están en cada grupo, SIN el dueño (que es implícito, igual que conversations.created_by). Un disparador espeja esta tabla en conversation_members.';

-- ---------------------------------------------------------------------------
-- 2 · El chat del grupo
--
-- El vínculo va en `conversations` y no en `groups` para que borrar el grupo se
-- lleve la conversación por cascada, sin disparador. `unique` es la regla 1: un
-- grupo, un chat, ni dos ni ninguno.
--
-- Las conversaciones grupales anteriores a esta migración quedan con
-- `group_id is null`. Siguen funcionando y se siguen viendo en Chats; lo único
-- que no tienen es un grupo detrás. No se borran: son mensajes de alguien.
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column group_id uuid unique references public.groups (id) on delete cascade;

comment on column public.conversations.group_id is
  'El grupo dueño de esta conversación (0034). NULL en los chats directos y en las grupales sueltas anteriores a la 0034.';

-- ---------------------------------------------------------------------------
-- 3 · Pertenencia, sin recursión
--
-- Mismo motivo que `is_conversation_member` en la 0004: una política sobre
-- `group_members` que consultara `groups`, cuya política a su vez consulta
-- `group_members`, entra en recursión infinita. El helper es security definer y
-- corta el ciclo.
-- ---------------------------------------------------------------------------
create or replace function private.is_group_member(g_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members m
    where m.group_id = g_id
      and m.member_id = (select auth.uid())
  );
$$;

create or replace function private.is_group_owner(g_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.groups g
    where g.id = g_id
      and g.owner_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_group_member(uuid) from public;
revoke execute on function private.is_group_owner(uuid) from public;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.is_group_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4 · RLS: leen todos los integrantes, escribe el dueño
-- ---------------------------------------------------------------------------
drop policy circle_groups_all_own on public.groups;
drop policy circle_group_members_select_own on public.group_members;
drop policy circle_group_members_insert_own on public.group_members;
drop policy circle_group_members_delete_own on public.group_members;

create policy groups_select_member on public.groups
  for select to authenticated
  using ((select auth.uid()) = owner_id or private.is_group_member(id));

create policy groups_insert_own on public.groups
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

-- `with check` sobre `owner_id` también impide regalarle el grupo a otro: no se
-- puede dejar una fila cuyo dueño no seas vos.
create policy groups_update_owner on public.groups
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy groups_delete_owner on public.groups
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create policy group_members_select_visible on public.group_members
  for select to authenticated
  using (private.is_group_owner(group_id) or private.is_group_member(group_id));

-- Sumar: el grupo es tuyo Y esa persona está de verdad en tu red. La segunda
-- mitad viene de la 0031 y sigue siendo la que importa — sin ella, la tabla se
-- vuelve un lugar donde escribir UUIDs arbitrarios.
create policy group_members_insert_owner on public.group_members
  for insert to authenticated
  with check (private.is_group_owner(group_id) and private.is_connected(member_id));

-- Sacar: el dueño a cualquiera, o cualquiera a sí mismo (salir del grupo).
create policy group_members_delete_owner_or_self on public.group_members
  for delete to authenticated
  using (private.is_group_owner(group_id) or (select auth.uid()) = member_id);

-- ---------------------------------------------------------------------------
-- 5 · El espejo: los integrantes del grupo SON los del chat
--
-- Es la regla 4, y vive acá y no en el cliente porque es la que impide que las
-- dos listas se separen. Sumás a alguien al grupo y entra al chat en la misma
-- transacción; lo sacás y sale.
-- ---------------------------------------------------------------------------
create or replace function private.sync_group_chat_members()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv uuid;
begin
  if tg_op = 'INSERT' then
    select c.id into conv from public.conversations c where c.group_id = new.group_id;
    if conv is not null then
      insert into public.conversation_members (conversation_id, user_id)
      values (conv, new.member_id)
      on conflict (conversation_id, user_id) do nothing;
    end if;
    return new;
  end if;

  select c.id into conv from public.conversations c where c.group_id = old.group_id;
  if conv is not null then
    delete from public.conversation_members
     where conversation_id = conv and user_id = old.member_id;
  end if;
  return old;
end;
$$;

create trigger group_members_sync_chat
  after insert or delete on public.group_members
  for each row execute function private.sync_group_chat_members();

-- El nombre también es uno solo. Renombrar el grupo renombra su chat.
create or replace function private.sync_group_chat_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    update public.conversations set title = new.name where group_id = new.id;
  end if;
  return new;
end;
$$;

create trigger groups_sync_chat_title
  after update on public.groups
  for each row execute function private.sync_group_chat_title();

-- ---------------------------------------------------------------------------
-- 6 · Salir de tu red es salir de mis grupos
--
-- En la 0031 la fila del miembro sobrevivía a una conexión rota y se filtraba al
-- LEER, para que al volver a aceptar reapareciera donde estaba. Eso funcionaba
-- porque el grupo era privado: nadie más veía la lista.
--
-- Ahora la ve todo el grupo, así que filtrar al leer daría una lista distinta
-- por persona — yo dejo de ver a Ana, Mamá la sigue viendo. Un estado compartido
-- no puede depender de quién mira. Por eso ahora se BORRA la fila, y con ella la
-- del chat (por el disparador de arriba).
-- ---------------------------------------------------------------------------
create or replace function private.drop_group_membership_on_disconnect()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a uuid := old.user_a;
  b uuid := old.user_b;
begin
  -- En UPDATE solo actúa si la conexión DEJÓ de estar aceptada.
  if tg_op = 'UPDATE' and (old.status is distinct from 'accepted' or new.status = 'accepted') then
    return new;
  end if;

  delete from public.group_members m
   using public.groups g
   where m.group_id = g.id
     and ((g.owner_id = a and m.member_id = b) or (g.owner_id = b and m.member_id = a));

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger connections_drop_group_membership
  after update or delete on public.connections
  for each row execute function private.drop_group_membership_on_disconnect();

-- ---------------------------------------------------------------------------
-- 7 · El tope: 2 gratis, ilimitados con Premium
-- ---------------------------------------------------------------------------
create or replace function private.enforce_group_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  premium boolean;
  usados integer;
begin
  select s.is_premium into premium
  from public.user_settings s where s.user_id = new.owner_id;

  if coalesce(premium, false) then
    return new;
  end if;

  -- Cuenta lo que CREÓ, no dónde está. Si contara la pertenencia, un tercero
  -- podría dejarte sin poder crear los tuyos con solo sumarte a los suyos.
  select count(*) into usados
  from public.groups where owner_id = new.owner_id;

  if usados >= 2 then
    -- Mismo errcode que los topes de simulacros (0005) y planes (0024).
    raise exception 'limite_grupos' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger circle_groups_enforce_limit on public.groups;

create trigger groups_enforce_limit
  before insert on public.groups
  for each row execute function private.enforce_group_limit();

-- ---------------------------------------------------------------------------
-- 8 · Crear un grupo: el grupo y su chat, en una sola transacción
--
-- Va por RPC porque son dos tablas y no puede quedar a medias: un grupo sin chat
-- rompe la regla 1 y no habría forma de repararlo desde el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.create_group(group_name text, sort_order smallint default 0)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  nuevo uuid;
  conv uuid;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  -- El disparador del tope y el índice único de nombre siguen mandando: esta
  -- función no los saltea, solo agrupa las dos escrituras.
  insert into public.groups (owner_id, name, sort_order)
  values (me, btrim(group_name), sort_order)
  returning id into nuevo;

  insert into public.conversations (kind, title, created_by, group_id)
  values ('group', btrim(group_name), me, nuevo)
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me);

  return nuevo;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9 · Leer los grupos
--
-- `security definer`, y acá sí hace falta: en un grupo puede haber gente que no
-- es contacto tuyo —el hermano de tu mamá, que ella conoce y vos no— y
-- `profiles_select_visible` (0006) no te deja leer su perfil. Sin esto, esa fila
-- aparecería sin nombre.
--
-- Devuelve el NOMBRE y nada más de quien no es tuyo. Ni estado, ni ubicación, ni
-- plan de acción: eso sigue atado a `is_connected`, y `in_my_network` es
-- justamente el campo que dice para quién hay datos y para quién no.
--
-- `members` incluye al DUEÑO, que no tiene fila en `group_members`. Sin él, la
-- lista que ve Mamá no incluiría a Renzo, que es quien armó el grupo.
-- ---------------------------------------------------------------------------
create or replace function public.get_groups()
returns table (
  id uuid,
  name text,
  sort_order smallint,
  owner_id uuid,
  is_owner boolean,
  conversation_id uuid,
  members jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.sort_order,
    g.owner_id,
    (g.owner_id = (select auth.uid())) as is_owner,
    (select c.id from public.conversations c where c.group_id = g.id) as conversation_id,
    coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'user_id', p.id,
                 'display_name', p.display_name,
                 'is_owner', p.id = g.owner_id,
                 'in_my_network',
                   p.id = (select auth.uid()) or private.is_connected(p.id)
               )
               order by (p.id = g.owner_id) desc, p.display_name
             )
      from public.profiles p
      where p.id = g.owner_id
         or exists (
           select 1 from public.group_members m
           where m.group_id = g.id and m.member_id = p.id
         )
    ), '[]'::jsonb) as members
  from public.groups g
  where g.owner_id = (select auth.uid())
     or private.is_group_member(g.id)
  order by g.sort_order asc, g.created_at asc;
$$;

-- ---------------------------------------------------------------------------
-- 10 · Lo que reemplaza esta migración
--
-- Las tres de la 0033 duraron un día: existían para editar los integrantes de
-- una conversación suelta, que ya no existe como objeto propio. Ahora se edita
-- el grupo y el chat lo sigue.
--
-- `create_group_conversation` (0004) NO se toca: la build que está en revisión
-- de App Store todavía la llama, y romperla desde el servidor haría fallar una
-- app que Apple está mirando. Queda sin uso en el cliente nuevo.
-- ---------------------------------------------------------------------------
drop function if exists public.get_circle_groups();
drop function if exists public.add_group_members(uuid, uuid[]);
drop function if exists public.remove_group_member(uuid, uuid);
drop function if exists public.get_conversation_members(uuid);

revoke execute on function public.create_group(text, smallint) from public, anon;
revoke execute on function public.get_groups() from public, anon;
grant execute on function public.create_group(text, smallint) to authenticated;
grant execute on function public.get_groups() to authenticated;

-- ---------------------------------------------------------------------------
-- 11 · Los grupos que ya existían se quedan con su chat
-- ---------------------------------------------------------------------------
do $$
declare
  g record;
  conv uuid;
begin
  for g in select * from public.groups loop
    insert into public.conversations (kind, title, created_by, group_id)
    values ('group', g.name, g.owner_id, g.id)
    returning id into conv;

    insert into public.conversation_members (conversation_id, user_id)
    values (conv, g.owner_id)
    on conflict (conversation_id, user_id) do nothing;

    insert into public.conversation_members (conversation_id, user_id)
    select conv, m.member_id from public.group_members m where m.group_id = g.id
    on conflict (conversation_id, user_id) do nothing;
  end loop;
end $$;
