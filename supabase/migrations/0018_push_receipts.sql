-- ============================================================================
-- 0018 · Receipts: saber si el push llegó de verdad
--
-- Hasta acá `status = 'sent'` significaba **"Expo aceptó el mensaje"**, que no
-- es lo mismo que "Apple lo entregó". Con una credencial de APNs mal asignada
-- el ticket sale `ok` igual, y el fallo aparece recién en el *receipt*, que se
-- pide después con el `ticket_id`.
--
-- Ese id se estaba tirando. La consecuencia se vio el 2026-08-21, tratando de
-- responder por qué un sismo real no despertó la app: **la pregunta era
-- contestable y no había con qué**. Los receipts de Expo viven 24 horas, así
-- que el del M7,2 seguía disponible y no se podía pedir por falta del id.
--
-- ## Por qué una tabla aparte y no columnas en las colas
--
-- Un aviso puede ir a varios dispositivos, y ahora además va en **dos
-- mensajes** (uno visible y uno silencioso, ver 0018 §3 y `send-alerts`). O sea
-- que un `alert_deliveries` genera N tickets, no uno. Meter `ticket_id` como
-- columna obligaría a elegir cuál guardar y perder el resto — justo los que
-- harían falta para saber qué dispositivo falló.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La tabla
-- ---------------------------------------------------------------------------
create table if not exists public.push_receipts (
  -- El id que devuelve Expo al aceptar el mensaje. Es la llave para pedirle
  -- después el veredicto de APNs/FCM.
  ticket_id text primary key,

  /** De qué cola salió: 'alert' (sismo) o 'notification' (entre personas). */
  kind text not null check (kind in ('alert', 'notification')),
  delivery_id uuid not null,
  user_id uuid references auth.users (id) on delete set null,

  -- Se guarda el token y no solo el usuario: un `DeviceNotRegistered` en el
  -- receipt identifica **un dispositivo**, no una persona, y sin esto no habría
  -- forma de saber cuál de sus teléfonos borrar.
  token text not null,

  /** Visible o silencioso. Son mensajes distintos y pueden fallar distinto. */
  channel text not null default 'visible' check (channel in ('visible', 'silent')),

  sent_at timestamptz not null default now(),

  /** null = todavía sin revisar. */
  status text check (status in ('ok', 'error')),
  error text,
  checked_at timestamptz
);

-- El barrido busca lo no revisado por antigüedad. Índice parcial: en cuanto se
-- revisa, la fila sale del índice y no lo engorda.
create index if not exists push_receipts_pendientes_idx
  on public.push_receipts (sent_at)
  where status is null;

-- Tabla interna: RLS activa y cero políticas, igual que las dos colas.
alter table public.push_receipts enable row level security;
revoke all on public.push_receipts from public, anon, authenticated;
grant all on public.push_receipts to service_role;

-- ---------------------------------------------------------------------------
-- 2 · Anotar los tickets
--
-- La llaman los dos senders justo después de que Expo acepta un lote.
-- `on conflict do nothing` porque un reintento del mismo lote puede repetir
-- ids, y anotar dos veces no aporta nada.
-- ---------------------------------------------------------------------------
create or replace function public.record_push_tickets(p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  anotados integer;
begin
  insert into public.push_receipts (ticket_id, kind, delivery_id, user_id, token, channel)
  select
    r->>'ticket_id',
    r->>'kind',
    (r->>'delivery_id')::uuid,
    nullif(r->>'user_id', '')::uuid,
    r->>'token',
    coalesce(r->>'channel', 'visible')
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  where r->>'ticket_id' is not null
  on conflict (ticket_id) do nothing;

  get diagnostics anotados = row_count;
  return anotados;
end;
$$;

revoke execute on function public.record_push_tickets(jsonb) from public, anon, authenticated;
grant execute on function public.record_push_tickets(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3 · Qué revisar
--
-- Dos bordes, los dos de Expo:
--
--   · **15 minutos de piso.** Expo recomienda esperar ese rato: antes, el
--     receipt todavía puede no existir y se gastaría el viaje.
--   · **20 horas de techo.** Los receipts se borran a las 24 h. Pedir uno más
--     viejo devuelve nada y la fila quedaría dando vueltas para siempre; a las
--     20 h se da por vencida (ver parte 5).
-- ---------------------------------------------------------------------------
create or replace function public.list_pending_receipts(p_limit integer default 300)
returns table (ticket_id text, token text)
language sql
stable
security definer
set search_path = ''
as $$
  select r.ticket_id, r.token
  from public.push_receipts r
  where r.status is null
    and r.sent_at < now() - interval '15 minutes'
    and r.sent_at > now() - interval '20 hours'
  order by r.sent_at asc
  limit greatest(1, least(p_limit, 300));
$$;

revoke execute on function public.list_pending_receipts(integer) from public, anon, authenticated;
grant execute on function public.list_pending_receipts(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4 · Anotar el veredicto, y limpiar lo que ya no sirve
--
-- Devuelve cuántos tokens muertos borró, que es lo único que hace falta saber
-- del lado de la edge function.
-- ---------------------------------------------------------------------------
create or replace function public.record_push_receipts(p_rows jsonb)
returns table (anotados integer, tokens_borrados integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  n_anotados integer := 0;
  n_borrados integer := 0;
begin
  with entrada as (
    select
      r->>'ticket_id' as ticket_id,
      r->>'status'    as status,
      nullif(r->>'error', '') as error
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) as r
  ),
  aplicado as (
    update public.push_receipts pr
    set status = e.status,
        error = e.error,
        checked_at = now()
    from entrada e
    where pr.ticket_id = e.ticket_id
    returning 1
  )
  select count(*) into n_anotados from aplicado;

  -- El dispositivo desinstaló la app o revocó el permiso. El receipt es donde
  -- más aparece este error —en el ticket llega tarde o nunca—, así que es acá
  -- donde de verdad se limpia la tabla de tokens.
  with muertos as (
    delete from public.push_tokens t
    where t.token in (
      select pr.token from public.push_receipts pr
      where pr.error = 'DeviceNotRegistered'
    )
    returning 1
  )
  select count(*) into n_borrados from muertos;

  return query select n_anotados, n_borrados;
end;
$$;

revoke execute on function public.record_push_receipts(jsonb) from public, anon, authenticated;
grant execute on function public.record_push_receipts(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 5 · Vencimiento y poda
--
-- Lo que pasó las 20 h sin revisar no se puede revisar nunca más: se marca como
-- vencido para que salga del índice de pendientes en vez de reintentarse eterno.
-- ---------------------------------------------------------------------------
create or replace function private.expire_stale_receipts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.push_receipts
  set status = 'error',
      error = 'receipt vencido: Expo los borra a las 24 h',
      checked_at = now()
  where status is null
    and sent_at < now() - interval '20 hours';

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function private.expire_stale_receipts() from public, anon, authenticated;

select cron.unschedule('prune-push-receipts')
where exists (select 1 from cron.job where jobname = 'prune-push-receipts');

select cron.schedule(
  'prune-push-receipts',
  '31 4 * * *',
  $job$
  select private.expire_stale_receipts();
  delete from public.push_receipts where sent_at < now() - interval '30 days';
  $job$
);

-- ---------------------------------------------------------------------------
-- 6 · El cron del barrido
--
-- Cada 15 minutos, que es el piso que recomienda Expo. No hace falta más fino:
-- esto no es un camino de entrega sino de auditoría, y la ventana útil es de
-- 24 horas.
-- ---------------------------------------------------------------------------
select cron.unschedule('check-receipts')
where exists (select 1 from cron.job where jobname = 'check-receipts');

select cron.schedule(
  'check-receipts',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://gfutgfmiwzgjtcrinqwo.supabase.co/functions/v1/check-receipts',
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
