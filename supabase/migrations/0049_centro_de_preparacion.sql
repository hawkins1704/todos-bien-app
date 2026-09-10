-- 0049 · Centro de Preparación: mochila, roles y minicurso.
--
-- ## El corte de acceso, una sola vez y para las tres
--
--   SELECT      → ser del hogar
--   INSERT/UPDATE/DELETE → ser del hogar **y** `private.household_premium()`
--
-- Están separados a propósito. **Si el Premium vence, el hogar sigue viendo todo
-- lo que ya construyó y solo pierde la escritura.** Esconderle a una familia su
-- propio punto de encuentro porque venció una tarjeta es indefendible en una app
-- de seguridad, y es la reseña de una estrella en el peor momento posible.
--
-- ## Lo compartido y lo individual no es una regla de cobro
--
-- La mochila y los roles son de la casa porque hay una sola mochila física en el
-- pasillo y porque repartir tareas solo tiene sentido entre varios. El minicurso
-- es de cada persona porque nadie aprende por otro. **Ninguna de las dos cosas se
-- cobra aparte**: el candado está en la puerta del hogar y nada más.
--
-- ## Por qué el catálogo vive en `private` y se copia
--
-- Al crear una mochila se copian sus ítems a `kit_items`. Así marcar uno es un
-- `update` de una fila propia —que la cola offline de `sync.ts` ya sabe manejar—
-- en vez de un `insert` contra un catálogo compartido. Y cada casa puede tachar,
-- renombrar o agregar los suyos sin tocar a nadie más.

-- ---------------------------------------------------------------------------
-- 1 · El catálogo recomendado
-- ---------------------------------------------------------------------------

create table if not exists private.kit_catalog (
  id smallint generated always as identity primary key,
  label text not null,
  detail text,
  sort_order smallint not null default 0
);

comment on table private.kit_catalog is
  'Contenido recomendado de una mochila de emergencia, según INDECI. Es una '
  'plantilla: se copia a kit_items al crear cada mochila y desde ahí cada hogar '
  'la edita. No la lee ni la escribe la app.';

insert into private.kit_catalog (label, detail, sort_order) values
  ('Agua embotellada',            'Un litro por persona por día, para tres días.', 10),
  ('Alimentos no perecibles',     'Conservas, barras de cereal, galletas. Que no necesiten cocción.', 20),
  ('Botiquín de primeros auxilios','Gasas, vendas, alcohol, tijeras, guantes.', 30),
  ('Medicinas de uso permanente', 'Las que alguien de la casa toma todos los días.', 40),
  ('Linterna',                    'Con pilas de repuesto, aparte.', 50),
  ('Radio a pilas',               'Cuando no hay señal ni luz, es la única forma de enterarte.', 60),
  ('Pilas de repuesto',           null, 70),
  ('Silbato',                     'Para pedir ayuda sin gastar la voz si quedas atrapado.', 80),
  ('Copia de documentos',         'DNI y seguros, en una bolsa hermética.', 90),
  ('Dinero en efectivo',          'En billetes pequeños: sin luz no funcionan los POS.', 100),
  ('Manta térmica o frazada',     null, 110),
  ('Ropa abrigadora y zapatos cerrados', 'Un juego por persona.', 120),
  ('Artículos de higiene',        'Papel higiénico, jabón, alcohol en gel, toallas húmedas.', 130),
  ('Abrelatas manual',            null, 140),
  ('Bolsas plásticas',            'Para basura, para agua, para mantener cosas secas.', 150),
  ('Lista de contactos impresa',  'Si el celular se queda sin batería, los números se van con él.', 160)
on conflict do nothing;

revoke all on private.kit_catalog from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2 · Las mochilas y su contenido
-- ---------------------------------------------------------------------------

create table if not exists public.emergency_kits (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists emergency_kits_group_idx
  on public.emergency_kits (group_id, sort_order, created_at);

comment on table public.emergency_kits is
  'Una fila por mochila de emergencia del hogar. Son varias a propósito: no se '
  'pueden meter veinte litros de agua en una sola, así que una familia grande '
  'necesita más de una y la app sugiere cuántas según cuánta gente vive ahí.';

create table if not exists public.kit_items (
  id uuid primary key default gen_random_uuid(),
  kit_id uuid not null references public.emergency_kits (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 60),
  detail text check (char_length(detail) <= 200),
  is_custom boolean not null default false,
  checked_at timestamptz,
  checked_by uuid references public.profiles (id) on delete set null,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists kit_items_kit_idx
  on public.kit_items (kit_id, sort_order, created_at);

comment on column public.kit_items.checked_by is
  'Quién lo marcó. No es auditoría: es para que la casa vea que alguien más está '
  'aportando, que es la mitad de lo que hace funcionar el progreso compartido.';

-- Al nacer una mochila, se llena con el catálogo.
create or replace function private.seed_kit_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.kit_items (kit_id, label, detail, sort_order)
  select new.id, c.label, c.detail, c.sort_order
    from private.kit_catalog c
   order by c.sort_order;
  return null;
end;
$$;

drop trigger if exists emergency_kits_seed on public.emergency_kits;
create trigger emergency_kits_seed
  after insert on public.emergency_kits
  for each row execute function private.seed_kit_items();

-- ---------------------------------------------------------------------------
-- 3 · Roles
-- ---------------------------------------------------------------------------
--
-- Uno por persona: `unique (group_id, member_id)`. Repartir tareas con varias
-- etiquetas por cabeza deja de ser un reparto y pasa a ser una lista.

create table if not exists public.household_roles (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  label text not null check (char_length(btrim(label)) between 1 and 40),
  detail text check (char_length(detail) <= 200),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, member_id)
);

create index if not exists household_roles_group_idx
  on public.household_roles (group_id, sort_order);

-- ---------------------------------------------------------------------------
-- 4 · El minicurso, que es de cada quien
-- ---------------------------------------------------------------------------

create table if not exists public.tip_progress (
  user_id uuid not null references public.profiles (id) on delete cascade,
  tip_id uuid not null references public.tips (id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (user_id, tip_id)
);

comment on table public.tip_progress is
  'Qué consejos leyó cada persona. Individual: nadie aprende por otro. Vive en '
  'el servidor y no solo en `tips_seen` de SQLite porque el progreso del HOGAR '
  'necesita saber si todos terminaron.';

-- ---------------------------------------------------------------------------
-- 5 · `updated_at`
-- ---------------------------------------------------------------------------

drop trigger if exists emergency_kits_moddatetime on public.emergency_kits;
create trigger emergency_kits_moddatetime
  before update on public.emergency_kits
  for each row execute function extensions.moddatetime('updated_at');

drop trigger if exists household_roles_moddatetime on public.household_roles;
create trigger household_roles_moddatetime
  before update on public.household_roles
  for each row execute function extensions.moddatetime('updated_at');

-- ---------------------------------------------------------------------------
-- 6 · RLS · leer con estar en la casa, escribir además con Premium
-- ---------------------------------------------------------------------------

alter table public.emergency_kits enable row level security;
alter table public.kit_items      enable row level security;
alter table public.household_roles enable row level security;
alter table public.tip_progress   enable row level security;

drop policy if exists emergency_kits_select  on public.emergency_kits;
drop policy if exists emergency_kits_write   on public.emergency_kits;
drop policy if exists kit_items_select       on public.kit_items;
drop policy if exists kit_items_write        on public.kit_items;
drop policy if exists household_roles_select on public.household_roles;
drop policy if exists household_roles_write  on public.household_roles;
drop policy if exists tip_progress_own       on public.tip_progress;

-- Mochilas
create policy emergency_kits_select on public.emergency_kits
  for select to authenticated
  using (private.is_household_member(group_id));

create policy emergency_kits_write on public.emergency_kits
  for all to authenticated
  using (private.is_household_member(group_id)
         and private.household_premium((select auth.uid())))
  with check (private.is_household_member(group_id)
              and private.household_premium((select auth.uid())));

-- Ítems: el hogar se alcanza por la mochila
create policy kit_items_select on public.kit_items
  for select to authenticated
  using (exists (
    select 1 from public.emergency_kits k
     where k.id = kit_id and private.is_household_member(k.group_id)
  ));

create policy kit_items_write on public.kit_items
  for all to authenticated
  using (exists (
    select 1 from public.emergency_kits k
     where k.id = kit_id and private.is_household_member(k.group_id)
  ) and private.household_premium((select auth.uid())))
  with check (exists (
    select 1 from public.emergency_kits k
     where k.id = kit_id and private.is_household_member(k.group_id)
  ) and private.household_premium((select auth.uid())));

-- Roles
create policy household_roles_select on public.household_roles
  for select to authenticated
  using (private.is_household_member(group_id));

create policy household_roles_write on public.household_roles
  for all to authenticated
  using (private.is_household_member(group_id)
         and private.household_premium((select auth.uid())))
  with check (private.is_household_member(group_id)
              and private.household_premium((select auth.uid())));

-- Minicurso: tuyo y de nadie más. El progreso del hogar lo agrega la RPC de la
-- 0050, que es `security definer` — acá nadie lee el avance ajeno.
create policy tip_progress_own on public.tip_progress
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id
              and private.household_premium((select auth.uid())));

-- ---------------------------------------------------------------------------
-- 7 · Moderación
-- ---------------------------------------------------------------------------
--
-- Mismo criterio que la 0044 y la 0047: texto que una persona escribe y otra
-- lee. El nombre de una mochila y la etiqueta de un rol los ve toda la casa.

drop trigger if exists emergency_kits_moderar on public.emergency_kits;
create trigger emergency_kits_moderar
  before insert or update of name on public.emergency_kits
  for each row execute function private.rechazar_contenido_ofensivo('name');

drop trigger if exists kit_items_moderar on public.kit_items;
create trigger kit_items_moderar
  before insert or update of label on public.kit_items
  for each row execute function private.rechazar_contenido_ofensivo('label');

drop trigger if exists household_roles_moderar on public.household_roles;
create trigger household_roles_moderar
  before insert or update of label on public.household_roles
  for each row execute function private.rechazar_contenido_ofensivo('label');

-- ---------------------------------------------------------------------------
-- 8 · Permisos
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.emergency_kits  to authenticated;
grant select, insert, update, delete on public.kit_items       to authenticated;
grant select, insert, update, delete on public.household_roles to authenticated;
grant select, insert, update, delete on public.tip_progress    to authenticated;
