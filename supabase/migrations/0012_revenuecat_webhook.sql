-- ============================================================================
-- 0012 · Webhook de RevenueCat (spec §12 y §13)
--
-- Cierra el circuito de Premium. Hasta acá `user_settings.is_premium` existía
-- pero nadie lo escribía: está fuera del grant de UPDATE de `authenticated`
-- (migración 0001) justamente para que la app no pueda otorgárselo sola.
--
-- Quien lo escribe es la edge function `revenuecat-webhook`, con service role,
-- cuando RevenueCat le avisa que alguien compró, renovó, canceló o venció.
--
-- Autenticación RevenueCat → edge function: el mismo patrón que la ingesta de
-- sismos (0007). Un secreto aleatorio en Vault; acá se genera y desde el
-- dashboard de RevenueCat se pega como header `Authorization`. Nunca queda en
-- el repo.
--
--   select public.get_revenuecat_secret();   -- para leerlo y copiarlo
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Secreto compartido
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'revenuecat_webhook_secret') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'revenuecat_webhook_secret',
      'Secreto compartido: RevenueCat -> edge function revenuecat-webhook'
    );
  end if;
end;
$$;

create or replace function public.get_revenuecat_secret()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'revenuecat_webhook_secret';
$$;

revoke execute on function public.get_revenuecat_secret() from public, anon, authenticated;
grant execute on function public.get_revenuecat_secret() to service_role;

-- ---------------------------------------------------------------------------
-- Bitácora de eventos
--
-- Cumple dos funciones distintas, y por eso existe aunque RevenueCat ya tenga
-- su propio historial:
--
-- 1. **Idempotencia.** RevenueCat reintenta hasta 5 veces si no recibe un 200
--    (5, 10, 20, 40 y 80 minutos). Sin una clave por evento, un timeout de red
--    haría reprocesar la misma compra varias veces. `event_id` es la primary
--    key: el segundo intento choca y se descarta sin volver a escribir.
--
-- 2. **Auditoría.** Cuando alguien reclame "pagué y no me aparece", esta tabla
--    dice si el evento llegó, a qué usuario se mapeó y qué se hizo con él. El
--    payload crudo queda guardado para poder reprocesar a mano.
--
-- Sin políticas de RLS a propósito: solo el service role la toca. `anon` y
-- `authenticated` no tienen grant, así que RLS habilitado sin políticas es
-- exactamente lo que se quiere (nadie más la ve).
-- ---------------------------------------------------------------------------
create table public.revenuecat_events (
  event_id text primary key,
  type text not null,
  app_user_id text,
  environment text,
  -- Qué se hizo: otorgar, quitar, mover de un usuario a otro (TRANSFER),
  -- ignorar (eventos que no cambian el acceso, como BILLING_ISSUE) o no mapeado
  -- (el app_user_id no corresponde a ningún usuario de esta base).
  outcome text not null check (outcome in ('grant', 'revoke', 'transfer', 'ignored', 'unmapped')),
  affected_user_ids uuid[] not null default '{}',
  received_at timestamptz not null default now(),
  payload jsonb not null
);

create index revenuecat_events_received_at_idx on public.revenuecat_events (received_at desc);

alter table public.revenuecat_events enable row level security;

comment on table public.revenuecat_events is
  'Eventos crudos del webhook de RevenueCat. La primary key es el id del evento: sirve de candado de idempotencia contra los reintentos de RevenueCat.';

-- ---------------------------------------------------------------------------
-- Retención
--
-- El volumen es bajo (un puñado de eventos por suscriptor y mes), pero una
-- bitácora sin poda crece para siempre. Un año cubre de sobra cualquier
-- reclamo de facturación.
-- ---------------------------------------------------------------------------
select cron.unschedule('prune-revenuecat-events')
where exists (select 1 from cron.job where jobname = 'prune-revenuecat-events');

select cron.schedule(
  'prune-revenuecat-events',
  '23 4 * * *',
  $job$ delete from public.revenuecat_events where received_at < now() - interval '1 year' $job$
);
