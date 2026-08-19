-- ============================================================================
-- 0004 · Chat individual y grupal (spec §12, tier free)
--
-- La pertenencia se resuelve con private.is_conversation_member() en vez de un
-- EXISTS dentro de la política: una política sobre conversation_members que
-- consultara conversation_members se auto-referencia y Postgres entra en
-- recursión infinita.
-- ============================================================================

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text check (title is null or char_length(title) <= 60),
  created_by uuid not null references public.profiles (id) on delete cascade,
  -- Clave canónica del par para conversaciones 1:1, garantiza una sola por par.
  direct_key text unique,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  constraint conversations_direct_key_required
    check ((kind = 'direct') = (direct_key is not null))
);

create index conversations_created_by_idx on public.conversations (created_by);
create index conversations_last_message_at_idx on public.conversations (last_message_at desc nulls last);

alter table public.conversations enable row level security;

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (conversation_id, user_id)
);

create index conversation_members_user_id_idx on public.conversation_members (user_id);

alter table public.conversation_members enable row level security;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  kind text not null default 'text' check (kind in ('text', 'system')),
  -- Idempotencia del outbox offline: reenviar el mismo mensaje no lo duplica.
  client_id uuid not null,
  is_drill boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_client_id_unique unique (conversation_id, sender_id, client_id)
);

create index messages_conversation_created_at_idx
  on public.messages (conversation_id, created_at desc);
create index messages_sender_id_idx on public.messages (sender_id);

alter table public.messages enable row level security;

-- ---------------------------------------------------------------------------
-- Helper de pertenencia
-- ---------------------------------------------------------------------------
create or replace function private.is_conversation_member(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversation_members m
    where m.conversation_id = conv_id
      and m.user_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_conversation_member(uuid) from public;
grant execute on function private.is_conversation_member(uuid) to authenticated;

-- Mantiene last_message_at para ordenar la lista de chats sin agregación.
create or replace function private.bump_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at
   where id = new.conversation_id
     and (last_message_at is null or last_message_at < new.created_at);
  return new;
end;
$$;

create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function private.bump_conversation_last_message();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_direct_conversation(other_user_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  key text;
  result public.conversations;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if not private.is_connected(other_user_id) then
    raise exception 'solo puedes chatear con contactos aceptados' using errcode = '42501';
  end if;

  key := least(me, other_user_id)::text || ':' || greatest(me, other_user_id)::text;

  select * into result from public.conversations where direct_key = key;
  if result.id is not null then
    return result;
  end if;

  insert into public.conversations (kind, created_by, direct_key)
  values ('direct', me, key)
  on conflict (direct_key) do nothing
  returning * into result;

  if result.id is null then
    select * into result from public.conversations where direct_key = key;
    return result;
  end if;

  insert into public.conversation_members (conversation_id, user_id)
  values (result.id, me), (result.id, other_user_id);

  return result;
end;
$$;

create or replace function public.create_group_conversation(
  group_title text,
  member_ids uuid[]
)
returns public.conversations
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  candidate uuid;
  result public.conversations;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;
  if coalesce(array_length(member_ids, 1), 0) = 0 then
    raise exception 'un grupo necesita al menos un integrante' using errcode = '22023';
  end if;

  -- Solo puedes armar un grupo con gente de tu propio círculo aceptado. Ellos
  -- no necesitan estar conectados entre sí (las conexiones no son transitivas).
  foreach candidate in array member_ids loop
    if candidate <> me and not private.is_connected(candidate) then
      raise exception 'solo puedes agregar contactos aceptados' using errcode = '42501';
    end if;
  end loop;

  insert into public.conversations (kind, title, created_by)
  values ('group', group_title, me)
  returning * into result;

  insert into public.conversation_members (conversation_id, user_id)
  select result.id, m
  from unnest(array_append(member_ids, me)) as m
  on conflict (conversation_id, user_id) do nothing;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
grant select on public.conversations to authenticated;
grant select on public.conversation_members to authenticated;
grant update (last_read_at) on public.conversation_members to authenticated;
grant select, insert on public.messages to authenticated;

create policy conversations_select_member on public.conversations
  for select to authenticated
  using (private.is_conversation_member(id));

create policy conversation_members_select_member on public.conversation_members
  for select to authenticated
  using (private.is_conversation_member(conversation_id));

-- Solo puedes marcar tu propia lectura.
create policy conversation_members_update_own on public.conversation_members
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy messages_select_member on public.messages
  for select to authenticated
  using (private.is_conversation_member(conversation_id));

create policy messages_insert_member on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.is_conversation_member(conversation_id)
    and kind = 'text'
  );
