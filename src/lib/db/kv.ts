import { getDb } from './index';

/** Claves conocidas del store local clave/valor. */
export const KV = {
  myProfile: 'my_profile',
  myStatus: 'my_status',
  mySettings: 'my_settings',
  activeQuake: 'active_quake',
  lastCircleSync: 'last_circle_sync',
  lastQuakeCheck: 'last_quake_check',
  /**
   * El simulacro activo entero (migración 0035), no solo su id.
   *
   * Se cachea por el mismo motivo que la alerta: es lo que decide si la app
   * arranca en modo simulacro, y tiene que resolverse **sin esperar a la red**
   * — si no, cada arranque parpadearía entre modo normal y modo simulacro.
   */
  activeDrill: 'active_drill',
  /**
   * Los grupos, con sus integrantes ya resueltos (migración 0034).
   *
   * Van en el KV y no en una tabla propia de SQLite porque son como mucho diez
   * filas con una lista corta de gente: una tabla sería más código para el mismo
   * resultado. Y van en caché local y no se piden a demanda porque la Home los
   * usa **durante una alerta**, que es exactamente cuando la red puede no estar.
   */
  groups: 'groups',
  /** Último token de push que se escribió en el servidor (ver `syncPushToken`). */
  pushToken: 'push_token',
  /**
   * País ya resuelto por el geocodificador (ver `ensureCountryCode`). Guarda el
   * ISO detectado, y su presencia es lo que impide reintentar en cada refresco.
   * Va en el KV local y no en `user_settings` porque lo que marca es «este
   * teléfono ya preguntó», no un dato del usuario.
   */
  countryDetected: 'country_detected',
  /**
   * Migajas de la tarea de fondo, a la espera de subirse (ver
   * `src/lib/background-trace.ts`). Van acá y no directo al servidor porque la
   * tarea corre en un arranque headless, donde la red puede no estar
   * disponible — y eso es justamente lo que se está diagnosticando.
   */
  backgroundTrace: 'background_trace',
} as const;

export async function kvGet<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', key);
  if (!row) return null;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return null;
  }
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    key,
    JSON.stringify(value ?? null),
    new Date().toISOString(),
  );
}

export async function kvDelete(key: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM kv WHERE key = ?', key);
}
