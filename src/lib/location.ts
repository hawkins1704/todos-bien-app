import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Captura de ubicación (spec §8, decisión en docs/ESTADO-DEL-PROYECTO.md §1.2).
 *
 * Regla de oro del proyecto: **una sola posición, solo cuando ocurre un sismo**.
 * Este módulo NUNCA debe llamar a Location.startLocationUpdatesAsync() ni
 * registrar geofences: eso convertiría la app en tracking permanente y es
 * exactamente lo contrario de lo que le prometemos al usuario y a las tiendas.
 */

export type LocationFix = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  at: string;
};

export type LocationPermissionLevel = 'none' | 'foreground' | 'background';

export type LocationPermissionState = {
  level: LocationPermissionLevel;
  /**
   * `false` = el sistema ya no volverá a mostrar el diálogo, así que pedirlo de
   * nuevo no hace nada y la única vía son los Ajustes del SO. Hay que
   * distinguirlo: un botón "Permitir ubicación" que no abre ningún diálogo deja
   * a la persona sin saber qué hacer.
   */
  canAskAgain: boolean;
};

export async function getPermissionState(): Promise<LocationPermissionState> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return { level: 'none', canAskAgain: foreground.canAskAgain };

  const background = await Location.getBackgroundPermissionsAsync();
  return {
    level: background.granted ? 'background' : 'foreground',
    canAskAgain: background.canAskAgain,
  };
}

export async function getPermissionLevel(): Promise<LocationPermissionLevel> {
  return (await getPermissionState()).level;
}

export async function requestForegroundPermission(): Promise<boolean> {
  const { granted } = await Location.requestForegroundPermissionsAsync();
  return granted;
}

/**
 * iOS y Android exigen que el permiso de primer plano se conceda ANTES de
 * poder pedir el de segundo plano.
 */
export async function requestBackgroundPermission(): Promise<boolean> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) {
    const requested = await Location.requestForegroundPermissionsAsync();
    if (!requested.granted) return false;
  }

  const { granted } = await Location.requestBackgroundPermissionsAsync();
  return granted;
}

/**
 * Un único fix, con timeout.
 *
 * En background iOS da unos ~30 s de ejecución, así que se usa precisión
 * Balanced (≈100 m, suficiente para "en qué zona estaba") en vez de High, que
 * puede tardar demasiado y devolver nada. Si el fix nuevo no llega a tiempo se
 * cae a la última posición conocida del sistema, que es mejor que nada.
 */
export async function captureLocationOnce(timeoutMs = 12_000): Promise<LocationFix | null> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return null;

  const fresh = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    timeoutMs,
  );

  if (fresh) return toFix(fresh);

  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
  return lastKnown ? toFix(lastKnown) : null;
}

function toFix(position: Location.LocationObject): LocationFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
    at: new Date(position.timestamp).toISOString(),
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Deep link a la app de mapas del teléfono.
 *
 * **Deja de forzar Google.** Antes esto devolvía siempre una URL de
 * `google.com/maps`, así que quien tuviera otra app de mapas por defecto igual
 * terminaba en Google —y en un iPhone sin Google Maps instalada, en el
 * navegador—. Ahora cada plataforma usa su esquema nativo, que respeta la
 * elección de la persona y abre una app que siempre está instalada.
 *
 * El mapa embebido de las pantallas de detalle es aparte y vive en
 * `src/components/location-map.tsx`; este link sigue siendo el que permite de
 * verdad explorar, medir distancias y pedir indicaciones.
 */
export function mapsUrl(latitude: number, longitude: number, label?: string): string {
  const coords = `${latitude},${longitude}`;
  const nombre = label ? encodeURIComponent(label) : '';

  // Android: `geo:` lo resuelve la app de mapas elegida por defecto, sea Google
  // Maps, Organic Maps o la que sea. Repetir las coordenadas en `q` no es
  // redundante: con solo `geo:lat,lng` varias apps centran el mapa pero no
  // dejan marcador, y el punto exacto se pierde.
  if (Platform.OS === 'android') {
    return `geo:${coords}?q=${coords}${nombre ? `(${nombre})` : ''}`;
  }

  // iOS: Apple Maps, que no se puede desinstalar. Con `ll` y `q` juntos, `q` se
  // interpreta como la etiqueta del pin en esas coordenadas y no como una
  // búsqueda; por eso nunca se manda vacío.
  return `https://maps.apple.com/?ll=${coords}&q=${nombre || coords}`;
}
