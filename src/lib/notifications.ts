import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { KV, kvGet, kvSet } from '@/lib/db/kv';
import { supabase } from '@/lib/supabase';

/**
 * Notificaciones push (spec §7).
 *
 * El registro del token tiene una sola función, `syncPushToken()`, que se llama
 * desde dos lados: el onboarding y **cada refresco**. Que sea idempotente es lo
 * que permite eso, y lo segundo es lo que evita que alguien quede sin token
 * para siempre por haber concedido el permiso en el momento equivocado.
 *
 * Sale sin ruido si falta algo (simulador, sin `projectId`, sin permiso): que
 * no haya push no puede trabar el resto de la app.
 */

/**
 * La conversación que la persona está mirando en este momento, si hay alguna.
 *
 * Vive en el módulo y no en un contexto de React a propósito: quien la consulta
 * es `setNotificationHandler`, que corre **fuera** del árbol de componentes
 * cuando llega un push. Un hook no llegaría hasta ahí.
 */
let conversacionAbierta: string | null = null;

/** La llama la pantalla de chat al enfocarse y al salir (con `null`). */
export function setOpenConversation(conversationId: string | null): void {
  conversacionAbierta = conversationId;
}

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as
      | { type?: string; conversationId?: string }
      | undefined;

    // Un banner por un mensaje del chat que ya está abierto en pantalla es
    // ruido puro: la persona está leyendo justo eso. El mensaje igual aparece
    // en la conversación; lo único que se suprime es la interrupción.
    if (data?.type === 'chat' && data.conversationId === conversacionAbierta) {
      return {
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      };
    }

    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    };
  },
});

export const ANDROID_CHANNELS = {
  alerts: 'alerts',
  messages: 'messages',
  social: 'social',
  /**
   * Noticias de sismos que NO dispararon una alerta (migración 0021).
   *
   * Va en su propio canal, y no en `alerts`, porque en Android eso es una
   * categoría que la persona puede silenciar desde los ajustes del sistema.
   * Mezclarlas obligaría a elegir entre enterarse de todo o de nada — y lo que
   * se apagaría de paso es el aviso que sí importa.
   */
  quakes: 'quakes',
} as const;

/** Android 13+ exige que el canal exista antes de pedir el token. */
export async function ensureAndroidChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.alerts, {
    name: 'Alertas de sismo',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#FF3B30',
  });

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.messages, {
    name: 'Mensajes',
    importance: Notifications.AndroidImportance.HIGH,
  });

  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.social, {
    name: 'Solicitudes y avisos',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  // Importancia baja a propósito: informa sin interrumpir, que es la diferencia
  // con `alerts`. Un sismo del que te enterás por curiosidad no puede sonar
  // igual que uno que te tocó.
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNELS.quakes, {
    name: 'Noticias de sismos',
    importance: Notifications.AndroidImportance.LOW,
  });
}

export async function getNotificationPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
}

/**
 * Igual que el anterior pero con `canAskAgain`, que es la diferencia entre
 * ofrecer un botón que abre el diálogo del sistema y ofrecer uno que no hace
 * nada. Cuando el SO ya no vuelve a preguntar, la única vía son sus Ajustes.
 */
export async function getNotificationPermissionState(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const { granted, canAskAgain } = await Notifications.getPermissionsAsync();
  return { granted, canAskAgain };
}

export async function requestNotificationPermission(): Promise<boolean> {
  await ensureAndroidChannels();

  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return true;

  const { granted } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });

  return granted;
}

function easProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? null;
}

/**
 * Registra por qué NO se registró el token.
 *
 * Son cinco motivos distintos y ninguno lanza error, así que sin esto el
 * síntoma es siempre el mismo —`push_tokens` vacía— y no hay forma de saber
 * cuál de los cinco fue. Solo en desarrollo: en producción no aporta nada.
 */
function skip(reason: string): false {
  if (__DEV__) console.log(`[push] token no registrado: ${reason}`);
  return false;
}

/**
 * Registra el token de push del dispositivo, si hace falta.
 *
 * Se llama desde el onboarding (al conceder el permiso) **y desde cada
 * refresco**. Esa segunda llamada no es redundante: es lo único que cubre todo
 * lo que pasa después del onboarding.
 *
 * Sin ella había un callejón sin salida idéntico al de la ubicación (§1.6.3.1),
 * y tampoco era teórico: el registro vivía **solo** en el último paso del
 * onboarding, que no se repite nunca. Entonces:
 *
 * - Quien concedió el permiso desde los Ajustes del sistema, después del
 *   onboarding, nunca registraba el token.
 * - Y peor, quien completó el onboarding cuando todavía no existía el
 *   `projectId` de EAS —o sea, todas las cuentas creadas antes del 2026-08-19—
 *   tampoco, porque en ese momento la función salía en silencio por diseño.
 *
 * El resultado era una app instalada en un teléfono real con `push_tokens`
 * vacía y sin ninguna forma de arreglarlo salvo reinstalar.
 *
 * Se pide el token en cada refresco pero **solo se escribe una vez por
 * arranque**: el token rota muy de vez en cuando y no tiene sentido gastar una
 * escritura cada vez que alguien vuelve a la app.
 *
 * ## Por qué «una vez por arranque» y no «una vez y ya»
 *
 * El atajo anterior era `si el token es el mismo que guardé, no hago nada`, y
 * eso da por sentado algo que solo el servidor sabe: que la fila sigue ahí.
 * Puede no estar — `send-alerts` borra los tokens que Expo devuelve como
 * `DeviceNotRegistered` (`send-alerts/index.ts:304`).
 *
 * ⚠️ **Esto es defensivo, no el arreglo de un fallo observado, y conviene que
 * quede escrito así.** El 2026-09-02 se borró a mano la fila de un teléfono
 * real para probar el distintivo de la 0039. Al mirar al minuto siguiente el
 * token no había vuelto y se dio por confirmado un silencio permanente; **fue
 * una conclusión apurada sobre una sola lectura.** Dos minutos después el token
 * estaba de vuelta, escrito por la propia app. Nunca se estableció por qué el
 * atajo no lo frenó.
 *
 * Lo que queda entonces no es un bug medido sino una garantía que faltaba: con
 * la bandera, cada arranque vuelve a afirmar el token contra el servidor, y no
 * hace falta saber por qué la caché local y la tabla se separaron para que se
 * vuelvan a juntar. Cuesta **una** escritura por sesión, así que el sondeo de
 * 8 s del simulacro no escribe nada.
 */

/** Si el servidor ya confirmó el token en ESTE arranque. Ver el bloque de arriba. */
let confirmadoEnEsteArranque = false;
export async function syncPushToken(userId: string): Promise<boolean> {
  if (!Device.isDevice) return skip('es el simulador, no entrega tokens de APNs');

  const projectId = easProjectId();
  if (!projectId) return skip('falta el projectId de EAS en app.json');

  const granted = await getNotificationPermission();
  if (!granted) return skip('el permiso de notificaciones no está concedido');

  await ensureAndroidChannels();

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  if (confirmadoEnEsteArranque && (await kvGet<string>(KV.pushToken)) === token) {
    return skip('ya confirmado contra el servidor en este arranque');
  }

  const { error } = await supabase.from('push_tokens').upsert(
    {
      user_id: userId,
      token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      device_name: Device.deviceName ?? null,
    },
    { onConflict: 'token' },
  );

  if (error) throw error;

  await kvSet(KV.pushToken, token);
  confirmadoEnEsteArranque = true;
  if (__DEV__) console.log('[push] token registrado:', token);
  return true;
}
