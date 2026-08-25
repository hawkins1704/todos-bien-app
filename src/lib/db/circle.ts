import { parseActionPlans } from '@/lib/api';
import type { CircleMember, ConnectionStatus, StatusKey } from '@/types/domain';

import { getDb } from './index';

// `circle` todavía tiene la columna `avatar_url` del esquema original. No se
// lee ni se escribe: la app no tiene foto de perfil. Se deja en la tabla porque
// quitarla obligaría a subir `PRAGMA user_version` y migrar la caché de cada
// teléfono para borrar una columna que ya queda siempre en NULL.
type CircleRow = {
  user_id: string;
  connection_id: string;
  display_name: string;
  action_plan: string | null;
  action_plan_updated_at: string | null;
  /** JSON de `ActionPlan[]`. NULL en filas escritas antes de la v2 del esquema. */
  action_plans: string | null;
  connection_status: string;
  requested_by: string | null;
  connection_created_at: string | null;
  status: string | null;
  status_message: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy_m: number | null;
  location_at: string | null;
  quake_event_id: string | null;
  is_drill: number;
  reported_at: string | null;
  status_updated_at: string | null;
};

function toMember(row: CircleRow): CircleMember {
  return {
    userId: row.user_id,
    connectionId: row.connection_id,
    displayName: row.display_name,
    actionPlan: row.action_plan,
    actionPlanUpdatedAt: row.action_plan_updated_at,
    actionPlans: parseActionPlans(row.action_plans),
    connectionStatus: row.connection_status as ConnectionStatus,
    requestedBy: row.requested_by,
    connectionCreatedAt: row.connection_created_at,
    status: (row.status as StatusKey | null) ?? null,
    statusMessage: row.status_message,
    latitude: row.latitude,
    longitude: row.longitude,
    locationAccuracyM: row.location_accuracy_m,
    locationAt: row.location_at,
    quakeEventId: row.quake_event_id,
    isDrill: row.is_drill === 1,
    reportedAt: row.reported_at,
    statusUpdatedAt: row.status_updated_at,
  };
}

export async function readCircle(): Promise<CircleMember[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<CircleRow>(
    'SELECT * FROM circle ORDER BY display_name COLLATE NOCASE ASC',
  );
  return rows.map(toMember);
}

export async function readCircleMember(userId: string): Promise<CircleMember | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<CircleRow>('SELECT * FROM circle WHERE user_id = ?', userId);
  return row ? toMember(row) : null;
}

/**
 * Reemplaza la caché completa con lo que devolvió el servidor. Va en una
 * transacción para que la Home nunca lea una lista a medio escribir.
 */
export async function writeCircle(members: CircleMember[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM circle');
    for (const m of members) {
      await db.runAsync(
        `INSERT INTO circle (
           user_id, connection_id, display_name, action_plan,
           action_plan_updated_at, action_plans, connection_status, requested_by,
           connection_created_at, status, status_message, latitude, longitude,
           location_accuracy_m, location_at, quake_event_id, is_drill,
           reported_at, status_updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.userId,
        m.connectionId,
        m.displayName,
        m.actionPlan,
        m.actionPlanUpdatedAt,
        JSON.stringify(m.actionPlans ?? []),
        m.connectionStatus,
        m.requestedBy,
        m.connectionCreatedAt,
        m.status,
        m.statusMessage,
        m.latitude,
        m.longitude,
        m.locationAccuracyM,
        m.locationAt,
        m.quakeEventId,
        m.isDrill ? 1 : 0,
        m.reportedAt,
        m.statusUpdatedAt,
      );
    }
  });
}
