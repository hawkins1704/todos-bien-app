import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';

import { captureLocationForActiveAlert } from '@/lib/alert-response';
import { fetchActiveAlert } from '@/lib/api';
import { traceBackground } from '@/lib/background-trace';

/**
 * La mitad silenciosa del push (spec §7, §3.2).
 *
 * El aviso de sismo hace dos trabajos con un solo mensaje: muestra la alerta y
 * —gracias a `contentAvailable`, que pone el sender— despierta la app unos
 * segundos en segundo plano. Este archivo es lo que corre en esos segundos.
 *
 * ## Por qué importa
 *
 * Sin esto, la ubicación que la app guarda es dónde está la persona **cuando
 * abre la app**. Con el teléfono en el bolsillo a las 3 de la mañana, eso puede
 * ser diez horas y varios kilómetros después.
 *
 * La promesa que sostiene este archivo es "**minutos después del sismo, tu gente
 * ve dónde estás**" (`docs/QUE-PROMETE-LA-APP.md` §6) — no "dónde estabas
 * cuando tembló", que se retiró por no ser cierta: el aviso llega ~8 minutos
 * tarde, de los cuales 7:45 son del IGP. La distinción no es de marketing: acá
 * es la diferencia entre una respuesta útil —dónde está ahora, para ir a
 * buscarla— y una respuesta falsa.
 *
 * ## Por qué no se lee el payload
 *
 * Sería natural sacar el `quakeEventId` del mensaje, pero la forma del payload
 * cambia entre iOS y Android —y entre versiones del SDK—, así que depender de
 * ella es frágil para algo que corre sin nadie mirando y sin forma de depurar.
 *
 * En su lugar, cualquier despertar se trata como "andá a fijarte si hay una
 * alerta activa". Es robusto y además **más correcto**: `get_active_alert()`
 * resuelve el evento canónico contra los umbrales y la ubicación de esta
 * persona en el servidor, así que confirma que la alerta de verdad le aplica en
 * vez de confiar en lo que vino en el mensaje. El único push silencioso que
 * manda esta app es el de sismo, así que no hay despertares de más.
 */
const BACKGROUND_ALERT_TASK = 'todos-bien-background-alert';

TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_ALERT_TASK,
  async ({ error }) => {
    // Lo PRIMERO, antes de cualquier otra cosa. Esta línea es la que distingue
    // "iOS nunca levantó la app" de "la levantó y se murió": las dos se ven
    // igual desde el servidor si no queda rastro (ver `background-trace.ts`).
    await traceBackground('woke', error ? 'con error de TaskManager' : undefined);

    if (error) return Notifications.BackgroundNotificationTaskResult.Failed;

    try {
      const quake = await fetchActiveAlert();
      if (!quake) {
        await traceBackground('alert:none');
        return Notifications.BackgroundNotificationTaskResult.NoData;
      }

      await traceBackground('alert:found', quake.id);

      // Sin jitter: iOS da ~30 segundos para todo esto y el GPS se puede comer
      // buena parte. La dispersión que busca la spec §6 ya la aplica el
      // servidor, que reparte los envíos con `send_after` en una ventana de 30
      // segundos, así que los dispositivos ni siquiera despiertan a la vez.
      const captured = await captureLocationForActiveAlert(quake, { jitter: false });

      await traceBackground(captured ? 'captured' : 'no-fix');

      return captured
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch (caught) {
      // Sin sesión, sin permiso de ubicación o sin red. No hay nada que
      // reintentar acá: al abrir la app, el refresco vuelve a intentarlo.
      await traceBackground('error', caught instanceof Error ? caught.message : String(caught));
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  },
);

/**
 * Registra la tarea. Se llama una vez al arrancar, desde el layout raíz.
 *
 * La definición de arriba tiene que ejecutarse al **cargar el módulo**, no
 * dentro de un componente: cuando llega un push con la app cerrada, iOS levanta
 * el bundle de JS y busca la tarea ya definida. Si viviera dentro de un
 * `useEffect` no existiría todavía.
 */
export async function registerBackgroundAlertTask(): Promise<void> {
  try {
    await Notifications.registerTaskAsync(BACKGROUND_ALERT_TASK);
  } catch (caught) {
    // No poder registrarla no puede impedir que la app arranque: sin esto se
    // pierde la captura automática, no la app.
    if (__DEV__) console.warn('[push] no se pudo registrar la tarea de fondo', caught);
  }
}
