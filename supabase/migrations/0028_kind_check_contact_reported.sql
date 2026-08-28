-- 0028 · Faltaba `contact_reported` en el CHECK de notification_deliveries.kind.
--
-- Arregla un error introducido por la 0027 el mismo día. La 0027 agregó el tipo
-- nuevo en tres lugares —la columna de preferencias, la rama del `case` en
-- `enqueue_notifications` y el disparador que lo emite— y se olvidó del cuarto:
-- la lista blanca de la propia tabla.
--
-- EL EFECTO NO FUE «no llega la notificación», y por eso vale la pena escribirlo.
-- El insert violaba el CHECK, la excepción subía por el trigger AFTER UPDATE, y
-- **revertía el UPDATE de `user_status` entero**. Reportar «estoy bien» dejó de
-- funcionar para cualquiera que estuviera en un sismo junto a un contacto de su
-- círculo: la función central de la app, rota por una lista de strings.
--
-- Se vio desde el teléfono como el outbox atascado —«1 por enviar»— y el estado
-- volviendo solo a «necesito ayuda» al refrescar. La app se comportó bien: la
-- escritura falló, no se perdió, y la pantalla mostró el último estado que el
-- servidor sí tenía.
--
-- PARA LA PRÓXIMA VEZ QUE SE AGREGUE UN TIPO DE NOTIFICACIÓN son CUATRO lugares,
-- y no hay compilador que avise en ninguno:
--   1. `notification_deliveries_kind_check`   ← el que se olvidó
--   2. `private.enqueue_notifications`, la rama del `case`
--   3. `notification_preferences`, la columna, si se quiere poder apagarlo
--   4. quien lo emite
--
-- Un tipo que falta en (2) se cuela sin respetar la preferencia, en silencio.
-- Un tipo que falta en (1) tira abajo la transacción de quien lo disparó.
-- El segundo es mucho peor y es el que no se ve venir.

alter table public.notification_deliveries
  drop constraint notification_deliveries_kind_check;

alter table public.notification_deliveries
  add constraint notification_deliveries_kind_check
  check (kind = any (array[
    'connection_request',
    'connection_accepted',
    'contact_needs_help',
    'contact_message',
    'contact_not_responding',
    'quake_national',
    'quake_worldwide',
    'contact_in_quake_zone',
    'contact_is_safe',
    'contact_reported'
  ]));
