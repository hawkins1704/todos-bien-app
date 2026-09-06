-- 0044 · Filtro de contenido ofensivo, del lado del servidor.
--
-- ## De dónde sale
--
-- Rechazo de App Store del 2026-09-05 sobre el build 1.0 (11), guía 1.2. De las
-- cuatro precauciones que exige, dos ya estaban y estaban bien —denunciar un
-- mensaje con mantenerlo apretado, y bloquear desde la ficha del contacto— y
-- dos faltaban: la aceptación de los términos (migración 0043) y esto.
--
-- ## Por qué en el servidor y no en el cliente
--
-- Un filtro en JavaScript lo salta cualquiera que arme su propio cliente contra
-- la misma API pública, y `submitReport` demuestra que este proyecto ya piensa
-- así: la copia del texto denunciado la guarda el servidor justamente para que
-- nadie pueda denunciar un mensaje inventado. Un filtro que se puede desactivar
-- no es un filtro, y ante Apple no valdría como precaución.
--
-- ## Las cuatro superficies
--
-- Contenido que una persona escribe y **otra** lee. Ese es el criterio, y por
-- eso `action_plans` NO está: el plan de acción es privado de su autor, nadie
-- más lo ve, y filtrarlo sería censurarle a alguien sus propias notas.
--
--   · `messages.body`          · el chat, directo y de grupo
--   · `user_status.message`    · el mensaje que acompaña al estado
--   · `profiles.display_name`  · lo ve toda tu red, y un nombre es permanente
--   · `groups.name`            · lo ven todos los integrantes
--
-- ## Rechazar, no enmascarar
--
-- Se evaluó reemplazar con asteriscos. Se descartó: deja el mensaje publicado
-- igual —con la intención intacta y el destinatario igual de agredido—, y ante
-- Apple «lo mostramos censurado» es más difícil de defender que «no lo
-- publicamos». Rechazar además le dice a quien escribe que la regla existe, que
-- es la mitad del trabajo de moderar.
--
-- ## ⚠️ La lista es corta a propósito, y esto NO es prolijidad
--
-- Esta app se usa durante un terremoto. Alguien escribiendo «se cayó la pared,
-- mierda, hay un herido» tiene que poder mandarlo, y un filtro de groserías
-- genéricas lo bloquearía en el único momento que la app existe para servir.
--
-- Por eso la lista contiene **insultos dirigidos, insultos discriminatorios y
-- amenazas**, y deliberadamente NO contiene exclamaciones. «Mierda», «carajo» y
-- «puta madre» sueltas se pueden decir: no agreden a nadie. «Conchatumadre»
-- dicha a una persona, sí.
--
-- Quien agregue términos acá: el costo de un falso positivo en esta app no es
-- una molestia, es un mensaje de emergencia que no salió.
--
-- ## Es una tabla y no una constante
--
-- Para poder sumar un término cuando aparezca en una denuncia, sin migración y
-- sin desplegar la app. La moderación es trabajo continuo; el código no.

-- ---------------------------------------------------------------------------
-- 1 · La lista
-- ---------------------------------------------------------------------------

create table if not exists private.moderation_terms (
  term        text primary key,
  kind        text not null check (kind in ('insulto', 'discriminacion', 'amenaza', 'sexual')),
  added_at    timestamptz not null default now(),
  note        text
);

comment on table private.moderation_terms is
  'Términos que no se publican. Van YA normalizados (minúsculas, sin tildes): los compara private.contiene_lenguaje_prohibido contra el texto normalizado del mismo modo. Ver la cabecera de la migración 0044 antes de agregar: un falso positivo acá es un mensaje de emergencia que no sale.';

insert into private.moderation_terms (term, kind, note) values
  -- Insultos dirigidos. La forma suelta («puta madre») no está: es exclamación.
  ('conchatumadre',   'insulto', 'y sus variantes de escritura, abajo'),
  ('conchatumare',    'insulto', null),
  ('concha tu madre', 'insulto', null),
  ('ctm',             'insulto', 'se compara como palabra entera, no dentro de otra'),
  ('hijo de puta',    'insulto', null),
  ('hija de puta',    'insulto', null),
  ('hijueputa',       'insulto', null),
  ('hdp',             'insulto', null),
  ('recontra cojudo', 'insulto', null),
  ('imbecil de',      'insulto', 'dirigido: "imbecil de mierda", "imbecil de porquería"'),

  -- Los plurales que el sufijo del regex NO alcanza, porque flexionan en la
  -- PRIMERA palabra y no en la última. Se descubrió probando: «Los maricones»
  -- quedaba bloqueado por el sufijo, pero «hijos de puta» pasaba limpio.
  ('hijos de puta',   'insulto', 'el plural va en la primera palabra'),
  ('hijas de puta',   'insulto', 'idem'),
  ('imbeciles de',    'insulto', 'idem'),

  -- Discriminación. En el Perú estas son las que de verdad hieren.
  ('maricon',         'discriminacion', null),
  ('marica',          'discriminacion', null),
  ('cabro de',        'discriminacion', 'dirigido; "cabro" solo también es cabrito'),
  ('cholo de mierda', 'discriminacion', null),
  ('serrano de mierda','discriminacion', null),
  ('indio de mierda', 'discriminacion', null),
  ('india de mierda', 'discriminacion', null),
  ('negro de mierda', 'discriminacion', null),
  ('retrasado mental','discriminacion', null),
  ('mongolico',       'discriminacion', null),
  ('cabros de',       'discriminacion', 'plural en la primera palabra'),
  ('cholos de mierda','discriminacion', 'idem'),
  ('serranos de mierda','discriminacion', 'idem'),
  ('indios de mierda','discriminacion', 'idem'),
  ('indias de mierda','discriminacion', 'idem'),
  ('negros de mierda','discriminacion', 'idem'),
  ('retrasados mentales','discriminacion', 'idem'),

  -- Amenazas.
  ('te voy a matar',  'amenaza', null),
  ('te voy a violar', 'amenaza', null),
  ('te voy a buscar y', 'amenaza', 'la coletilla es lo que la hace amenaza'),
  ('se van a morir',  'amenaza', null),
  ('ojala te mueras', 'amenaza', null),

  -- Sexual no consentido.
  ('mandame nudes',   'sexual', null),
  ('mandame fotos desnuda', 'sexual', null),
  ('violador',        'sexual', null)
on conflict (term) do nothing;

-- ---------------------------------------------------------------------------
-- 2 · Normalizar
-- ---------------------------------------------------------------------------

create or replace function private.normalizar_para_moderar(texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  -- El orden importa y cada paso tapa una forma de esquivar el filtro:
  --
  --   1. minúsculas            · «MARICON»
  --   2. tildes, ñ y leetspeak · «maricón», «m4r1c0n», «c0nch@tum@dre»
  --   3. letras repetidas      · «mariiicooon» (3 o más; «ll» y «rr» se
  --                              respetan porque son español legítimo)
  --   4. puntuación a espacio  · «maricon!!!», «hijo-de-puta»
  --   5. espacios colapsados   · para poder comparar por palabra entera
  --
  -- Las dos sustituciones van en el mismo `translate` —las tildes y los
  -- números— porque ningún carácter aparece en las dos listas y el largo de
  -- origen y destino coincide, que es lo único que `translate` exige.
  --
  -- Lo que NO tapa, y conviene saberlo: escribir separando cada letra
  -- («m a r i c o n»). Colapsar eso rompería frases legítimas de una letra, y
  -- el remedio sería peor que la enfermedad. Para ese caso está la denuncia.
  select ' ' || btrim(regexp_replace(
    regexp_replace(
      regexp_replace(
        translate(
          lower(coalesce(texto, '')),
          'áàäâãéèëêíìïîóòöôõúùüûñç' || '0134578@$',
          'aaaaaeeeeiiiiooooouuuunc' || 'oieastbas'
        ),
        '([a-z])\1{2,}', '\1', 'g'
      ),
      '[^a-z0-9]+', ' ', 'g'
    ),
    '\s+', ' ', 'g'
  )) || ' ';
$$;

comment on function private.normalizar_para_moderar(text) is
  'Deja el texto comparable: minúsculas, sin tildes, sin leetspeak, sin letras repetidas, con un espacio al inicio y al final para poder comparar palabras enteras.';

-- ---------------------------------------------------------------------------
-- 3 · Comparar
-- ---------------------------------------------------------------------------

create or replace function private.contiene_lenguaje_prohibido(texto text)
returns boolean
language sql
stable
parallel safe
set search_path = ''
as $$
  -- Frontera de palabra (`\m` … `\M`) con la flexión de género y número
  -- admitida al final. Las dos mitades son necesarias y cada una tapa el error
  -- que deja la otra sola:
  --
  --   · sin la frontera, «marica» daría positivo dentro de «Maricarmen» y
  --     «ctm» dentro de cualquier palabra que traiga esas tres letras;
  --   · con frontera pero sin el sufijo, el plural esquiva el filtro entero.
  --     Comprobado: «Los maricones» se publicaba sin problema.
  --
  -- El sufijo tiene que ser una lista cerrada y corta, no `\w*`: con `\w*`,
  -- «marica» volvería a atrapar «Maricarmen» y estaríamos en el punto de
  -- partida.
  --
  -- Lo que esta regla NO alcanza es el plural que flexiona en la PRIMERA
  -- palabra —«hijos de puta»—, y por eso esas variantes están listadas una por
  -- una arriba.
  select exists (
    select 1
    from private.moderation_terms t
    where private.normalizar_para_moderar(texto)
          ~ ('\m' || t.term || '(a|o|s|as|os|es)?\M')
  );
$$;

comment on function private.contiene_lenguaje_prohibido(text) is
  'True si el texto trae alguno de los términos de private.moderation_terms. Compara con frontera de palabra admitiendo la flexión de género y número, para que el plural no esquive el filtro sin abrir la puerta a falsos positivos como Maricarmen.';

-- ---------------------------------------------------------------------------
-- 4 · Aplicarlo
-- ---------------------------------------------------------------------------

create or replace function private.rechazar_contenido_ofensivo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  valor text;
begin
  -- La columna a mirar viene como argumento del disparador, así que una sola
  -- función sirve para las cuatro tablas.
  valor := case tg_argv[0]
    when 'body'         then (to_jsonb(new) ->> 'body')
    when 'message'      then (to_jsonb(new) ->> 'message')
    when 'display_name' then (to_jsonb(new) ->> 'display_name')
    when 'name'         then (to_jsonb(new) ->> 'name')
  end;

  if valor is null or btrim(valor) = '' then
    return new;
  end if;

  if private.contiene_lenguaje_prohibido(valor) then
    -- El código 23514 es `check_violation`: el cliente ya sabe distinguirlo de
    -- un fallo de red. El texto viaja al usuario tal cual, así que dice qué
    -- hacer y no solo que no se pudo.
    raise exception 'No podemos publicar eso. Los términos de Todos Bien no permiten insultos, discriminación ni amenazas. Reescríbelo y vuelve a intentar.'
      using errcode = '23514', hint = 'moderacion';
  end if;

  return new;
end;
$$;

drop trigger if exists messages_moderar on public.messages;
create trigger messages_moderar
  before insert or update of body on public.messages
  for each row execute function private.rechazar_contenido_ofensivo('body');

drop trigger if exists user_status_moderar on public.user_status;
create trigger user_status_moderar
  before insert or update of message on public.user_status
  for each row execute function private.rechazar_contenido_ofensivo('message');

drop trigger if exists profiles_moderar on public.profiles;
create trigger profiles_moderar
  before insert or update of display_name on public.profiles
  for each row execute function private.rechazar_contenido_ofensivo('display_name');

drop trigger if exists groups_moderar on public.groups;
create trigger groups_moderar
  before insert or update of name on public.groups
  for each row execute function private.rechazar_contenido_ofensivo('name');

-- La lista no se lee ni se escribe desde la app. Solo la usan las funciones de
-- arriba, que corren como su dueño.
revoke all on private.moderation_terms from anon, authenticated;
