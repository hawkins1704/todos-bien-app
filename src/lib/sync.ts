import {
  fetchActiveAlert,
  fetchActiveDrill,
  fetchCircle,
  fetchGroups,
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
  discard,
  enqueue,
  markFailed,
  markSent,
  readPending,
  type MessageOutboxPayload,
  type StatusOutboxPayload,
} from '@/lib/db/outbox';
import { isAlertActive } from '@/lib/quakes';
import { supabase } from '@/lib/supabase';
import { isDrillQuakeId } from '@/types/domain';
import type {
  ActiveDrill,
  Group,
  CircleMember,
  MyStatus,
  QuakeEvent,
  StatusKey,
  Tip,
} from '@/types/domain';

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

/**
 * Los grupos (migración 0034), con sus integrantes ya resueltos.
 *
 * Se guardan enteros en el KV: son pocas filas con una lista corta de gente.
 * Van a la caché y no se piden a demanda porque la Home los usa **durante una
 * alerta**, que es justo cuando la red puede no estar.
 */
export async function syncGroups(): Promise<Group[]> {
  const groups = await fetchGroups();
  await kvSet(KV.groups, groups);
  return groups;
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

/**
 * El simulacro activo (migración 0035).
 *
 * Va en cada sincronización, y eso **no es un lujo**: es lo que hace que un
 * simulacro grupal encienda el teléfono del otro. Cuando llega el push,
 * `AppDataProvider` refresca, esto trae la fila, y la app entra en modo
 * simulacro sola. Sin esto habría que abrir una pantalla a mano.
 */
export async function syncActiveDrill(): Promise<ActiveDrill | null> {
  const drill = await fetchActiveDrill();
  await kvSet(KV.activeDrill, drill);
  return drill;
}

export async function syncEverything(userId: string): Promise<void> {
  // El outbox va primero: no tiene sentido bajar un círculo que ya sabemos
  // que está desactualizado respecto de lo que el usuario reportó offline.
  await flushOutbox();
  await syncMe(userId);
  await Promise.all([
    syncCircle(),
    syncGroups(),
    syncTips(),
    syncActiveQuake(),
    syncActiveDrill(),
    // Lo que anotó la tarea de fondo mientras nadie miraba. Casi siempre no hay
    // nada y ni toca la red; ver `background-trace.ts`.
    flushBackgroundTrace(userId),
  ]);
}

// ---------------------------------------------------------------------------
// Outbox
// ---------------------------------------------------------------------------

let flushing = false;

/**
 * ¿Este rechazo es definitivo, o vale la pena reintentarlo?
 *
 * La distinción no es un lujo: sin ella, un mensaje que la RLS rechazó porque
 * la otra persona te bloqueó se quedaba en la cola y se reintentaba en cada
 * sincronización. El día que se levantaba el bloqueo, **entraba** — la persona
 * bloqueada terminaba entregando lo que escribió mientras lo estaba, y el
 * bloqueo dejaba de significar algo.
 *
 * Los códigos son de Postgres y llegan tal cual por PostgREST:
 *
 * - `42501` privilegio insuficiente: lo que devuelve una política de RLS que no
 *   deja pasar la fila. Es el caso del bloqueo.
 * - `23503` clave foránea: la conversación o el usuario ya no existen.
 * - `23514` restricción CHECK: el contenido nunca va a ser válido.
 * - `22023` parámetro inválido, `28000` sin autenticar contra la regla.
 * - `22P02` el texto no se puede convertir al tipo que espera la función. Un
 *   payload mal formado no se arregla esperando: reintentarlo es pedirle a
 *   Postgres el mismo imposible cada cinco minutos, para siempre. Agregado el
 *   2026-09-01, cuando el id sintético del simulacro se coló en `quake_id uuid`
 *   y dejó un «1 por enviar» que no se iba ni cerrando la app. La causa ya está
 *   tapada en `reportMyStatus`; esto es lo que limpia las colas que quedaron
 *   envenenadas en los teléfonos que corrieron un simulacro antes del arreglo.
 *
 * Todo lo demás —timeouts, DNS, 5xx, sin red— se reintenta, que es la razón de
 * ser del outbox.
 */
const RECHAZOS_DEFINITIVOS = new Set(['42501', '23503', '23514', '22023', '22P02', '28000']);

function esRechazoDefinitivo(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && RECHAZOS_DEFINITIVOS.has(code);
}

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
        if (esRechazoDefinitivo(error)) {
          // Fuera de la cola: reintentarlo no lo va a arreglar, y guardarlo es
          // peor que perderlo (ver `discard`).
          await discard(item.id);

          // Y fuera de la pantalla. La burbuja local se pintó de forma
          // optimista con su relojito de "pendiente"; dejarla ahí sería un
          // reloj que no se apaga nunca, mintiendo que el mensaje va a salir.
          // Borrarla dice la verdad: no se envió y no se va a enviar.
          if (item.kind === 'message') {
            const db = await getDb();
            await db.runAsync(
              'DELETE FROM messages_cache WHERE id = ?',
              (item.payload as MessageOutboxPayload).clientId,
            );
          }

          failed += 1;
          continue;
        }

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

  /**
   * 🔴 El id del sismo de un simulacro se descarta acá, y acá es el único lugar
   * donde tiene sentido hacerlo.
   *
   * `report_status` recibe `quake_id uuid`, y el sismo del simulacro es
   * sintético: `simulacro:<uuid>` no es un uuid, así que Postgres rechaza la
   * escritura con `22P02`. La consecuencia no era cosmética — **el reporte del
   * simulacro no llegaba nunca al servidor**, así que en un simulacro grupal
   * nadie veía a nadie ponerse en verde, que es todo el sentido de hacerlo en
   * grupo. Y como el rechazo no estaba en la lista de definitivos, la fila se
   * quedaba en el outbox reintentando para siempre: «1 por enviar» pegado en la
   * insignia después de terminar el simulacro.
   *
   * Va en el cuello de botella y no en quien llama porque **ya se olvidó tres
   * veces**: la captura automática, la tarjeta de ubicación y el selector de
   * estado de la Home. Lo que ata un reporte a un simulacro es `isDrill`, no el
   * id — y si el id es sintético, el reporte ES de simulacro aunque quien llama
   * diga lo contrario.
   */
  const deSimulacro = isDrillQuakeId(input.quakeEventId);

  const next: MyStatus = {
    status: input.status,
    message: input.message ?? null,
    latitude: input.location?.latitude ?? previous?.latitude ?? null,
    longitude: input.location?.longitude ?? previous?.longitude ?? null,
    locationAccuracyM: input.location?.accuracyM ?? previous?.locationAccuracyM ?? null,
    locationAt: input.location?.at ?? previous?.locationAt ?? null,
    quakeEventId: deSimulacro ? null : (input.quakeEventId ?? null),
    isDrill: deSimulacro || (input.isDrill ?? false),
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
