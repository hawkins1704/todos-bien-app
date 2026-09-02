import * as Location from 'expo-location';
import { Platform } from 'react-native';

/**
 * Captura de ubicación (spec §8, decisión en docs/ESTADO-DEL-PROYECTO.md §1.2).
 *
 * Regla de oro del proyecto: **capturas contadas, nunca continuas**. Son tres, y
 * no hay una cuarta: una al conceder el permiso (para que la regla del radio
 * tenga contra qué evaluarse), una automática por cada sismo que aplica, y las
 * manuales que la persona pide con el botón mientras la alerta está activa.
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
 * Por qué no hubo posición. Existe porque `null` no alcanzaba.
 *
 * 🔴 **El 2026-09-01 la tarea de fondo de un Android anotó `no-fix` y ahí murió
 * la investigación**: no había forma de saber si el GPS tardó, si el sistema lo
 * rechazó, o si la ubicación del teléfono estaba apagada. Son tres problemas
 * distintos —uno se arregla esperando, otro es un permiso, el tercero lo tiene
 * que tocar la persona— y los tres se veían iguales.
 *
 * Es el mismo patrón que apareció cuatro veces en esa sesión: el fallo no
 * falla, se vuelve silencio. En el camino que sostiene la promesa central de la
 * app, eso no se puede permitir.
 */
export type CaptureFailure =
  | 'sin-permiso'
  /** El permiso está concedido pero la ubicación del sistema está apagada. */
  | 'servicios-apagados'
  | 'tiempo-agotado'
  /** El sistema rechazó la petición. `detail` trae lo que dijo. */
  | 'error-del-sistema';

export type CaptureResult =
  | { fix: LocationFix; reason: null; detail?: undefined }
  | { fix: null; reason: CaptureFailure; detail?: string };

/**
 * Un único fix, con timeout, **y con el motivo cuando no lo hay**.
 *
 * En background iOS da unos ~30 s de ejecución, así que se usa precisión
 * Balanced (≈100 m, suficiente para "en qué zona estaba") en vez de High, que
 * puede tardar demasiado y devolver nada. Si el fix nuevo no llega a tiempo se
 * cae a la última posición conocida del sistema, que es mejor que nada.
 */
export async function captureLocation(timeoutMs = 12_000): Promise<CaptureResult> {
  const foreground = await Location.getForegroundPermissionsAsync();
  if (!foreground.granted) return { fix: null, reason: 'sin-permiso' };

  // Tener el permiso y tener la ubicación encendida son cosas distintas, y en
  // Android la segunda se apaga desde el panel rápido sin que la app se entere.
  // Antes las dos terminaban en el mismo `null`.
  if (!(await Location.hasServicesEnabledAsync())) {
    return { fix: null, reason: 'servicios-apagados' };
  }

  let fresh: Location.LocationObject | null = null;
  let fallo: string | undefined;

  try {
    fresh = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutMs,
    );
  } catch (caught) {
    // Ya no se traga: que el sistema rechace es un diagnóstico, no un empate.
    fallo = caught instanceof Error ? caught.message : String(caught);
  }

  if (fresh) return { fix: toFix(fresh), reason: null };

  // La última conocida sirve igual: `toFix` guarda **la hora del fix**, no la de
  // ahora, así que una posición vieja se muestra vieja y nadie la lee como
  // reciente (ver 7c.6).
  const lastKnown = await Location.getLastKnownPositionAsync({ maxAge: 30 * 60 * 1000 });
  if (lastKnown) return { fix: toFix(lastKnown), reason: null };

  return fallo
    ? { fix: null, reason: 'error-del-sistema', detail: fallo }
    : { fix: null, reason: 'tiempo-agotado' };
}

/** Para quien solo quiere la posición y no tiene nada que hacer con el motivo. */
export async function captureLocationOnce(timeoutMs = 12_000): Promise<LocationFix | null> {
  return (await captureLocation(timeoutMs)).fix;
}

/**
 * En qué país está un punto, en ISO de dos letras.
 *
 * **No enciende el GPS**: recibe coordenadas que ya se capturaron. Lo que sí
 * hace es una consulta al geocodificador del sistema, que en iOS es un servicio
 * de Apple y **necesita red**. Por eso devuelve `null` en vez de adivinar: quien
 * llama decide si reintentar más tarde.
 *
 * Se usa una sola vez por instalación (ver `ensureCountryCode`). Meterlo en el
 * camino de la alerta sería agregar una llamada de red en el momento exacto en
 * que la red está saturada y quedan ~30 s de ejecución en segundo plano.
 */
export async function resolveCountryCode(
  point: { latitude: number; longitude: number },
  timeoutMs = 8_000,
): Promise<string | null> {
  // El `catch` va acá y no adentro de `withTimeout`: para el país, «tardó» y
  // «falló» sí son lo mismo —se reintenta la próxima vez y listo—, pero eso es
  // una decisión de este llamador, no del ayudante.
  let places: Location.LocationGeocodedAddress[] | null = null;
  try {
    places = await withTimeout(Location.reverseGeocodeAsync(point), timeoutMs);
  } catch {
    return null;
  }

  const iso = places?.[0]?.isoCountryCode;

  // `char_length(country_code) = 2` es un CHECK en la base (0001): un valor con
  // otra forma reventaría el UPDATE en vez de degradarse.
  if (!iso || iso.length !== 2) return null;
  return iso.toUpperCase();
}

function toFix(position: Location.LocationObject): LocationFix {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracyM: position.coords.accuracy ?? null,
    at: new Date(position.timestamp).toISOString(),
  };
}

/**
 * `null` si tardó de más. **Si la promesa falla, el error sale.**
 *
 * Antes tenía un `catch { return null }` y ahí se perdía la diferencia entre
 * «tardó» y «el sistema dijo que no». Quien quiera tratarlas igual que lo
 * escriba en su propio `try`, que es donde se lee.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
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
