-- ============================================================================
-- 0007 · Ingesta automática de sismos (spec §6)
--
-- pg_cron dispara la edge function `ingest-quakes` cada 2 minutos vía pg_net.
--
-- Autenticación cron → edge function: un secreto compartido guardado en Vault.
-- Ambos lados lo leen de la base (el job desde vault.decrypted_secrets, la
-- función desde get_ingest_secret()), así que no hay que cargarlo a mano en
-- ningún dashboard ni dejarlo en el repo.
-- ============================================================================

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Secreto compartido
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'quake_ingest_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'quake_ingest_secret',
      'Secreto compartido: pg_cron -> edge function ingest-quakes'
    );
  end if;
end;
$$;

-- Solo el service_role puede leerlo. `anon` y `authenticated` no lo tocan.
create or replace function public.get_ingest_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'quake_ingest_secret';
$$;

revoke execute on function public.get_ingest_secret() from public, anon, authenticated;
grant execute on function public.get_ingest_secret() to service_role;

-- ---------------------------------------------------------------------------
-- Job de cron
--
-- Cada 2 minutos: 720 consultas diarias por fuente. Es una frecuencia razonable
-- para una app de sismos y respeta el pedido de la spec §6 de no exceder una
-- frecuencia de consulta razonable contra el IGP, que no publica una API
-- oficial para terceros. La función además se auto-limita internamente.
-- ---------------------------------------------------------------------------
select cron.unschedule('ingest-quakes')
where exists (select 1 from cron.job where jobname = 'ingest-quakes');

select cron.schedule(
  'ingest-quakes',
  '*/2 * * * *',
  $job$
  select net.http_post(
    url := 'https://gfutgfmiwzgjtcrinqwo.supabase.co/functions/v1/ingest-quakes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', (
        select decrypted_secret from vault.decrypted_secrets where name = 'quake_ingest_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $job$
);
