import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

/**
 * Notificaciones push (spec §7).
 *
 * ESTADO: el permiso y los handlers ya funcionan. El registro del token está
 * a la espera de que la cuenta de Apple Developer vuelva a estar activa, porque
 * hace falta crear la APNs Key, cargarla en EAS y tener un projectId de EAS.
 * Ver docs/ESTADO-DEL-PROYECTO.md §3.
 *
 * `registerPushToken()` se puede llamar hoy sin romper nada: detecta que falta
 * el projectId y sale sin hacer ruido.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const ANDROID_CHANNELS = {
  alerts: 'alerts',
  messages: 'messages',
  social: 'social',
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
}

export async function getNotificationPermission(): Promise<boolean> {
  const { granted } = await Notifications.getPermissionsAsync();
  return granted;
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
 * Registra el token de push del dispositivo.
 * Devuelve null (sin lanzar) mientras las credenciales no estén listas.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  if (!Device.isDevice) return null;

  const projectId = easProjectId();
  if (!projectId) {
    // Todavía no hay proyecto EAS: push queda pendiente, pero el onboarding
    // no se puede trabar por esto.
    return null;
  }

  const granted = await getNotificationPermission();
  if (!granted) return null;

  await ensureAndroidChannels();

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });

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
  return token;
}
