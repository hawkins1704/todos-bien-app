-- ============================================================================
-- 0019 · Migajas de la tarea de fondo
--
-- Existe por una ambigüedad que no se puede resolver mirando desde el servidor.
--
-- Cuando llega un push silencioso y la ubicación NO se captura, hay dos causas
-- posibles que dejan **exactamente el mismo rastro** —ninguno—:
--
--   1. iOS nunca levantó la app.
--   2. iOS la levantó y la tarea murió antes de llegar a la red.
--
-- La diferencia importa mucho: la primera es una regla del sistema operativo y
-- no tiene arreglo del lado nuestro; la segunda es un bug nuestro. Sin poder
-- separarlas quedamos repitiendo pruebas a ciegas — ya pasó dos veces el
-- 2026-08-21 (§3.8.2 del estado del proyecto).
--
-- La tarea deja ahora una migaja **local** en su primera línea, antes de
-- consultar nada. Local a propósito: una escritura de red al arrancar en modo
-- headless podría fallar justamente por lo mismo que estamos investigando, y
-- entonces la migaja tendría el mismo punto ciego que el problema. Se suben
-- todas juntas la próxima vez que la app sincroniza.
--
-- Consecuencia útil: el dato lo va a dar el **uso real** —un sismo de verdad,
-- en el teléfono de cualquier usuario— y no una prueba armada.
--
-- Es una tabla de diagnóstico, no un histórico: 30 días y se barre, igual que
-- sus hermanas `alert_deliveries` (0010) y `notification_deliveries` (0017).
-- ============================================================================

create table public.background_traces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,

  -- Qué punto del recorrido alcanzó la tarea. Los valores los define el
  -- cliente (`src/lib/background-trace.ts`); acá es texto libre a propósito,
  -- para no necesitar una migración cada vez que se agrega un punto de medida.
  stage text not null,
  detail text,

  -- Reloj del DISPOSITIVO, que es el único que sabe cuándo despertó. Puede
  -- venir corrido respecto del servidor; para leerlo se compara contra
  -- `push_receipts.sent_at` con esa tolerancia en mente.
  at timestamptz not null,

  uploaded_at timestamptz not null default now()
);

create index background_traces_user_at_idx
  on public.background_traces (user_id, at desc);

alter table public.background_traces enable row level security;

-- Cada quien escribe y lee lo suyo. No hay update ni delete: una migaja que se
-- puede editar no sirve como evidencia.
create policy background_traces_select_own on public.background_traces
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy background_traces_insert_own on public.background_traces
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant select, insert on public.background_traces to authenticated;

select cron.unschedule('prune-background-traces')
where exists (select 1 from cron.job where jobname = 'prune-background-traces');

select cron.schedule(
  'prune-background-traces',
  '41 4 * * *',
  $job$ delete from public.background_traces where uploaded_at < now() - interval '30 days' $job$
);
