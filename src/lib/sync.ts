import {
  fetchActiveAlert,
  fetchCircle,
  fetchLastMonitoringCheck,
  fetchMyProfile,
  fetchMyStatus,
  fetchMySettings,
  fetchTips,
  reportStatusRemote,
} from '@/lib/api';
import { flushBackgroundTrace } from '@/lib/background-trace';
import { writeCircle } from '@/lib/db/circle';
import { getDb } from '@/lib/db';
import { KV, kvGet, kvSet } from '@/lib/db/kv';
import {
  enqueue,
  markFailed,
  markSent,
  readPending,
  type MessageOutboxPayload,
  type StatusOutboxPayload,
} from '@/lib/db/outbox';
import { isAlertActive } from '@/lib/quakes';
import { supabase } from '@/lib/supabase';
import type { CircleMember, MyStatus, QuakeEvent, StatusKey, Tip } from '@/types/domain';

/**
 * Sincronización servidor ↔ caché local.
 *
 * Regla: la UI SIEMPRE lee de SQLite. Estas funciones solo refrescan esa caché
 * en segundo plano; ninguna pantalla debe esperar a que terminen (spec §16.1).
 */

export async function syncCircle(): Promise<CircleMember[]> {
  const members = await fetchCircle();
  await writeCircle(members);
  await kvSet(KV.lastCircleSync, new Date().toISOString());
  return members;
}

export async function syncMe(userId: string): Promise<void> {
  const [profile, settings, status] = await Promise.all([
    fetchMyProfile(userId),
    fetchMySettings(userId),
    fetchMyStatus(userId),
  ]);

  if (profile) await kvSet(KV.myProfile, profile);
  if (settings) await kvSet(KV.mySettings, settings);
  if (status) await kvSet(KV.myStatus, status);
}

export async function syncTips(): Promise<Tip[]> {
  const tips = await fetchTips();
  const db = await getDb();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM tips_cache');
    for (const t of tips) {
      await db.runAsync(
        `INSERT INTO tips_cache (id, title, body, long_body, source_name, source_url, phase, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        t.id,
        t.title,
        t.body,
        t.longBody,
        t.sourceName,
        t.sourceUrl,
        t.phase,
        t.sortOrder,
      );
    }
  });

  return tips;
}

/**
 * Trae la alerta activa para este usuario y la guarda en la caché local.
 *
 * La regla de disparo se evalúa en el SERVIDOR (`get_active_alert`), contra los
 * umbrales y la última ubicación del propio usuario. `isAlertActive` acá es
 * solo un cinturón extra por si la fila cacheada quedó vieja.
 */
export async function syncActiveQuake(): Promise<QuakeEvent | null> {
  const [alert, lastCheck] = await Promise.all([fetchActiveAlert(), fetchLastMonitoringCheck()]);

  await kvSet(KV.lastQuakeCheck, lastCheck ?? new Date().toISOString());

  const active = alert && isAlertActive(alert) ? alert : null;
  await kvSet(KV.activeQuake, active);
  return active;
}

export async function syncEverything(userId: string): Promise<void> {
  // El outbox va primero: no tiene sentido bajar un círculo que ya sabemos
  // que está desactualizado respecto de lo que el usuario reportó offline.
  await flushOutbox();
  await syncMe(userId);
  await Promise.all([
    syncCircle(),
    syncTips(),
    syncActiveQuake(),
    // Lo que anotó la tarea de fondo mientras nadie miraba. Casi siempre no hay
    // nada y ni toca la red; ver `background-trace.ts`.
    flushBackgroundTrace(userId),
  ]);
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

let flushing = false;

export async function flushOutbox(): Promise<{ sent: number; failed: number }> {
  if (flushing) return { sent: 0, failed: 0 };
  flushing = true;

  let sent = 0;
  let failed = 0;

  try {
    const pending = await readPending();

    for (const item of pending) {
      try {
        if (item.kind === 'status') {
          await reportStatusRemote(item.payload as StatusOutboxPayload);
        } else {
          const payload = item.payload as MessageOutboxPayload;
          const { data: session } = await supabase.auth.getSession();
          const senderId = session.session?.user.id;
          if (!senderId) throw new Error('sin sesión');

          const { error } = await supabase.from('messages').insert({
            conversation_id: payload.conversationId,
            sender_id: senderId,
            body: payload.body,
            client_id: payload.clientId,
            is_drill: payload.isDrill,
          });

          // 23505 = unique_violation: el mensaje ya había entrado en un intento
          // anterior que se cortó antes de recibir la respuesta. Es éxito.
          if (error && error.code !== '23505') throw error;

          const db = await getDb();
          await db.runAsync('UPDATE messages_cache SET pending = 0 WHERE id = ?', payload.clientId);
        }

        await markSent(item.id);
        sent += 1;
      } catch (error) {
        await markFailed(item.id, error instanceof Error ? error.message : String(error));
        failed += 1;
      }
    }
  } finally {
    flushing = false;
  }

  return { sent, failed };
}

/**
 * Reporta el propio estado.
 *
 * Escribe local primero (la UI responde al instante, con o sin red) y encola
 * la subida. Nunca lanza por falta de conexión: ese es justamente el caso que
 * el outbox existe para cubrir.
 */
export async function reportMyStatus(input: {
  status: StatusKey;
  message?: string | null;
  location?: { latitude: number; longitude: number; accuracyM: number | null; at: string } | null;
  quakeEventId?: string | null;
  isDrill?: boolean;
}): Promise<void> {
  const previous = await kvGet<MyStatus>(KV.myStatus);
  const reportedAt = new Date().toISOString();

  const next: MyStatus = {
    status: input.status,
    message: input.message ?? null,
    latitude: input.location?.latitude ?? previous?.latitude ?? null,
    longitude: input.location?.longitude ?? previous?.longitude ?? null,
    locationAccuracyM: input.location?.accuracyM ?? previous?.locationAccuracyM ?? null,
    locationAt: input.location?.at ?? previous?.locationAt ?? null,
    quakeEventId: input.quakeEventId ?? null,
    isDrill: input.isDrill ?? false,
    reportedAt,
  };

  await kvSet(KV.myStatus, next);

  const payload: StatusOutboxPayload = {
    status: next.status,
    message: next.message,
    latitude: input.location?.latitude ?? null,
    longitude: input.location?.longitude ?? null,
    locationAccuracyM: input.location?.accuracyM ?? null,
    locationAt: input.location?.at ?? null,
    quakeEventId: next.quakeEventId,
    isDrill: next.isDrill,
    reportedAt,
  };

  await enqueue('status', payload);
  void flushOutbox();
}
