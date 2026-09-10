-- 0048 · El hogar: un grupo marcado, no un concepto nuevo.
--
-- ## Qué es y por qué se reusa `groups`
--
-- El Centro de Preparación necesita «las personas con las que vives». Eso es una
-- lista de personas con un chat — exactamente lo que la 0034 ya construyó. Crear
-- una tabla aparte habría duplicado el concepto y con él dos invitaciones, dos
-- pantallas y dos formas de salirse, que es lo contrario de lo que se pidió.
--
-- Marcando el grupo se hereda todo lo que ya funciona y está probado:
--
--   · solo el dueño agrega, y solo a contactos ACEPTADOS (`group_members_insert_owner`)
--   · el agregado entra automáticamente y le llega `group_added` (0040)
--   · trae su chat (`conversations.group_id`, único)
--   · sirve para el simulacro grupal (0035)
--   · sale en el desglose «Casa 2/3» de la Home durante una alerta
--   · romper la conexión borra la pertenencia en las dos direcciones (0034)
--
-- ## La única regla que los grupos NO tenían: se vive en una sola casa
--
-- Un grupo cualquiera es de muchos; un hogar es uno. Se enforcea en dos sitios
-- porque hay dos formas de entrar a uno: que te agreguen (disparador sobre
-- `group_members`) o que marquen como hogar un grupo donde ya estabas
-- (disparador sobre el flag).
--
-- ## Y por qué eso es lo que hace viable regalarle Premium a la casa
--
-- `MONETIZACION.md` §2.1 descartó «compras Premium y lo tiene tu red entera»
-- porque era **transitivo**: A paga, B recibe gratis, y B es centro de otra red
-- que también recibe. La cadena no paraba.
--
-- Acá se corta en un salto: **B ya tiene hogar, así que no puede crear el suyo**
-- ni extenderle el beneficio a nadie. Por eso el tope de personas nunca fue lo
-- que protegía el modelo — lo protege «un hogar por persona» — y por eso el tope
-- de abajo es de cortesía (20), pensado contra un abuso automatizado y no contra
-- una familia grande. Una casa de ocho es una casa.
--
-- ## Quién paga
--
-- El DUEÑO del hogar. `private.household_premium()` mira solo su `is_premium`.
-- Es la historia más limpia —quien arma la casa es quien paga, y su gente entra
-- con él— y no tiene huecos de atribución.

-- ---------------------------------------------------------------------------
-- 1 · La marca
-- ---------------------------------------------------------------------------

alter table public.groups
  add column if not exists is_household boolean not null default false;

comment on column public.groups.is_household is
  'Marca el grupo que es el HOGAR de su dueño: las personas con las que vive. '
  'Uno por persona (índice de abajo + private.enforce_household_membership). '
  'Es la puerta del Centro de Preparación — ver docs/MONETIZACION.md.';

-- Un hogar propio como máximo. Estar en el de otro no lo impide: eso lo cuida
-- el disparador, que mira las dos formas de pertenecer.
create unique index if not exists groups_one_household_per_owner
  on public.groups (owner_id)
  where is_household;

-- ---------------------------------------------------------------------------
-- 2 · Los tres ayudantes
-- ---------------------------------------------------------------------------
--
-- `security definer` los tres, por el mismo motivo que `is_group_member` en la
-- 0034: se llaman desde políticas RLS y desde disparadores, y leyendo con los
-- permisos del que consulta se caerían en recursión.

-- El hogar de alguien, sea porque lo creó o porque lo sumaron. `null` si no tiene.
create or replace function private.household_of(p_user uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from (
    select g.id
      from public.groups g
     where g.is_household and g.owner_id = p_user
    union all
    select m.group_id
      from public.group_members m
      join public.groups g on g.id = m.group_id
     where g.is_household and m.member_id = p_user
  ) candidatos
  limit 1;
$$;

create or replace function private.is_household_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_group is not null
     and p_group = private.household_of((select auth.uid()));
$$;

-- ¿La casa de esta persona está pagada? Mira SOLO al dueño.
create or replace function private.household_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.is_premium
      from public.groups g
      join public.user_settings s on s.user_id = g.owner_id
     where g.id = private.household_of(p_user)
  ), false);
$$;

comment on function private.household_premium(uuid) is
  'La única puerta de Premium del Centro de Preparación. Mira el is_premium del '
  'DUEÑO del hogar, no del que consulta: por eso un integrante gratis entra con '
  'el pago de quien armó la casa. Ver docs/MONETIZACION.md.';

-- ---------------------------------------------------------------------------
-- 3 · Se vive en una sola casa · entrada por `group_members`
-- ---------------------------------------------------------------------------

create or replace function private.enforce_household_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  es_hogar boolean;
  otro uuid;
  integrantes integer;
begin
  select g.is_household into es_hogar
    from public.groups g where g.id = new.group_id;

  -- Un grupo normal no tiene ninguna de estas reglas.
  if not coalesce(es_hogar, false) then
    return new;
  end if;

  otro := private.household_of(new.member_id);
  if otro is not null and otro <> new.group_id then
    raise exception 'ya_tiene_hogar' using errcode = '42501';
  end if;

  -- El dueño no tiene fila en `group_members`, así que el total es los
  -- integrantes más él, más el que está entrando.
  select count(*) into integrantes
    from public.group_members where group_id = new.group_id;

  if integrantes + 2 > 20 then
    raise exception 'hogar_lleno' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists group_members_enforce_household on public.group_members;
create trigger group_members_enforce_household
  before insert on public.group_members
  for each row execute function private.enforce_household_membership();

-- ---------------------------------------------------------------------------
-- 4 · Se vive en una sola casa · entrada por el flag
-- ---------------------------------------------------------------------------
--
-- Convertir un grupo que YA existe es el camino natural para quien tenía su
-- «Casa» desde antes, y evita que termine con dos listas de la misma gente. Pero
-- hay que revisar a todos los que ya están adentro.

create or replace function private.enforce_household_flag()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  chocan integer;
  integrantes integer;
begin
  if not new.is_household or coalesce(old.is_household, false) then
    return new;
  end if;

  if private.household_of(new.owner_id) is not null then
    raise exception 'ya_tiene_hogar' using errcode = '42501';
  end if;

  select count(*) into chocan
    from public.group_members m
   where m.group_id = new.id
     and private.household_of(m.member_id) is not null;

  if chocan > 0 then
    raise exception 'integrante_ya_tiene_hogar' using errcode = '42501';
  end if;

  select count(*) into integrantes
    from public.group_members where group_id = new.id;

  if integrantes + 1 > 20 then
    raise exception 'hogar_lleno' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists groups_enforce_household_flag on public.groups;
create trigger groups_enforce_household_flag
  before update of is_household on public.groups
  for each row execute function private.enforce_household_flag();

-- ---------------------------------------------------------------------------
-- 5 · Crear el hogar, y convertir uno existente
-- ---------------------------------------------------------------------------
--
-- `create_group` gana un parámetro con valor por defecto, así que las llamadas
-- que ya existen en el cliente siguen funcionando sin tocarlas.

create or replace function public.create_group(
  group_name text,
  sort_order smallint default 0,
  p_is_household boolean default false
)
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

  if p_is_household and private.household_of(me) is not null then
    raise exception 'ya_tiene_hogar' using errcode = '42501';
  end if;

  -- El disparador del tope y el índice único de nombre siguen mandando: esta
  -- función no los saltea, solo agrupa las escrituras.
  insert into public.groups (owner_id, name, sort_order, is_household)
  values (me, btrim(group_name), sort_order, p_is_household)
  returning id into nuevo;

  insert into public.conversations (kind, title, created_by, group_id)
  values ('group', btrim(group_name), me, nuevo)
  returning id into conv;

  insert into public.conversation_members (conversation_id, user_id)
  values (conv, me);

  return nuevo;
end;
$$;

-- Convertir un grupo que ya existe.
--
-- ⚠️ **Quien protege la marca es el disparador de §4, NO los permisos.** Se
-- intentó cerrar la columna con `revoke update (is_household) ... from
-- authenticated` y no sirve: `authenticated` tiene UPDATE **a nivel de tabla**
-- sobre `public.groups` (verificado el 2026-09-10 en
-- `information_schema.table_privileges`), y un grant de tabla le gana a un
-- revoke de columna. Cerrarlo de verdad exigiría revocar el UPDATE de la tabla y
-- volver a otorgarlo columna por columna, lo que cambia el comportamiento de
-- `name` y `sort_order` de paso.
--
-- No hace falta: el disparador corre en CUALQUIER update, venga de esta función
-- o de un PATCH directo contra PostgREST, así que la regla «un hogar por
-- persona» no se puede saltear por ese camino. Esta RPC existe por comodidad y
-- para que el cliente tenga un solo sitio al que llamar.
create or replace function public.mark_group_as_household(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.groups
     where id = p_group_id and owner_id = me
  ) then
    raise exception 'no es tu grupo' using errcode = '42501';
  end if;

  -- El disparador de §4 hace toda la validación.
  update public.groups set is_household = true where id = p_group_id;
end;
$$;

grant execute on function public.create_group(text, smallint, boolean) to authenticated;
grant execute on function public.mark_group_as_household(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6 · `get_groups()` devuelve la marca
-- ---------------------------------------------------------------------------
--
-- Cambia el tipo de retorno, así que hay que soltarla y rehacerla; `create or
-- replace` no puede con eso. El cuerpo es el de la 0034 con una columna más.

drop function if exists public.get_groups();

create function public.get_groups()
returns table (
  id uuid,
  name text,
  sort_order smallint,
  owner_id uuid,
  is_owner boolean,
  is_household boolean,
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
    g.is_household,
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
  order by g.is_household desc, g.sort_order, g.created_at;
$$;

grant execute on function public.get_groups() to authenticated;
