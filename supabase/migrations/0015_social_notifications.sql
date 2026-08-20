-- ============================================================================
-- 0015 · Notificaciones de personas (no de sismos)
--
-- Hasta acá el único push que existía era el de sismo: ingesta -> fan-out ->
-- `alert_deliveries` -> `send-alerts` -> Expo. Todo lo demás que la app promete
-- avisar **no se mandaba nunca**, aunque la pantalla de Ajustes ya ofrecía los
-- interruptores desde el primer día:
--
--   · «Alguien necesita ayuda»      -> nadie lo mandaba
--   · «Mensajes»                    -> nadie lo mandaba
--   · «Solicitudes aceptadas»       -> nadie lo mandaba
--   · «Contacto sin responder»      -> nadie lo mandaba
--
-- Y faltaba el quinto, que es el que más se nota: **que alguien te mande
-- solicitud**. Sin él, una conexión nueva solo se descubre abriendo la app.
--
-- Esta migración construye el equivalente de 0010+0014 para eventos entre
-- personas. Se copia la forma a propósito: cola con estados, reserva con
-- rescate, y un cartero que la drena. Lo probado en el camino de sismos no se
-- reinventa.
--
-- ## Dos diferencias con la cola de sismos, ambas deliberadas
--
-- 1. **Sin jitter.** El aviso de sismo lo dispersa 30 s porque despierta a
--    miles de teléfonos a capturar ubicación a la vez. Un mensaje de chat va a
--    una sola persona: dispersarlo sería demora sin motivo.
--
-- 2. **Se manda al instante, no esperando al cron.** Un disparador toca la edge
--    function apenas hay algo encolado (parte 7). El cron queda de red de
--    seguridad cada 5 minutos en vez de cada minuto — así que esto **baja** el
--    consumo de invocaciones en vez de subirlo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La preferencia que faltaba
--
-- Las otras cuatro ya existían (0001). Esta es la de recibir solicitudes, que
-- es la que el usuario pidió y la única cuya ausencia se nota siempre: sin
-- ella no hay forma de enterarse de una conexión nueva sin abrir la app.
-- ---------------------------------------------------------------------------
alter table public.notification_preferences
  add column if not exists connection_request boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2 · La cola
--
-- A diferencia de `alert_deliveries`, acá el texto se calcula al encolar y no
-- al enviar. La razón: el aviso de sismo se arma desde `quake_events`, que
-- sigue existiendo igual cuando el sender corre; el de una persona depende de
-- su nombre y del cuerpo de un mensaje, y esos **cambian o se borran**. Si el
-- texto se resolviera al enviar, un mensaje borrado un segundo después llegaría
-- vacío, y alguien que se saca del círculo seguiría nombrado en un push.
-- ---------------------------------------------------------------------------
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  kind text not null check (kind in (
    'connection_request',
    'connection_accepted',
    'contact_needs_help',
    'contact_message',
    'contact_not_responding'
  )),

  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,

  -- Canal de Android. Tiene que existir en el cliente antes de que llegue el
  -- mensaje; los crea `ensureAndroidChannels()` al pedir el permiso.
  channel text not null default 'social' check (channel in ('alerts', 'messages', 'social')),

  -- Idempotencia. Solo lo usan los avisos que se pueden calcular más de una vez
  -- (hoy: «contacto sin responder», que lo recalcula un cron cada 5 minutos).
  -- Los que nacen de un INSERT irrepetible lo dejan en null.
  dedupe_key text,

  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'no_token', 'failed', 'expired')),
  attempts integer not null default 0,
  last_error text,

  created_at timestamptz not null default now(),
  sent_at timestamptz
);

-- Un aviso deduplicable no se encola dos veces. Es un índice parcial y no una
-- constraint porque la enorme mayoría de las filas tiene `dedupe_key` null, y
-- en SQL dos nulls nunca chocan: una constraint normal no serviría de nada.
create unique index if not exists notification_deliveries_dedupe_idx
  on public.notification_deliveries (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (created_at)
  where status = 'pending';

create index if not exists notification_deliveries_sending_idx
  on public.notification_deliveries (created_at)
  where status = 'sending';

-- La cola es asunto del servidor. El cliente no la lee ni la escribe: RLS
-- prendida y **sin una sola policy**, que es la forma de decir "nadie".
-- (Lección de 0010: una tabla nueva hereda grants de anon/authenticated por el
-- default de Supabase, así que no alcanza con no escribir policies.)
alter table public.notification_deliveries enable row level security;
revoke all on public.notification_deliveries from public, anon, authenticated;
grant all on public.notification_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- 3 · Encolar
--
-- Un solo lugar por donde pasan todos los avisos, para que la comprobación de
-- preferencias no se pueda olvidar en un disparador nuevo.
--
-- Recibe un array de destinatarios y hace **un solo INSERT**: eso importa
-- porque el disparador que avisa al cartero (parte 7) es por sentencia, así que
-- un aviso a un círculo de diez personas dispara un HTTP, no diez.
-- ---------------------------------------------------------------------------
create or replace function private.enqueue_notifications(
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_channel text default 'social',
  p_dedupe_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  encolados integer;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return 0;
  end if;

  insert into public.notification_deliveries (user_id, kind, title, body, data, channel, dedupe_key)
  select u.id, p_kind, p_title, p_body, p_data, p_channel, p_dedupe_key
  from unnest(p_user_ids) as u(id)
  -- Solo a quien tenga el interruptor prendido. El left join con `true` por
  -- defecto cubre a las cuentas viejas que todavía no tienen fila de
  -- preferencias: el default de la app es recibir.
  left join public.notification_preferences n on n.user_id = u.id
  where case p_kind
          when 'connection_request'     then coalesce(n.connection_request, true)
          when 'connection_accepted'    then coalesce(n.connection_accepted, true)
          when 'contact_needs_help'     then coalesce(n.contact_needs_help, true)
          when 'contact_message'        then coalesce(n.contact_message, true)
          when 'contact_not_responding' then coalesce(n.contact_not_responding, true)
          else true
        end
  on conflict do nothing;

  get diagnostics encolados = row_count;
  return encolados;
end;
$$;

revoke execute on function private.enqueue_notifications(uuid[], text, text, text, jsonb, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4 · Quién es quién
--
-- El nombre se resuelve al encolar (ver parte 2). Sin nombre no se cae: se dice
-- "Alguien de tu círculo", que es mejor que un push que diga "null".
-- ---------------------------------------------------------------------------
create or replace function private.display_name_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(trim(p.display_name), ''), 'Alguien de tu círculo')
  from public.profiles p
  where p.id = p_user_id;
$$;

-- Contactos aceptados de alguien. La conexión es simétrica y se guarda una sola
-- vez, así que hay que mirar las dos columnas.
create or replace function private.accepted_circle_of(p_user_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    array_agg(case when c.user_a = p_user_id then c.user_b else c.user_a end),
    '{}'::uuid[]
  )
  from public.connections c
  where c.status = 'accepted'
    and (c.user_a = p_user_id or c.user_b = p_user_id);
$$;

-- ---------------------------------------------------------------------------
-- 5 · Disparadores
-- ---------------------------------------------------------------------------

-- 5.1 · Te mandaron solicitud
create or replace function private.on_connection_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  destinatario uuid;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  destinatario := case when new.requested_by = new.user_a then new.user_b else new.user_a end;

  perform private.enqueue_notifications(
    array[destinatario],
    'connection_request',
    private.display_name_of(new.requested_by),
    'Quiere conectarse contigo en Todos Bien.',
    jsonb_build_object('type', 'connection_request', 'connectionId', new.id),
    'social'
  );

  return new;
end;
$$;

drop trigger if exists connection_requested_notify on public.connections;
create trigger connection_requested_notify
  after insert on public.connections
  for each row execute function private.on_connection_requested();

-- 5.2 · Aceptaron tu solicitud
create or replace function private.on_connection_accepted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  quien_acepto uuid;
begin
  quien_acepto := case when new.requested_by = new.user_a then new.user_b else new.user_a end;

  perform private.enqueue_notifications(
    array[new.requested_by],
    'connection_accepted',
    private.display_name_of(quien_acepto),
    'Aceptó tu solicitud. Ya se ven el estado y la ubicación.',
    jsonb_build_object('type', 'connection_accepted', 'userId', quien_acepto),
    'social'
  );

  return new;
end;
$$;

drop trigger if exists connection_accepted_notify on public.connections;
create trigger connection_accepted_notify
  after update on public.connections
  for each row
  when (new.status = 'accepted' and old.status is distinct from 'accepted')
  execute function private.on_connection_accepted();

-- 5.3 · Alguien de tu círculo necesita ayuda
--
-- Acá vive la promesa literal del selector de simulacro: «Modo silencioso —
-- nadie de tu círculo se entera ni recibe nada» contra «Avisar a mi círculo —
-- les llega un aviso que dice claramente que es un simulacro, nunca el texto de
-- una alerta real». Las dos frases están en la app desde antes; esta función es
-- lo que las vuelve verdad.
create or replace function private.on_status_needs_help()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  modo text;
  circulo uuid[] := private.accepted_circle_of(new.user_id);
begin
  if array_length(circulo, 1) is null then
    return new;
  end if;

  if new.is_drill then
    -- El modo lo elige la persona al arrancar el simulacro. Se mira el último
    -- que empezó y no se canceló, dentro de una ventana corta: un simulacro
    -- viejo no puede gobernar un reporte de hoy.
    select d.mode into modo
    from public.drills d
    where d.user_id = new.user_id
      and d.cancelled_at is null
      and d.started_at > now() - interval '2 hours'
    order by d.started_at desc
    limit 1;

    -- Silencioso, o sin simulacro que lo respalde: no se manda nada. Ante la
    -- duda se calla, porque el daño de un falso «necesita ayuda» es mayor que
    -- el de un simulacro que no avisa.
    if coalesce(modo, 'silent') <> 'notify' then
      return new;
    end if;

    perform private.enqueue_notifications(
      circulo,
      'contact_needs_help',
      'Simulacro · ' || nombre,
      'Está practicando y marcó que necesita ayuda. NO es una emergencia real.',
      jsonb_build_object('type', 'contact_needs_help', 'userId', new.user_id, 'isDrill', true),
      'alerts'
    );

    return new;
  end if;

  perform private.enqueue_notifications(
    circulo,
    'contact_needs_help',
    nombre || ' necesita ayuda',
    'Marcó que necesita ayuda. Abre la app para ver dónde está.',
    jsonb_build_object('type', 'contact_needs_help', 'userId', new.user_id),
    'alerts'
  );

  return new;
end;
$$;

-- Van dos disparadores y no uno con `insert or update`: Postgres **prohíbe**
-- nombrar `old` en el `when` de un trigger de INSERT, y el `when` del de UPDATE
-- es justamente lo que evita repetir el aviso.
drop trigger if exists status_needs_help_notify on public.user_status;
create trigger status_needs_help_notify
  after insert on public.user_status
  for each row
  when (new.status = 'needs_help')
  execute function private.on_status_needs_help();

drop trigger if exists status_needs_help_notify_update on public.user_status;
create trigger status_needs_help_notify_update
  after update on public.user_status
  for each row
  when (
    new.status = 'needs_help'
    -- Solo en la transición. Sin esto, cualquier reescritura de la fila —una
    -- ubicación que llega después, por ejemplo— volvería a avisar a todo el
    -- círculo por algo que ya sabían.
    and (
      old.status is distinct from 'needs_help'
      or old.quake_event_id is distinct from new.quake_event_id
    )
  )
  execute function private.on_status_needs_help();

-- 5.4 · Te escribieron
create or replace function private.on_message_sent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.sender_id);
  destinatarios uuid[];
  cuerpo text;
begin
  select coalesce(array_agg(m.user_id), '{}'::uuid[]) into destinatarios
  from public.conversation_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id;

  if array_length(destinatarios, 1) is null then
    return new;
  end if;

  -- El cuerpo se recorta acá y no en el cliente: un mensaje largo haría que
  -- Expo rechace el push entero, y perder el aviso es peor que perder el final
  -- de la frase.
  cuerpo := left(coalesce(nullif(trim(new.body), ''), 'Te mandó un mensaje.'), 140);

  perform private.enqueue_notifications(
    destinatarios,
    'contact_message',
    case when new.is_drill then 'Simulacro · ' || nombre else nombre end,
    cuerpo,
    jsonb_build_object(
      'type', 'chat',
      'conversationId', new.conversation_id,
      'senderId', new.sender_id
    ),
    'messages'
  );

  return new;
end;
$$;

drop trigger if exists message_sent_notify on public.messages;
create trigger message_sent_notify
  after insert on public.messages
  for each row execute function private.on_message_sent();

-- ---------------------------------------------------------------------------
-- 6 · «Contacto sin responder»
--
-- El único aviso que no nace de un INSERT: nace de algo que **no** pasó. Por eso
-- lo calcula un cron y no un disparador.
--
-- Regla: a alguien de tu círculo le llegó una alerta de sismo hace más de 20
-- minutos y todavía no reportó estado para ese sismo. Los 20 minutos son para
-- que no salte por alguien que estaba manejando o durmiendo un rato.
--
-- El `dedupe_key` es lo que hace que se avise **una sola vez** por (sismo,
-- persona callada, destinatario), aunque el cron pase cada 5 minutos durante
-- las 6 horas que dura la ventana.
-- ---------------------------------------------------------------------------
create or replace function private.notify_silent_contacts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  total integer := 0;
begin
  for fila in
    select distinct d.user_id as callado, d.quake_event_id
    from public.alert_deliveries d
    join public.quake_events q on q.id = d.quake_event_id
    left join public.user_status st
      on st.user_id = d.user_id and st.quake_event_id = d.quake_event_id
    where d.status = 'sent'
      and d.sent_at < now() - interval '20 minutes'
      -- La misma ventana accionable que usa el cliente (ACTIVE_ALERT_WINDOW_MS).
      -- Pasada esa, el sismo dejó de ser una alerta y el aviso no aporta.
      and q.occurred_at > now() - interval '6 hours'
      and st.user_id is null
  loop
    total := total + private.enqueue_notifications(
      private.accepted_circle_of(fila.callado),
      'contact_not_responding',
      private.display_name_of(fila.callado) || ' no responde',
      'No reportó cómo está desde el sismo. Quizá quieras escribirle.',
      jsonb_build_object('type', 'contact_not_responding', 'userId', fila.callado),
      'alerts',
      'not_responding:' || fila.quake_event_id::text || ':' || fila.callado::text
    );
  end loop;

  return total;
end;
$$;

revoke execute on function private.notify_silent_contacts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7 · Reserva y cierre (mismo contrato que `alert_deliveries`)
-- ---------------------------------------------------------------------------
create or replace function public.claim_notification_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  user_id uuid,
  kind text,
  title text,
  body text,
  data jsonb,
  channel text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rescate de lo reservado que nadie cerró. Mismo agujero que documentó 0014:
  -- si el sender se cae después de reservar, sin esto la fila queda en
  -- 'sending' para siempre y el aviso no se manda nunca.
  update public.notification_deliveries
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      last_error = 'reservado sin cerrar: el sender no respondió'
  where status = 'sending'
    and created_at < now() - interval '5 minutes';

  -- Un «te escribieron» de ayer no sirve; uno de «necesita ayuda» tampoco, y
  -- encima asusta. Se vencen igual que los avisos de sismo.
  update public.notification_deliveries
  set status = 'expired'
  where status = 'pending'
    and created_at < now() - interval '6 hours';

  return query
  with lote as (
    select d.id
    from public.notification_deliveries d
    where d.status = 'pending'
    order by d.created_at asc
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  )
  update public.notification_deliveries d
  set status = 'sending', attempts = d.attempts + 1
  from lote
  where d.id = lote.id
  returning d.id, d.user_id, d.kind, d.title, d.body, d.data, d.channel;
end;
$$;

revoke execute on function public.claim_notification_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer) to service_role;

create or replace function public.mark_notification_deliveries(
  p_sent uuid[] default '{}',
  p_no_token uuid[] default '{}',
  p_failed uuid[] default '{}',
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notification_deliveries
  set status = 'sent', sent_at = now(), last_error = null
  where id = any(p_sent);

  update public.notification_deliveries
  set status = 'no_token'
  where id = any(p_no_token);

  -- Vuelve a la fila para el próximo ciclo, salvo que ya se haya intentado
  -- demasiadas veces. El aviso que falla siempre no puede reintentarse eterno.
  update public.notification_deliveries
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      last_error = p_error
  where id = any(p_failed);
end;
$$;

revoke execute on function public.mark_notification_deliveries(uuid[], uuid[], uuid[], text)
  from public, anon, authenticated;
grant execute on function public.mark_notification_deliveries(uuid[], uuid[], uuid[], text) to service_role;

-- ---------------------------------------------------------------------------
-- 8 · El aviso al cartero
--
-- Esto es lo que hace que un mensaje de chat llegue en segundos en vez de
-- esperar al cron. Es **por sentencia**, no por fila: encolar para un círculo de
-- diez personas dispara un HTTP, no diez.
--
-- `net.http_post` de pg_net no sale durante la transacción — se encola y lo
-- manda un worker después del commit—, así que si la transacción se revierte el
-- aviso al cartero se revierte con ella y no se despierta al sender por algo
-- que no pasó.
-- ---------------------------------------------------------------------------
create or replace function private.poke_notification_sender()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Un disparador por sentencia se ejecuta **aunque no se haya insertado nada**,
  -- y encolar para alguien que tiene el interruptor apagado inserta cero filas.
  -- Sin esta guarda, apagar una preferencia igual despertaría al cartero.
  if not exists (select 1 from encoladas) then
    return null;
  end if;

  perform net.http_post(
    url := 'https://gfutgfmiwzgjtcrinqwo.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sender-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'alert_sender_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  return null;
end;
$$;

drop trigger if exists notification_enqueued_poke on public.notification_deliveries;
create trigger notification_enqueued_poke
  after insert on public.notification_deliveries
  referencing new table as encoladas
  for each statement execute function private.poke_notification_sender();

-- ---------------------------------------------------------------------------
-- 9 · Crons
--
-- El de envío es **red de seguridad**, no el camino normal: el camino normal es
-- el aviso de la parte 8. Por eso va cada 5 minutos y no cada minuto — cubre
-- reintentos y lo que el aviso no haya alcanzado, que es raro.
--
-- Cada 5 en vez de cada 1 son 288 invocaciones/día en vez de 1.440.
-- ---------------------------------------------------------------------------
select cron.unschedule('send-notifications')
where exists (select 1 from cron.job where jobname = 'send-notifications');

select cron.schedule(
  'send-notifications',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://gfutgfmiwzgjtcrinqwo.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-sender-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'alert_sender_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);

select cron.unschedule('notify-silent-contacts')
where exists (select 1 from cron.job where jobname = 'notify-silent-contacts');

-- Cada 5 minutos: el umbral es de 20, así que esta resolución alcanza de sobra
-- y no hace falta pagar un barrido por minuto. Es SQL puro, no cuesta
-- invocaciones de edge function.
select cron.schedule(
  'notify-silent-contacts',
  '*/5 * * * *',
  $job$ select private.notify_silent_contacts() $job$
);

-- ---------------------------------------------------------------------------
-- 10 · Recorte de latencia del aviso de sismo
--
-- Medido con el M7,2 de Coracora del 2026-08-20:
--
--   18:00:16  ocurre
--   18:08:01  entra a nuestra base   (+7m45s — del IGP, no nuestro)
--   18:09:00  se encola el aviso     (+59s  — esperando al cron de fan-out)
--   18:09:27  vence el jitter        (+27s)
--   18:10:00  sale el push           (+33s  — esperando al cron de envío)
--
-- El minuto del fan-out es puro tiempo de espera: el sismo ya estaba en la
-- tabla. Este disparador lo encola en la **misma transacción** que lo inserta,
-- así que ese tramo pasa a ser cero. Es SQL dentro de la transacción de la
-- ingesta: no agrega ni una invocación de edge function.
--
-- Los otros dos tramos se quedan a propósito. El jitter dispersa el despertar
-- de los teléfonos (spec §6) y el cron de envío acota la espera del jitter a un
-- minuto. Y sobre todo: el tramo que domina son los 7m45s del IGP, que es el
-- 79 % del total y no es nuestro (§1.11).
--
-- El cron de fan-out se queda igual. No es redundante: es el que reevalúa un
-- sismo **corregido** (de 4.2 a 4.8), que este disparador no ve porque el
-- `when` lo excluye.
-- ---------------------------------------------------------------------------
create or replace function private.fan_out_on_ingest()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.fan_out_quake(new.id);
  return null;
end;
$$;

drop trigger if exists quake_ingested_fan_out on public.quake_events;
create trigger quake_ingested_fan_out
  after insert or update on public.quake_events
  for each row
  when (new.canonical_id is null and new.fanned_out_at is null)
  execute function private.fan_out_on_ingest();
