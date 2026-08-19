-- ============================================================================
-- 0005 · Simulacros y tips diarios (spec §9, §11, §12)
-- ============================================================================

create table public.drills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- 'silent' = practicar sin generar ruido al círculo (spec §9).
  mode text not null check (mode in ('silent', 'notify')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  reported_status text
    check (reported_status is null or reported_status in ('safe', 'needs_help', 'helping'))
);

create index drills_user_id_started_at_idx on public.drills (user_id, started_at desc);

alter table public.drills enable row level security;

-- ---------------------------------------------------------------------------
-- tips · contenido parafraseado de fuentes oficiales, siempre con enlace
-- ---------------------------------------------------------------------------
create table public.tips (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  long_body text,
  source_name text not null,
  source_url text not null,
  phase text not null check (phase in ('antes', 'durante', 'despues')),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index tips_active_sort_idx on public.tips (sort_order) where is_active;

alter table public.tips enable row level security;

-- ---------------------------------------------------------------------------
-- RPCs de simulacro. El límite del tier free (3 simulacros) se valida en el
-- servidor, no en el cliente.
-- ---------------------------------------------------------------------------
create or replace function public.start_drill(drill_mode text)
returns public.drills
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  premium boolean;
  used integer;
  result public.drills;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select is_premium into premium from public.user_settings where user_id = me;

  select count(*) into used
  from public.drills
  where user_id = me and completed_at is not null;

  if not coalesce(premium, false) and used >= 3 then
    raise exception 'limite_simulacros_free' using errcode = '42501';
  end if;

  -- Un simulacro que quedó abierto (app cerrada a medias) se cancela solo.
  update public.drills
     set cancelled_at = now()
   where user_id = me
     and completed_at is null
     and cancelled_at is null;

  insert into public.drills (user_id, mode)
  values (me, drill_mode)
  returning * into result;

  return result;
end;
$$;

create or replace function public.complete_drill(
  drill_id uuid,
  status_reported text default null
)
returns public.drills
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  result public.drills;
begin
  update public.drills
     set completed_at = now(),
         reported_status = status_reported
   where id = drill_id
     and user_id = me
     and completed_at is null
     and cancelled_at is null
  returning * into result;

  if result.id is null then
    raise exception 'simulacro no encontrado o ya cerrado' using errcode = '22023';
  end if;

  update public.user_settings
     set drills_completed = (
       select count(*) from public.drills
       where user_id = me and completed_at is not null
     )
   where user_id = me;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants + RLS
-- ---------------------------------------------------------------------------
grant select on public.drills to authenticated;
grant select on public.tips to authenticated;

create policy drills_select_own on public.drills
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy tips_select_active on public.tips
  for select to authenticated
  using (is_active);

-- ---------------------------------------------------------------------------
-- Seed de tips. Contenido parafraseado de INDECI, IGP y Cruz Roja Peruana;
-- cada tip conserva el enlace a la fuente original (spec §11).
-- ---------------------------------------------------------------------------
insert into public.tips (title, body, long_body, source_name, source_url, phase, sort_order) values
('Identifica tus zonas seguras hoy',
 'Recorre tu casa y marca las zonas seguras: columnas, muros portantes y espacios libres de objetos que puedan caer.',
 'Las zonas seguras no son las que uno imagina. Busca los elementos estructurales de la vivienda (columnas y muros portantes) y los espacios alejados de ventanas, espejos, repisas y todo lo que pueda desprenderse. Márcalas con tu familia y practica llegar a ellas desde cada ambiente. Si vives en un edificio, ubica también la ruta a la escalera de emergencia.',
 'INDECI', 'https://www.gob.pe/indeci', 'antes', 10),

('Agáchate, cúbrete y agárrate',
 'Durante el movimiento: agáchate al piso, cúbrete la cabeza y el cuello, y agárrate de algo firme hasta que pare.',
 'Es la conducta que más lesiones evita. Agáchate antes de que el sismo te tumbe, cúbrete bajo una mesa resistente protegiendo cabeza y cuello, y sujétate para moverte con ella. Si no hay mueble cerca, ponte junto a un muro interior lejos de ventanas. Correr hacia la salida mientras todo se mueve es lo que más accidentes causa.',
 'Cruz Roja Peruana', 'https://www.cruzroja.org.pe/', 'durante', 20),

('Nunca uses el ascensor',
 'Si estás en un edificio, olvida el ascensor durante y después del sismo. Usa siempre las escaleras.',
 'Un corte de energía durante el movimiento te deja atrapado entre pisos, justo cuando los equipos de rescate están más ocupados. Baja por la escalera de emergencia una vez que el movimiento haya parado, sin correr y sin empujar.',
 'INDECI', 'https://www.gob.pe/indeci', 'durante', 30),

('Arma tu mochila de emergencia',
 'Agua, linterna, radio a pilas, botiquín, copias de documentos y algo de dinero en efectivo, en un solo lugar accesible.',
 'La mochila debe estar cerca de la salida y todos en casa deben saber dónde está. Incluye agua para tres días, alimentos no perecibles, linterna con pilas de repuesto, radio a pilas, botiquín básico, medicamentos personales, silbato, copias de documentos en bolsa hermética y efectivo en billetes pequeños. Revisa las fechas de vencimiento cada seis meses.',
 'INDECI', 'https://www.gob.pe/indeci', 'antes', 40),

('Asegura lo que puede caer',
 'Ancla a la pared los muebles altos y baja de las repisas los objetos pesados o de vidrio.',
 'La mayoría de las lesiones en sismos moderados vienen de objetos que caen, no del colapso del edificio. Ancla roperos, libreros y estantes a la pared, pon seguros en las puertas de los muebles altos y no cuelgues cuadros ni espejos sobre la cama o el sofá.',
 'Cruz Roja Peruana', 'https://www.cruzroja.org.pe/', 'antes', 50),

('Después del sismo, revisa el gas',
 'Al terminar el movimiento, cierra la llave del gas y no enciendas fósforos ni interruptores si hueles a gas.',
 'Una fuga de gas más una chispa es la causa más común de incendios posteriores a un sismo. Cierra la llave general, abre ventanas para ventilar y sal de la vivienda. No uses el celular como linterna dentro de un ambiente donde huela a gas: enciéndelo afuera.',
 'INDECI', 'https://www.gob.pe/indeci', 'despues', 60),

('Las llamadas se saturan, los mensajes no',
 'Después de un sismo la red de voz colapsa primero. Los mensajes de texto y datos suelen pasar aunque las llamadas fallen.',
 'Cuando miles de personas llaman al mismo tiempo, la red de voz se satura antes que la de datos. Un mensaje corto ocupa muchísimo menos ancho de banda y se reenvía solo hasta que entra. Por eso esta app reporta tu estado con un toque en vez de pedirte que llames a cada persona.',
 'INDECI', 'https://www.gob.pe/indeci', 'despues', 70),

('Acuerda un punto de encuentro',
 'Elige con tu familia un lugar de reunión fuera de casa y uno alterno más lejos, por si la zona queda bloqueada.',
 'Un punto cercano (el parque de la esquina, la vereda del frente) sirve para reagruparse rápido. Un punto alterno más lejano cubre el caso de que la cuadra quede inaccesible. Que todos los sepan de memoria, incluidos los niños, y anótalos en tu plan de acción dentro de la app.',
 'Cruz Roja Peruana', 'https://www.cruzroja.org.pe/', 'antes', 80),

('Si estás en la calle, aléjate de las fachadas',
 'Busca un espacio abierto lejos de postes, cables, ventanas y balcones. Los cornisas y vidrios son lo primero que cae.',
 'Las fachadas, cornisas, letreros y vidrios de los primeros pisos son la principal fuente de heridos en la vía pública. Camina hacia el centro de la calle o hacia una plaza abierta, y quédate ahí hasta que el movimiento pare por completo.',
 'INDECI', 'https://www.gob.pe/indeci', 'durante', 90),

('Si vas manejando, detente con calma',
 'Reduce, orilla el auto lejos de puentes, postes y cables, y quédate dentro con el cinturón puesto.',
 'Frenar de golpe en medio de un sismo provoca choques. Reduce progresivamente, estaciona en una zona despejada evitando puentes, pasos a desnivel y postes, enciende las luces de emergencia y permanece dentro del vehículo hasta que termine el movimiento.',
 'Cruz Roja Peruana', 'https://www.cruzroja.org.pe/', 'durante', 100),

('En la costa, un sismo largo es aviso de tsunami',
 'Si estás en el litoral y el sismo fue fuerte o muy prolongado, dirígete a una zona alta sin esperar una alerta oficial.',
 'En la costa peruana el tiempo entre el sismo y la primera ola puede ser de pocos minutos, menos de lo que tarda cualquier aviso formal. Si el movimiento fue tan fuerte que costó mantenerse en pie, o duró más de un minuto, aléjate del mar y sube a una zona alta por tu cuenta. Conoce de antemano la ruta de evacuación de tu playa.',
 'IGP', 'https://www.igp.gob.pe/', 'despues', 110),

('La magnitud no es lo mismo que la intensidad',
 'La magnitud mide la energía liberada en el epicentro. La intensidad (Mercalli) mide cuánto se sintió donde estás tú.',
 'Un sismo de magnitud 6 profundo y lejano puede sentirse menos que uno de magnitud 5 superficial y cercano. Por eso esta app no te alerta solo por magnitud: combina la magnitud con la distancia a tu última ubicación conocida, y te muestra la intensidad de Mercalli cuando el IGP la reporta.',
 'IGP', 'https://www.igp.gob.pe/', 'antes', 120);
