-- ===========================================================================
-- 0031 · Grupos dentro de la red
--
-- EL PROBLEMA QUE RESUELVE, y no es de comodidad: en un sismo real con 24
-- contactos, un tablero plano de 24 caras es ilegible justo en el minuto en que
-- menos capacidad de procesar tienes. No distingue «faltan 2 de mi casa» de
-- «faltan 12 amigos que ni viven acá», que son dos situaciones opuestas.
--
--   Casa 4/5 · Familia 8/11 · Amigos 15/24
--
-- Y de paso habilita lo que no se podía hacer con una bolsa plana: umbrales
-- distintos por grupo, y un simulacro con las 5 personas de tu casa en vez de
-- con 40 conocidos.
--
-- SON PRIVADOS DE QUIEN LOS CREA. Si pones a María en «Amigos», María no lo ve
-- ni sabe que existe. Son TUS etiquetas sobre TU red, no grupos de chat: por eso
-- la RLS es de dueño y no hay ninguna política que le dé lectura al miembro.
-- Cualquier función futura que los use —el simulacro grupal, por ejemplo— tiene
-- que respetarlo: el aviso dirá «Renzo inició un simulacro», nunca el nombre del
-- grupo.
--
-- GRATIS 2, PREMIUM 10. El tope se hace cumplir en un DISPARADOR y no en una
-- RPC, porque el cliente escribe la tabla directo por PostgREST y un chequeo en
-- el cliente no es un chequeo (lección de la 0009, mismo patrón que la 0024).
--
-- QUÉ PASA SI SE VENCE EL PREMIUM: los grupos NO se borran ni se esconden. Se
-- siguen viendo los diez; lo único que no se puede es crear otro. Es la misma
-- regla que los planes de acción, y por el mismo motivo: quitarle a alguien algo
-- que ya organizó porque se le venció una suscripción es exactamente lo que este
-- producto promete no hacer.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Los grupos
--
-- `sort_order` y no `position`: POSITION es función de SQL y obliga a citar la
-- columna en cada consulta (misma razón que en 0024).
-- ---------------------------------------------------------------------------
create table public.circle_groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dos grupos «Casa» en la misma red no son un caso de uso, son un dedazo. Se
-- compara en minúsculas y sin espacios de borde para que «casa » tampoco pase.
create unique index circle_groups_user_name_idx
  on public.circle_groups (user_id, lower(btrim(name)));

create index circle_groups_user_idx
  on public.circle_groups (user_id, sort_order, created_at);

comment on table public.circle_groups is
  'Subconjuntos con nombre de la red de una persona. Privados de quien los crea: el miembro no los ve. Gratis 2, Premium 10 (docs/MONETIZACION.md).';

create trigger circle_groups_moddatetime
  before update on public.circle_groups
  for each row execute function extensions.moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- 2 · Los miembros
--
-- Sin `id` propio: la pareja (grupo, miembro) ES la fila, y una clave primaria
-- compuesta hace imposible duplicarla sin un índice extra.
--
-- El borrado en cascada cubre el grupo y el perfil. Lo que NO cubre es que se
-- deshaga la conexión: si María sale de tu red, su fila queda. Es deliberado y
-- se resuelve al LEER (`get_circle_groups` intersecta con el círculo aceptado),
-- para que si la vuelves a aceptar reaparezca donde la habías puesto en vez de
-- obligarte a reorganizar. Una fila huérfana no filtra nada: sin conexión
-- aceptada, ninguna consulta la devuelve.
-- ---------------------------------------------------------------------------
create table public.circle_group_members (
  group_id uuid not null references public.circle_groups (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, member_id)
);

create index circle_group_members_member_idx
  on public.circle_group_members (member_id);

comment on table public.circle_group_members is
  'Quién está en cada grupo. Solo lo lee y escribe el dueño del grupo; el miembro no sabe que existe.';

-- ---------------------------------------------------------------------------
-- 3 · RLS — de dueño, y nada más
-- ---------------------------------------------------------------------------
alter table public.circle_groups enable row level security;
alter table public.circle_group_members enable row level security;

grant select, insert, update, delete on public.circle_groups to authenticated;
grant select, insert, delete on public.circle_group_members to authenticated;

create policy circle_groups_all_own on public.circle_groups
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Leer y borrar miembros: solo si el grupo es tuyo.
create policy circle_group_members_select_own on public.circle_group_members
  for select to authenticated
  using (
    exists (
      select 1 from public.circle_groups g
      where g.id = group_id and g.user_id = (select auth.uid())
    )
  );

create policy circle_group_members_delete_own on public.circle_group_members
  for delete to authenticated
  using (
    exists (
      select 1 from public.circle_groups g
      where g.id = group_id and g.user_id = (select auth.uid())
    )
  );

-- Insertar exige DOS condiciones, y la segunda es la que importa: el grupo es
-- tuyo Y esa persona está de verdad en tu red. Sin `is_connected` se podría
-- construir una lista de UUIDs arbitrarios en la tabla — no filtraría datos de
-- nadie, pero convertiría una tabla de organización en un lugar donde escribir
-- lo que sea.
create policy circle_group_members_insert_own on public.circle_group_members
  for insert to authenticated
  with check (
    exists (
      select 1 from public.circle_groups g
      where g.id = group_id and g.user_id = (select auth.uid())
    )
    and private.is_connected(member_id)
  );

-- ---------------------------------------------------------------------------
-- 4 · El tope, del lado del servidor
-- ---------------------------------------------------------------------------
create or replace function private.enforce_circle_group_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  premium boolean;
  usados integer;
  tope integer;
begin
  select s.is_premium into premium
  from public.user_settings s where s.user_id = new.user_id;

  tope := case when coalesce(premium, false) then 10 else 2 end;

  select count(*) into usados
  from public.circle_groups where user_id = new.user_id;

  if usados >= tope then
    -- Mismo errcode que los topes de simulacros (0005) y planes (0024), para
    -- que el cliente traduzca los tres casos por la misma vía.
    raise exception 'limite_grupos' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger circle_groups_enforce_limit
  before insert on public.circle_groups
  for each row execute function private.enforce_circle_group_limit();

-- ---------------------------------------------------------------------------
-- 5 · Lectura para el cliente
--
-- NO es `security definer`: la RLS de arriba ya acota todo a los grupos
-- propios, y sumar `definer` sería darle permisos que no necesita a una función
-- que recibe cero parámetros. `accepted_circle_of` sí lo es, y por eso puede
-- intersectar sin que el cliente lea `connections` directo.
--
-- `member_ids` va como jsonb y no como uuid[] porque PostgREST devuelve los
-- arreglos de Postgres en formato literal (`{a,b}`) y el cliente tendría que
-- parsearlo a mano; jsonb llega como arreglo de JavaScript.
-- ---------------------------------------------------------------------------
create or replace function public.get_circle_groups()
returns table (
  id uuid,
  name text,
  sort_order smallint,
  member_ids jsonb
)
language sql
stable
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.sort_order,
    coalesce((
      select jsonb_agg(m.member_id order by m.created_at)
      from public.circle_group_members m
      where m.group_id = g.id
        -- La intersección con la red vigente: una conexión deshecha desaparece
        -- del grupo sin borrar la fila (ver §2).
        and m.member_id = any (private.accepted_circle_of((select auth.uid())))
    ), '[]'::jsonb)
  from public.circle_groups g
  where g.user_id = (select auth.uid())
  order by g.sort_order asc, g.created_at asc;
$$;

revoke execute on function public.get_circle_groups() from public, anon;
grant execute on function public.get_circle_groups() to authenticated;
