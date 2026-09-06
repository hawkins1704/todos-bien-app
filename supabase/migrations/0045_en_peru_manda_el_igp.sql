-- 0045 · En Perú manda el IGP, no el que llegó primero.
--
-- ## El problema, medido
--
-- `link_canonical_quake` empareja dos reportes del mismo sismo —±120 s y ≤250 km—
-- y deja como **canónico al que ya estaba**, o sea al que la ingesta trajo
-- primero. El feed y el mapa muestran solo canónicos, así que ese sorteo decide
-- qué versión ve la gente.
--
-- Para un sismo peruano eso significa que a veces se muestra la ficha del IGP
-- —«38 km al SO de Mollendo, Islay - Arequipa»— y a veces la del USGS —«65 km S
-- of Camaná, Peru»—, según cuál fuente alcanzó el cron de 2 minutos. Misma app,
-- mismo sismo, dos descripciones y dos idiomas.
--
-- ## Por qué el IGP
--
-- Es el organismo nacional: para sismos peruanos su localización y su magnitud
-- son más precisas que la estimación remota del USGS, y su texto ya está en
-- español. Fuera del Perú no aplica — el IGP no publica sismos de otros países,
-- así que `source = 'igp'` **es** la condición «esto es peruano» y no hace falta
-- mirar coordenadas.
--
-- ## Por qué NO se escondió Perú del feed global
--
-- Era la otra opción y se descartó por producto. El feed nacional filtra por el
-- país **detectado** (`coalesce(mi_pais, 'PE')`), así que un peruano en Madrid
-- tiene «Nacional» mostrando España: para él Perú solo existe en Global. Y es a
-- quien `MONETIZACION.md` §6 le vende Guardián. Esconder Perú de Global le
-- borraría un M7 en Lima de la pantalla — al que paga, y al que más le importa.
--
-- ## Dos trampas que aparecieron al probarlo, y que definen la forma del arreglo
--
-- **1· `new.id` no existe todavía.** La primera versión invertía la relación
-- desde el propio `BEFORE INSERT`, con un `update … set canonical_id = new.id`.
-- Falla con violación de clave foránea: en un `BEFORE INSERT` la fila nueva
-- **aún no está en la tabla**, así que nada puede apuntarle. Por eso el repunte
-- del grupo viejo vive ahora en un disparador `AFTER INSERT` aparte.
--
-- **2· Alertar dos veces por el mismo sismo.** Esta es la grave. Hoy, cuando el
-- IGP llega tarde, nace como duplicado y `quake_ingested_fan_out` **no** dispara
-- —su `WHEN` exige `canonical_id IS NULL`—. Con la regla nueva el IGP nace
-- canónico, así que el fan-out **sí** dispararía… por un sismo que el reporte
-- del USGS ya alertó minutos antes. Todo el mundo recibiría el mismo terremoto
-- dos veces.
--
-- Se evita heredando el `fanned_out_at` del grupo que absorbe: si aquel ya se
-- despachó, el nuevo canónico nace con esa marca y el `WHEN` del fan-out
-- —que además exige `fanned_out_at IS NULL`— no lo deja pasar. Si el grupo aún
-- no se había despachado, hereda `null` y alerta normalmente, que es lo correcto.

-- ---------------------------------------------------------------------------
-- 1 · BEFORE INSERT — decide quién es canónico
-- ---------------------------------------------------------------------------

create or replace function private.link_canonical_quake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gemelo public.quake_events;
  canonico public.quake_events;
begin
  select q.* into gemelo
  from public.quake_events q
  where q.id <> new.id
    and abs(extract(epoch from (q.occurred_at - new.occurred_at))) <= 120
    and public.distance_km(q.latitude, q.longitude, new.latitude, new.longitude) <= 250
  order by abs(extract(epoch from (q.occurred_at - new.occurred_at))) asc
  limit 1;

  -- Sin pareja: es un sismo nuevo y es su propio canónico.
  if not found then
    new.canonical_id := null;
    return new;
  end if;

  select q.* into canonico
  from public.quake_events q
  where q.id = coalesce(gemelo.canonical_id, gemelo.id);

  -- Se compara contra el CANÓNICO del grupo y no contra el gemelo que emparejó:
  -- el gemelo puede ser un duplicado del USGS colgando de un canónico que ya es
  -- del IGP, y ahí no hay nada que invertir.
  if new.source = 'igp' and canonico.source <> 'igp' then
    -- Hereda el despacho del grupo que va a absorber. Ver la trampa 2 de la
    -- cabecera: sin esta línea, el mismo terremoto se alerta dos veces.
    new.fanned_out_at := canonico.fanned_out_at;
    new.canonical_id := null;
    return new;
  end if;

  new.canonical_id := canonico.id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 · AFTER INSERT — repunta el grupo viejo hacia el IGP
-- ---------------------------------------------------------------------------

create or replace function private.absorb_group_into_igp()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  gemelo public.quake_events;
  canonico_id uuid;
  canonico_source text;
begin
  -- Solo actúa sobre un reporte del IGP que acaba de nacer canónico, que es
  -- exactamente lo que marca el `BEFORE` cuando decidió invertir.
  if new.source <> 'igp' or new.canonical_id is not null then
    return null;
  end if;

  select q.* into gemelo
  from public.quake_events q
  where q.id <> new.id
    and coalesce(q.canonical_id, q.id) <> new.id
    and abs(extract(epoch from (q.occurred_at - new.occurred_at))) <= 120
    and public.distance_km(q.latitude, q.longitude, new.latitude, new.longitude) <= 250
  order by abs(extract(epoch from (q.occurred_at - new.occurred_at))) asc
  limit 1;

  if not found then
    return null;
  end if;

  canonico_id := coalesce(gemelo.canonical_id, gemelo.id);
  select q.source into canonico_source from public.quake_events q where q.id = canonico_id;

  if coalesce(canonico_source, '') = 'igp' then
    return null;
  end if;

  -- El grupo ENTERO —su canónico y todos sus duplicados— pasa a apuntar al IGP.
  -- Repuntar solo el canónico viejo dejaría cadenas de dos saltos, y el resto
  -- del código asume que `canonical_id` apunta siempre a un canónico:
  -- `get_quake_feed` lo da por hecho al filtrar `canonical_id is null`.
  --
  -- ⚠️ Este `update` NO vuelve a disparar el fan-out: su `WHEN` exige
  -- `new.canonical_id IS NULL` y acá se les está poniendo un valor. Tampoco se
  -- redispara este mismo disparador, que es solo `AFTER INSERT`.
  update public.quake_events
  set canonical_id = new.id
  where id = canonico_id
     or canonical_id = canonico_id;

  return null;
end;
$$;

drop trigger if exists quake_events_absorb_into_igp on public.quake_events;
create trigger quake_events_absorb_into_igp
  after insert on public.quake_events
  for each row execute function private.absorb_group_into_igp();

-- ---------------------------------------------------------------------------
-- 3 · Backfill
-- ---------------------------------------------------------------------------
--
-- Al 2026-09-06 no hay ni una fila del IGP marcada como duplicada, así que hoy
-- esto no mueve nada. Va igual: deja la migración completa para cualquier otro
-- entorno y arregla el caso si aparece.
--
-- Dos pasos y en este orden: primero el grupo apunta al IGP, y recién después el
-- IGP se libera. Al revés habría un instante con dos canónicos del mismo sismo.

with inversiones as (
  -- `distinct on` porque un grupo podría tener DOS filas del IGP colgando, y sin
  -- esto las dos querrían ser canónicas: el `update` tendría dos valores posibles
  -- para la misma fila y Postgres elegiría uno sin decir cuál. Se queda la más
  -- antigua, que es la que el grupo ya venía acompañando.
  select distinct on (coalesce(igp.canonical_id, igp.id))
    igp.id as igp_id,
    coalesce(igp.canonical_id, igp.id) as grupo_id
  from public.quake_events igp
  join public.quake_events canonico on canonico.id = igp.canonical_id
  where igp.source = 'igp'
    and canonico.source <> 'igp'
    and canonico.canonical_id is null
  order by coalesce(igp.canonical_id, igp.id), igp.occurred_at asc
)
update public.quake_events q
set canonical_id = i.igp_id
from inversiones i
where q.id = i.grupo_id or q.canonical_id = i.grupo_id;

update public.quake_events
set canonical_id = null
where source = 'igp' and canonical_id = id;
