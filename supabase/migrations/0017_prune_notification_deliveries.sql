-- ============================================================================
-- 0017 · Retención de la cola de avisos entre personas
--
-- Descuido de 0015, encontrado al limpiar una fila de prueba: sus dos tablas
-- hermanas —`alert_deliveries` (0010) y `revenuecat_events` (0012)— tienen poda
-- automática desde el día uno, y la nueva quedó sin ninguna.
--
-- Y es justo la que menos podía quedarse sin barrer: genera **una fila por
-- mensaje de chat y por destinatario**, así que con uso real crece mucho más
-- rápido que la de sismos, donde solo hay filas cuando de verdad tiembla.
--
-- 30 días, igual que la de alertas. Es una bitácora de entregas para poder
-- contestar "no me llegó el aviso", no un histórico que valga la pena guardar.
-- ============================================================================
select cron.unschedule('prune-notification-deliveries')
where exists (select 1 from cron.job where jobname = 'prune-notification-deliveries');

select cron.schedule(
  'prune-notification-deliveries',
  '29 4 * * *',
  $job$ delete from public.notification_deliveries where created_at < now() - interval '30 days' $job$
);
