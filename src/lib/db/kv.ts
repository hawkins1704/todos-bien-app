import { getDb } from './index';

/** Claves conocidas del store local clave/valor. */
export const KV = {
  myProfile: 'my_profile',
  myStatus: 'my_status',
  mySettings: 'my_settings',
  activeQuake: 'active_quake',
  lastCircleSync: 'last_circle_sync',
  lastQuakeCheck: 'last_quake_check',
  activeDrillId: 'active_drill_id',
  pendingInviteCode: 'pending_invite_code',
  /** Último token de push que se escribió en el servidor (ver `syncPushToken`). */
  pushToken: 'push_token',
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
