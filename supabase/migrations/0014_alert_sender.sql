-- ============================================================================
-- 0014 · El sender: de la cola al teléfono
--
-- La migración 0010 dejó la cola `alert_deliveries` llenándose sola y definió el
-- contrato (`claim_alert_deliveries` / `mark_alert_deliveries`), pero no había
-- nadie del otro lado. Esta migración agrega lo que falta del lado de Postgres
-- para que la edge function `send-alerts` pueda correr:
--
--   1. El secreto compartido cron -> edge function (mismo patrón que 0007).
--   2. Un rescate para los avisos que quedan trabados en 'sending'.
--   3. El cron que dispara el envío.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · Secreto compartido
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'alert_sender_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'alert_sender_secret',
      'Secreto compartido: pg_cron -> edge function send-alerts'
    );
  end if;
end;
$$;

create or replace function public.get_alert_sender_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'alert_sender_secret';
$$;

revoke execute on function public.get_alert_sender_secret() from public, anon, authenticated;
grant execute on function public.get_alert_sender_secret() to service_role;

-- ---------------------------------------------------------------------------
-- 2 · Rescate de los avisos trabados en 'sending'
--
-- 🔴 Agujero real en el contrato de 0010, encontrado al escribir el sender.
--
-- `claim_alert_deliveries` marca el lote como 'sending' y lo devuelve. Si la
-- edge function se cae, se queda sin tiempo o pierde la red DESPUÉS de reservar
-- y ANTES de llamar a `mark_alert_deliveries`, esas filas quedan en 'sending'
-- **para siempre**: ningún claim posterior las vuelve a mirar, porque el claim
-- solo busca 'pending'. El aviso no se manda nunca y nada lo denuncia.
--
-- Es el modo de falla más probable de todo el circuito, porque depende de un
-- hop HTTP a un servicio de terceros.
--
-- La solución es la clásica de las colas: un aviso reservado hace más de 5
-- minutos se considera abandonado y vuelve a la fila. Repetir es seguro —el
-- peor caso es un aviso duplicado, mucho menos grave que uno perdido— y el
-- contador de intentos evita el bucle infinito.
--
-- Va dentro del propio claim, y no en un cron aparte, para que no exista la
-- posibilidad de olvidarse de agendarlo.
-- ---------------------------------------------------------------------------
create or replace function public.claim_alert_deliveries(p_limit integer default 100)
returns table (
  delivery_id uuid,
  user_id uuid,
  quake_event_id uuid,
  magnitude numeric,
  place text,
  region text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Rescate: lo que quedó reservado y nadie cerró vuelve a la fila.
  update public.alert_deliveries
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      last_error = 'reservado sin cerrar: el sender no respondió'
  where status = 'sending'
    and created_at < now() - interval '5 minutes';

  -- Expiración: un aviso de sismo que llega tres horas tarde no sirve y además
  -- es dañino (ver 0010 §7).
  update public.alert_deliveries d
  set status = 'expired'
  from public.quake_events q
  where q.id = d.quake_event_id
    and d.status = 'pending'
    and q.occurred_at < now() - interval '2 hours';

  return query
  with lote as (
    select d.id
    from public.alert_deliveries d
    where d.status = 'pending'
      and d.send_after <= now()
    order by d.send_after asc
    limit greatest(1, least(p_limit, 500))
    for update skip locked
  )
  update public.alert_deliveries d
  set status = 'sending', attempts = d.attempts + 1
  from lote, public.quake_events q
  where d.id = lote.id and q.id = d.quake_event_id
  returning d.id, d.user_id, d.quake_event_id,
            q.magnitude, q.place, q.region, q.occurred_at;
end;
$$;

revoke execute on function public.claim_alert_deliveries(integer) from public, anon, authenticated;
grant execute on function public.claim_alert_deliveries(integer) to service_role;

-- El rescate necesita encontrar rápido lo reservado hace rato. Sin este índice
-- el UPDATE de arriba recorre la tabla entera en cada claim.
create index if not exists alert_deliveries_sending_idx
  on public.alert_deliveries (created_at)
  where status = 'sending';

-- ---------------------------------------------------------------------------
-- 3 · Cron
--
-- Cada minuto, igual que el fan-out. El jitter de la spec §6 reparte los envíos
-- en una ventana de 30 s, así que un aviso encolado espera a lo sumo un ciclo.
--
-- Sobre bajar a 30 s: se puede, pero el cuello de botella no está acá. Del
-- sismo a nuestra base pasan ~6 minutos, de los cuales 4 a 6 son del IGP y son
-- inevitables (§1.11). Acelerar este tramo optimiza el eslabón que ya es corto.
-- ---------------------------------------------------------------------------
select cron.unschedule('send-alerts')
where exists (select 1 from cron.job where jobname = 'send-alerts');

select cron.schedule(
  'send-alerts',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://gfutgfmiwzgjtcrinqwo.supabase.co/functions/v1/send-alerts',
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
