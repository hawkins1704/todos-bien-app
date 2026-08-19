-- ============================================================================
-- 0001 · Fundación
-- Extensiones, esquema privado, perfiles, ajustes y preferencias de
-- notificación. Separamos identidad compartible (profiles) de datos privados
-- (user_settings) para que las conexiones nunca lean el teléfono ni los
-- umbrales de alerta de otra persona.
-- ============================================================================

create extension if not exists moddatetime with schema extensions;
create extension if not exists cube with schema extensions;
create extension if not exists earthdistance with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- profiles · identidad compartible con el círculo
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_url text,
  action_plan text check (action_plan is null or char_length(action_plan) <= 1000),
  action_plan_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Identidad compartible: visible para el propio usuario y sus conexiones aceptadas.';

alter table public.profiles enable row level security;

create trigger profiles_moddatetime
  before update on public.profiles
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- user_settings · datos privados, nunca visibles para el círculo
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  phone_hash text,
  country_code text not null default 'PE' check (char_length(country_code) = 2),
  -- Regla de disparo (spec §6), editable por el usuario.
  alert_radius_km integer not null default 150
    check (alert_radius_km between 10 and 1000),
  alert_min_magnitude numeric(3, 1) not null default 4.5
    check (alert_min_magnitude between 2.0 and 9.0),
  alert_countrywide_magnitude numeric(3, 1) not null default 6.0
    check (alert_countrywide_magnitude between 3.0 and 9.9),
  alert_worldwide_enabled boolean not null default false,
  location_permission_level text not null default 'none'
    check (location_permission_level in ('none', 'foreground', 'background')),
  onboarding_completed_at timestamptz,
  is_premium boolean not null default false,
  drills_completed integer not null default 0 check (drills_completed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.user_settings.phone_hash is
  'SHA-256 hex del número en E.164. Se calcula en el dispositivo; la agenda nunca sube en texto plano.';

-- El hash es el identificador con el que se resuelven invitaciones pendientes,
-- así que debe ser único. Un choque significa "ese número ya está registrado".
create unique index user_settings_phone_hash_key
  on public.user_settings (phone_hash)
  where phone_hash is not null;

alter table public.user_settings enable row level security;

create trigger user_settings_moddatetime
  before update on public.user_settings
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- notification_preferences · un switch por tipo de push (spec §7)
-- ---------------------------------------------------------------------------
create table public.notification_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  contact_needs_help boolean not null default true,
  contact_message boolean not null default true,
  connection_accepted boolean not null default true,
  contact_not_responding boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;

create trigger notification_preferences_moddatetime
  before update on public.notification_preferences
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- push_tokens
-- ---------------------------------------------------------------------------
create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

alter table public.push_tokens enable row level security;

create trigger push_tokens_moddatetime
  before update on public.push_tokens
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Bootstrap de filas al registrarse
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- display_name sale de raw_user_meta_data solo como valor inicial cómodo.
  -- Nunca se usa para decisiones de autorización.
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- La política "mis conexiones pueden leer mi perfil" se agrega en 0002, una vez
-- que existe la tabla connections.
-- ---------------------------------------------------------------------------
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.user_settings to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

-- is_premium y drills_completed los escribe solo el service role (RevenueCat /
-- edge functions), así que quedan fuera del grant de UPDATE por columna.
grant update (
  phone_e164,
  phone_hash,
  country_code,
  alert_radius_km,
  alert_min_magnitude,
  alert_countrywide_magnitude,
  alert_worldwide_enabled,
  location_permission_level,
  onboarding_completed_at
) on public.user_settings to authenticated;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy user_settings_select_own on public.user_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_settings_insert_own on public.user_settings
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_settings_update_own on public.user_settings
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy notification_preferences_select_own on public.notification_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy notification_preferences_insert_own on public.notification_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy notification_preferences_update_own on public.notification_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy push_tokens_insert_own on public.push_tokens
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy push_tokens_update_own on public.push_tokens
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated
  using ((select auth.uid()) = user_id);
