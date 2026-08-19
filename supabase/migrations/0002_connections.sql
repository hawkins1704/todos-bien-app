-- ============================================================================
-- 0002 · Conexiones e invitaciones (spec §2 y §3)
--
-- Las conexiones son bidireccionales por par y NO transitivas. Se guardan una
-- sola vez por par usando orden canónico (user_a < user_b) para que el par
-- (A,B) y (B,A) sean físicamente la misma fila.
--
-- Aceptación tipo Facebook: A solicita, B acepta, y esa única aceptación crea
-- el vínculo completo en ambos sentidos.
-- ============================================================================

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  requested_by uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'blocked')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint connections_canonical_order check (user_a < user_b),
  constraint connections_unique_pair unique (user_a, user_b)
);

comment on table public.connections is
  'Vínculo par a par no transitivo. user_a < user_b siempre; usar request_connection() para no tener que ordenar en el cliente.';

create index connections_user_a_idx on public.connections (user_a) where status = 'accepted';
create index connections_user_b_idx on public.connections (user_b) where status = 'accepted';
create index connections_requested_by_idx on public.connections (requested_by);
create index connections_pending_idx on public.connections (user_a, user_b) where status = 'pending';

alter table public.connections enable row level security;

create trigger connections_moddatetime
  before update on public.connections
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Helper de autorización usado por las políticas de profiles / user_status /
-- conversations. Vive en `private` y solo responde sobre el propio llamante,
-- así que no expone nada que este no sepa ya.
-- ---------------------------------------------------------------------------
create or replace function private.is_connected(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.connections c
    where c.status = 'accepted'
      and (
        (c.user_a = (select auth.uid()) and c.user_b = other_user_id)
        or (c.user_b = (select auth.uid()) and c.user_a = other_user_id)
      )
  );
$$;

revoke execute on function private.is_connected(uuid) from public;
grant execute on function private.is_connected(uuid) to authenticated;

-- Ahora sí: mis conexiones aceptadas pueden leer mi perfil compartible.
create policy profiles_select_connected on public.profiles
  for select to authenticated
  using (private.is_connected(id));

-- ---------------------------------------------------------------------------
-- invitations · para gente que todavía no tiene la app (spec §3)
-- ---------------------------------------------------------------------------
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  invitee_phone_hash text,
  invitee_label text check (invitee_label is null or char_length(invitee_label) <= 60),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  accepted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_at timestamptz
);

create index invitations_inviter_id_idx on public.invitations (inviter_id);
create index invitations_accepted_by_idx on public.invitations (accepted_by);
create index invitations_phone_hash_idx on public.invitations (invitee_phone_hash)
  where status = 'pending' and invitee_phone_hash is not null;

alter table public.invitations enable row level security;

-- Código corto legible: sin 0/O/1/I/L para que se pueda dictar por teléfono.
create or replace function private.generate_invite_code()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..8 loop
      candidate := candidate ||
        substr(alphabet, 1 + floor(random() * length(alphabet))::integer, 1);
    end loop;
    exit when not exists (select 1 from public.invitations where code = candidate);
  end loop;
  return candidate;
end;
$$;

revoke execute on function private.generate_invite_code() from public;
grant execute on function private.generate_invite_code() to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs de conexión
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

  lo := least(me, target_user_id);
  hi := greatest(me, target_user_id);

  insert into public.connections (user_a, user_b, requested_by, status)
  values (lo, hi, me, 'pending')
  on conflict (user_a, user_b) do nothing
  returning * into result;

  -- Ya existía (pendiente, aceptada o rechazada): devolvemos la fila actual en
  -- vez de fallar, para que el cliente pueda mostrar el estado real.
  if result.id is null then
    select * into result
    from public.connections
    where user_a = lo and user_b = hi;
  end if;

  return result;
end;
$$;

create or replace function public.respond_to_connection(connection_id uuid, accept boolean)
returns public.connections
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result public.connections;
begin
  update public.connections
     set status = case when accept then 'accepted' else 'declined' end,
         responded_at = now()
   where id = connection_id
     and status = 'pending'
     and requested_by <> me
     and me in (user_a, user_b)
  returning * into result;

  if result.id is null then
    raise exception 'solicitud no encontrada o no te corresponde responderla'
      using errcode = '42501';
  end if;

  return result;
end;
$$;

create or replace function public.create_invitation(
  phone_hash text default null,
  label text default null
)
returns public.invitations
language plpgsql
security invoker
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result public.invitations;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  insert into public.invitations (code, inviter_id, invitee_phone_hash, invitee_label)
  values (private.generate_invite_code(), me, phone_hash, label)
  returning * into result;

  return result;
end;
$$;

-- Canjear un código de invitación: crea la conexión aceptada de una vez.
-- SECURITY DEFINER porque quien canjea no puede leer la invitación ajena.
create or replace function public.redeem_invitation(invite_code text)
returns public.connections
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  inv public.invitations;
  result public.connections;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select * into inv
  from public.invitations
  where code = upper(trim(invite_code))
    and status = 'pending'
    and expires_at > now();

  if inv.id is null then
    raise exception 'código de invitación inválido o vencido' using errcode = '22023';
  end if;

  if inv.inviter_id = me then
    raise exception 'no puedes canjear tu propia invitación' using errcode = '22023';
  end if;

  insert into public.connections (user_a, user_b, requested_by, status, responded_at)
  values (
    least(inv.inviter_id, me),
    greatest(inv.inviter_id, me),
    inv.inviter_id,
    'accepted',
    now()
  )
  on conflict (user_a, user_b) do update
    set status = 'accepted',
        responded_at = now()
  returning * into result;

  update public.invitations
     set status = 'accepted', accepted_by = me, accepted_at = now()
   where id = inv.id;

  return result;
end;
$$;

-- Cuando alguien registra su phone_hash, resolvemos automáticamente las
-- invitaciones que le habían mandado antes de que instalara la app.
create or replace function private.link_pending_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.phone_hash is null then
    return new;
  end if;

  insert into public.connections (user_a, user_b, requested_by, status, responded_at)
  select distinct
         least(i.inviter_id, new.user_id),
         greatest(i.inviter_id, new.user_id),
         i.inviter_id,
         'accepted',
         now()
  from public.invitations i
  where i.invitee_phone_hash = new.phone_hash
    and i.status = 'pending'
    and i.expires_at > now()
    and i.inviter_id <> new.user_id
  on conflict (user_a, user_b) do nothing;

  update public.invitations
     set status = 'accepted', accepted_by = new.user_id, accepted_at = now()
   where invitee_phone_hash = new.phone_hash
     and status = 'pending'
     and expires_at > now()
     and inviter_id <> new.user_id;

  return new;
end;
$$;

create trigger user_settings_link_invitations
  after insert or update of phone_hash on public.user_settings
  for each row execute function private.link_pending_invitations();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.connections to authenticated;
grant select, insert, update, delete on public.invitations to authenticated;

create policy connections_select_party on public.connections
  for select to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy connections_insert_requester on public.connections
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and (select auth.uid()) in (user_a, user_b)
    and status = 'pending'
  );

-- Solo el destinatario responde una solicitud; el que la mandó no se autoacepta.
create policy connections_update_recipient on public.connections
  for update to authenticated
  using (
    (select auth.uid()) in (user_a, user_b)
    and requested_by <> (select auth.uid())
  )
  with check ((select auth.uid()) in (user_a, user_b));

-- Cualquiera de los dos puede cancelar la solicitud o romper el vínculo.
create policy connections_delete_party on public.connections
  for delete to authenticated
  using ((select auth.uid()) in (user_a, user_b));

create policy invitations_select_own on public.invitations
  for select to authenticated
  using ((select auth.uid()) in (inviter_id, accepted_by));

create policy invitations_insert_own on public.invitations
  for insert to authenticated
  with check (inviter_id = (select auth.uid()));

create policy invitations_update_own on public.invitations
  for update to authenticated
  using (inviter_id = (select auth.uid()))
  with check (inviter_id = (select auth.uid()));

create policy invitations_delete_own on public.invitations
  for delete to authenticated
  using (inviter_id = (select auth.uid()));
