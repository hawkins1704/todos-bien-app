import type { StatusKey } from '@/types/domain';

import { getDb } from './index';

/**
 * Cola de escrituras pendientes (spec §16.1). Actualizar tu estado sin conexión
 * se guarda acá y se sube solo en cuanto haya cualquier conectividad, incluso
 * parcial o intermitente, sin acción del usuario.
 */

export type StatusOutboxPayload = {
  status: StatusKey;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationAt: string | null;
  quakeEventId: string | null;
  isDrill: boolean;
  reportedAt: string;
};

export type MessageOutboxPayload = {
  conversationId: string;
  clientId: string;
  body: string;
  isDrill: boolean;
  createdAt: string;
};

export type OutboxKind = 'status' | 'message';

export type OutboxItem = {
  id: number;
  kind: OutboxKind;
  payload: StatusOutboxPayload | MessageOutboxPayload;
  createdAt: string;
  attempts: number;
  lastError: string | null;
};

/**
 * Avisa cuando la cola cambia de tamaño.
 *
 * El contador "N cambios por enviar" es estado que vive fuera de React y que
 * cambia por su cuenta: el vaciado del outbox es asíncrono y nadie lo espera.
 * Sin este aviso, la única forma de que la UI se enterara era volver a leer
 * SQLite, y eso solo pasaba en el refresco. Consecuencia real: reportabas "estoy
 * bien", la escritura salía de inmediato, y la pantalla seguía diciendo "1
 * cambio por enviar" hasta el próximo pull-to-refresh. En una app donde ese
 * cartel significa "tu círculo todavía no sabe cómo estás", mentir para el lado
 * del miedo no es un detalle cosmético.
 */
type OutboxListener = () => void;

const listeners = new Set<OutboxListener>();

export function onOutboxChange(listener: OutboxListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyOutboxChange(): void {
  for (const listener of listeners) listener();
}

export async function enqueue(kind: OutboxKind, payload: unknown): Promise<void> {
  const db = await getDb();

  // Solo interesa el ÚLTIMO estado; los intermedios que nunca salieron del
  // dispositivo no aportan nada y solo alargan la cola.
  if (kind === 'status') {
    await db.runAsync(`DELETE FROM outbox WHERE kind = 'status'`);
  }

  await db.runAsync(
    'INSERT INTO outbox (kind, payload, created_at) VALUES (?, ?, ?)',
    kind,
    JSON.stringify(payload),
    new Date().toISOString(),
  );

  notifyOutboxChange();
}

export async function readPending(limit = 50): Promise<OutboxItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: number;
    kind: string;
    payload: string;
    created_at: string;
    attempts: number;
    last_error: string | null;
  }>('SELECT * FROM outbox ORDER BY id ASC LIMIT ?', limit);

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as OutboxKind,
    payload: JSON.parse(r.payload) as StatusOutboxPayload | MessageOutboxPayload,
    createdAt: r.created_at,
    attempts: r.attempts,
    lastError: r.last_error,
  }));
}

export async function markSent(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM outbox WHERE id = ?', id);
  notifyOutboxChange();
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?',
    error.slice(0, 500),
    id,
  );
}

export async function pendingCount(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM outbox');
  return row?.n ?? 0;
}
