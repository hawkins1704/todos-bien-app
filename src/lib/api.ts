import { supabase } from '@/lib/supabase';
import type { TablesUpdate } from '@/types/database.types';
import type {
  ActionPlan,
  ActiveDrill,
  CircleMember,
  ConnectionStatus,
  ContactMatch,
  Group,
  MyProfile,
  MySettings,
  MyStatus,
  QuakeEvent,
  StatusKey,
  Tip,
} from '@/types/domain';

/** Capa fina y tipada sobre supabase-js. Nada de UI ni de caché local acá. */

// ---------------------------------------------------------------------------
// Círculo y perfil
// ---------------------------------------------------------------------------

export async function fetchCircle(): Promise<CircleMember[]> {
  const { data, error } = await supabase.rpc('get_circle');
  if (error) throw error;

  return (data ?? []).map((row) => ({
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
    isDrill: row.is_drill ?? false,
    reportedAt: row.reported_at,
    statusUpdatedAt: row.status_updated_at,
    alertedQuakeIds: parseQuakeIds(row.alerted_quake_ids),
    // `?? true` para las builds que hablen con un servidor sin la 0039: ante la
    // duda no se advierte nada sobre nadie.
    receivesNotifications: row.receives_notifications ?? true,
  }));
}

/**
 * Misma disciplina que `parseActionPlans`: se valida en vez de castear. Una
 * lista con forma inesperada degrada a vacía, y vacía es el lado seguro — un
 * contacto sin alertas conocidas se pinta apagado, no como si estuviera
 * callado.
 */
export function parseQuakeIds(raw: unknown): string[] {
  const lista = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!Array.isArray(lista)) return [];
  return lista.filter((id): id is string => typeof id === 'string');
}

/**
 * `get_circle` devuelve los planes como jsonb, y la caché local los guarda como
 * texto. En los dos casos lo que llega es «lo que haya»: se valida en vez de
 * castear, porque una fila con forma inesperada tiene que degradar a lista
 * vacía y no reventar la pantalla del círculo justo después de un sismo.
 */
export function parseActionPlans(raw: unknown): ActionPlan[] {
  const lista = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!Array.isArray(lista)) return [];

  return lista.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const { id, name, body, updatedAt } = item as Record<string, unknown>;
    if (typeof id !== 'string' || typeof name !== 'string' || typeof body !== 'string') return [];
    return [
      {
        id,
        name,
        body,
        updatedAt: typeof updatedAt === 'string' ? updatedAt : null,
      },
    ];
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Planes de acción (migración 0024)
//
// El tope —1 gratis, 5 con Premium— lo hace cumplir un disparador en la base.
// Acá solo se traduce el error: el cliente pinta el candado, pero el que dice
// que no es el servidor.
// ---------------------------------------------------------------------------

/** El disparador rechaza el plan de más con este mensaje. */
export const PLAN_LIMIT_REACHED = 'limite_planes';

export class ActionPlanLimitError extends Error {
  constructor() {
    super(PLAN_LIMIT_REACHED);
    this.name = 'ActionPlanLimitError';
  }
}

export async function fetchMyActionPlans(userId: string): Promise<ActionPlan[]> {
  const { data, error } = await supabase
    .from('action_plans')
    .select('id, name, body, updated_at')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    body: row.body,
    updatedAt: row.updated_at,
  }));
}

export async function createActionPlan(
  userId: string,
  input: { name: string; body: string; sortOrder: number },
): Promise<void> {
  const { error } = await supabase.from('action_plans').insert({
    user_id: userId,
    name: input.name.trim(),
    body: input.body.trim(),
    sort_order: input.sortOrder,
  });

  if (error) {
    if (error.message?.includes(PLAN_LIMIT_REACHED)) throw new ActionPlanLimitError();
    throw error;
  }
}

export async function updateActionPlan(
  planId: string,
  patch: { name?: string; body?: string },
): Promise<void> {
  const payload: TablesUpdate<'action_plans'> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.body !== undefined) payload.body = patch.body.trim();

  const { error } = await supabase.from('action_plans').update(payload).eq('id', planId);
  if (error) throw error;
}

export async function deleteActionPlan(planId: string): Promise<void> {
  const { error } = await supabase.from('action_plans').delete().eq('id', planId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Grupos (migración 0034)
//
// Un grupo es gente + un chat, y **se comparte**: todos los integrantes lo ven.
// Es de quien lo creó — solo el dueño suma, saca y renombra —, y por eso casi
// todo lo de acá falla con `42501` si lo llama otro. Esa validación vive en la
// RLS, no en estas funciones: un chequeo en el cliente no es un chequeo.
//
// Lo que NO se comparte es el estado y la ubicación de quien no es contacto
// tuyo. `GroupMember.inMyNetwork` es el campo que lo dice, y no se puede
// levantar sin volver transitivas las conexiones. Ver la cabecera de la 0034.
//
// El tope —2 gratis, ilimitados con Premium— lo hace cumplir un disparador y acá
// solo se traduce el error, igual que con los planes de acción.
// ---------------------------------------------------------------------------

/** El disparador rechaza el grupo de más con este mensaje. */
export const GROUP_LIMIT_REACHED = 'limite_grupos';

export class GroupLimitError extends Error {
  constructor() {
    super(GROUP_LIMIT_REACHED);
    this.name = 'GroupLimitError';
  }
}

/** Dos grupos con el mismo nombre chocan contra `groups_owner_name_idx`. */
export class DuplicateGroupNameError extends Error {
  constructor() {
    super('nombre_repetido');
    this.name = 'DuplicateGroupNameError';
  }
}

export async function fetchGroups(): Promise<Group[]> {
  const { data, error } = await supabase.rpc('get_groups');
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    ownerId: row.owner_id,
    isOwner: row.is_owner,
    conversationId: row.conversation_id,
    // `members` llega como jsonb, o sea ya parseado. El guard cubre una fila
    // que llegara sin el `coalesce` del servidor.
    members: Array.isArray(row.members)
      ? (row.members as Record<string, unknown>[]).map((m) => ({
          userId: String(m.user_id),
          displayName: String(m.display_name),
          isOwner: Boolean(m.is_owner),
          inMyNetwork: Boolean(m.in_my_network),
        }))
      : [],
  }));
}

/**
 * Crea el grupo **y su chat**, en una sola transacción del servidor.
 *
 * Va por RPC y no por un INSERT directo porque son dos tablas: un grupo sin chat
 * rompería la regla de que son una sola cosa, y no habría forma de repararlo
 * desde el cliente.
 */
export async function createGroup(name: string, sortOrder: number): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', {
    group_name: name.trim(),
    sort_order: sortOrder,
  });

  if (error) {
    if (error.message?.includes(GROUP_LIMIT_REACHED)) throw new GroupLimitError();
    if (error.code === '23505') throw new DuplicateGroupNameError();
    throw error;
  }

  return data;
}

/** Renombrar el grupo renombra su chat: lo espeja un disparador (0034). */
export async function renameGroup(groupId: string, name: string): Promise<void> {
  const { error } = await supabase.from('groups').update({ name: name.trim() }).eq('id', groupId);

  if (error) {
    if (error.code === '23505') throw new DuplicateGroupNameError();
    throw error;
  }
}

/**
 * Borra el grupo. **Se lleva el chat y sus mensajes** por el `on delete cascade`
 * de `conversations.group_id`, así que el diálogo tiene que decirlo.
 */
export async function deleteGroup(groupId: string): Promise<void> {
  const { error } = await supabase.from('groups').delete().eq('id', groupId);
  if (error) throw error;
}

/** Solo el dueño, y solo con gente de su propia red (política de la 0034). */
export async function addGroupMember(groupId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .insert({ group_id: groupId, member_id: memberId });

  // 23505 = ya estaba. Tocar dos veces el mismo contacto no es un error que
  // valga la pena mostrarle a nadie: el estado final es el que pedía.
  if (error && error.code !== '23505') throw error;
}

/**
 * Saca a alguien del grupo. Sirve para las dos cosas, y la política decide:
 * el dueño puede sacar a cualquiera, y cualquiera puede sacarse a sí mismo.
 */
export async function removeGroupMember(groupId: string, memberId: string): Promise<void> {
  const { error } = await supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('member_id', memberId);

  if (error) throw error;
}

export async function fetchMyProfile(userId: string): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, action_plan, action_plan_updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    id: data.id,
    displayName: data.display_name,
    actionPlan: data.action_plan,
    actionPlanUpdatedAt: data.action_plan_updated_at,
  };
}

export async function updateMyProfile(
  userId: string,
  // `avatar_url` sigue existiendo en la tabla pero la app ya no lo escribe ni lo
  // lee: no hay foto de perfil (ver el comentario de `src/components/avatar.tsx`).
  patch: { displayName?: string; actionPlan?: string | null },
): Promise<void> {
  const payload: TablesUpdate<'profiles'> = {};
  if (patch.displayName !== undefined) payload.display_name = patch.displayName;
  if (patch.actionPlan !== undefined) {
    payload.action_plan = patch.actionPlan;
    payload.action_plan_updated_at = new Date().toISOString();
  }

  const { error } = await supabase.from('profiles').update(payload).eq('id', userId);
  if (error) throw error;
}

export async function fetchMySettings(userId: string): Promise<MySettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    phoneE164: data.phone_e164,
    phoneHash: data.phone_hash,
    countryCode: data.country_code,
    alertRadiusKm: data.alert_radius_km,
    alertMinMagnitude: Number(data.alert_min_magnitude),
    alertCountrywideMagnitude: Number(data.alert_countrywide_magnitude),
    alertWorldwideEnabled: data.alert_worldwide_enabled,
    locationPermissionLevel:
      data.location_permission_level as MySettings['locationPermissionLevel'],
    onboardingCompletedAt: data.onboarding_completed_at,
    isPremium: data.is_premium,
    drillsCompleted: data.drills_completed,
  };
}

export async function updateMySettings(
  userId: string,
  patch: {
    phoneE164?: string | null;
    phoneHash?: string | null;
    countryCode?: string;
    alertRadiusKm?: number;
    alertMinMagnitude?: number;
    alertCountrywideMagnitude?: number;
    alertWorldwideEnabled?: boolean;
    locationPermissionLevel?: MySettings['locationPermissionLevel'];
    onboardingCompletedAt?: string | null;
  },
): Promise<void> {
  const payload: TablesUpdate<'user_settings'> = {};
  if (patch.phoneE164 !== undefined) payload.phone_e164 = patch.phoneE164;
  if (patch.phoneHash !== undefined) payload.phone_hash = patch.phoneHash;
  if (patch.countryCode !== undefined) payload.country_code = patch.countryCode;
  if (patch.alertRadiusKm !== undefined) payload.alert_radius_km = patch.alertRadiusKm;
  if (patch.alertMinMagnitude !== undefined) payload.alert_min_magnitude = patch.alertMinMagnitude;
  if (patch.alertCountrywideMagnitude !== undefined) {
    payload.alert_countrywide_magnitude = patch.alertCountrywideMagnitude;
  }
  if (patch.alertWorldwideEnabled !== undefined) {
    payload.alert_worldwide_enabled = patch.alertWorldwideEnabled;
  }
  if (patch.locationPermissionLevel !== undefined) {
    payload.location_permission_level = patch.locationPermissionLevel;
  }
  if (patch.onboardingCompletedAt !== undefined) {
    payload.onboarding_completed_at = patch.onboardingCompletedAt;
  }

  const { error } = await supabase.from('user_settings').update(payload).eq('user_id', userId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export async function fetchMyStatus(userId: string): Promise<MyStatus | null> {
  const { data, error } = await supabase
    .from('user_status')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    status: data.status as StatusKey,
    message: data.message,
    latitude: data.latitude,
    longitude: data.longitude,
    locationAccuracyM: data.location_accuracy_m,
    locationAt: data.location_at,
    quakeEventId: data.quake_event_id,
    isDrill: data.is_drill,
    reportedAt: data.reported_at,
  };
}

export async function reportStatusRemote(payload: {
  status: StatusKey;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationAt: string | null;
  quakeEventId: string | null;
  isDrill: boolean;
  reportedAt: string;
}): Promise<void> {
  const { error } = await supabase.rpc('report_status', {
    new_status: payload.status,
    new_message: payload.message,
    lat: payload.latitude,
    lng: payload.longitude,
    accuracy_m: payload.locationAccuracyM,
    located_at: payload.locationAt,
    quake_id: payload.quakeEventId,
    drill: payload.isDrill,
    reported: payload.reportedAt,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Conexiones
//
// La ÚNICA forma de conectarse es el match de agenda (`matchContacts`) seguido
// de `requestConnection`, que la otra persona tiene que aceptar a mano. No hay
// segunda vía, y eso es una garantía que se puede afirmar en público.
//
// Los códigos de invitación se sacaron del cliente el 2026-08-24 y del servidor
// el 2026-08-25 (migración 0023). Se borraron enteros, tabla y disparador
// incluidos, porque quedaban creando conexiones **ya aceptadas** sin que la
// persona nueva aceptara nada.
// ---------------------------------------------------------------------------

export async function requestConnection(targetUserId: string): Promise<void> {
  const { error } = await supabase.rpc('request_connection', {
    target_user_id: targetUserId,
  });
  if (error) throw error;
}

/** Motivos de denuncia. El orden es el que se muestra en la pantalla. */
export const REPORT_REASONS = [
  { key: 'harassment', label: 'Acoso o amenazas' },
  { key: 'inappropriate', label: 'Contenido ofensivo o inapropiado' },
  { key: 'spam', label: 'Spam o estafa' },
  { key: 'impersonation', label: 'Se hace pasar por otra persona' },
  { key: 'other', label: 'Otro motivo' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

/**
 * Denuncia contenido de otra persona (migración 0020, guía 1.2 de App Store).
 *
 * La copia del texto denunciado la guarda el servidor, no el cliente: mandarla
 * desde acá permitiría denunciar un mensaje inventado, y la evidencia dejaría de
 * ser evidencia.
 */
export async function submitReport(input: {
  reportedUserId: string;
  reason: ReportReason;
  detail?: string | null;
  conversationId?: string | null;
  messageId?: string | null;
}): Promise<void> {
  const { error } = await supabase.rpc('submit_report', {
    reported_user_id: input.reportedUserId,
    reason: input.reason,
    detail: input.detail ?? null,
    conversation_id: input.conversationId ?? null,
    message_id: input.messageId ?? null,
  });
  if (error) throw error;
}

export async function respondToConnection(connectionId: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc('respond_to_connection', {
    connection_id: connectionId,
    accept,
  });
  if (error) throw error;
}

export async function removeConnection(connectionId: string): Promise<void> {
  const { error } = await supabase.from('connections').delete().eq('id', connectionId);
  if (error) throw error;
}

/**
 * Bloquear y quitar del círculo son dos cosas distintas (migración 0021).
 *
 * **Quitar** (`removeConnection`) es el caso amable y es la mayoría: ya no
 * quiero compartir mi ubicación con esta persona. Borra la fila, y las dos
 * partes pueden volver a agregarse cuando quieran.
 *
 * **Bloquear** es el caso hostil: la conexión queda en `blocked`, la otra
 * persona no puede volver a pedir conexión —cada intento le llegaba como aviso
 * a quien la quitó— y **el chat que ya existía queda cerrado**, que era el
 * agujero de verdad: la conversación y sus miembros no se borran al quitar el
 * vínculo, así que antes se podía seguir escribiendo.
 */
export async function blockConnection(otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('block_connection', {
    other_user_id: otherUserId,
  });
  if (error) throw error;
}

export async function unblockConnection(otherUserId: string): Promise<void> {
  const { error } = await supabase.rpc('unblock_connection', {
    other_user_id: otherUserId,
  });
  if (error) throw error;
}

export type BlockedPerson = {
  userId: string;
  displayName: string;
  blockedAt: string | null;
};

export async function getBlocked(): Promise<BlockedPerson[]> {
  const { data, error } = await supabase.rpc('get_blocked');
  if (error) throw error;
  return (data ?? []).map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    blockedAt: row.blocked_at,
  }));
}

/**
 * Rescata el motivo real de un fallo de edge function.
 *
 * `functions.invoke` devuelve siempre el mismo `FunctionsHttpError` genérico
 * ("Edge Function returned a non-2xx status code") y deja el detalle dentro de
 * `context`, que es la `Response` sin leer. Eso convirtió un bug concreto —la
 * URL del `.in()` pasada de largo -- en un "no pudimos revisar tu agenda" sin
 * ninguna pista, y hubo que ir a los logs del servidor para verlo.
 */
async function withFunctionDetail(error: Error): Promise<Error> {
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return error;

  try {
    const body = (await context.clone().json()) as { error?: unknown };
    if (typeof body.error === 'string') {
      return new Error(`${error.message} — ${context.status}: ${body.error}`);
    }
  } catch {
    // Cuerpo vacío o que no es JSON: se queda el error original.
  }

  return error;
}

/** Llama a la edge function; solo viajan hashes, nunca la agenda. */
export async function matchContacts(
  entries: { hash: string; localName: string }[],
): Promise<ContactMatch[]> {
  if (entries.length === 0) return [];

  const nameByHash = new Map(entries.map((e) => [e.hash, e.localName]));

  const { data, error } = await supabase.functions.invoke<{
    matches: {
      user_id: string;
      phone_hash: string;
      display_name: string;
      connection_status: string | null;
      blocked_by_me?: boolean;
    }[];
  }>('match-contacts', { body: { hashes: entries.map((e) => e.hash) } });

  if (error) throw await withFunctionDetail(error);

  return (data?.matches ?? []).map((m) => ({
    userId: m.user_id,
    displayName: m.display_name,
    localName: nameByHash.get(m.phone_hash) ?? m.display_name,
    phoneHash: m.phone_hash,
    connectionStatus: (m.connection_status as ConnectionStatus | null) ?? null,
    // `?? false` y no un cast: si la app corre contra una versión vieja de la
    // función edge, el campo no viene y hay que degradar a "no lo bloqueé" —
    // que es el lado seguro, el que no afirma nada.
    blockedByMe: m.blocked_by_me ?? false,
  }));
}

// ---------------------------------------------------------------------------
// Sismos y tips
// ---------------------------------------------------------------------------

type QuakeRow = {
  id: string;
  source: string;
  magnitude: number | string;
  depth_km: number | string | null;
  latitude: number;
  longitude: number;
  place: string | null;
  region: string | null;
  intensity_mmi: string | null;
  occurred_at: string;
};

function mapQuake(q: QuakeRow): QuakeEvent {
  return {
    id: q.id,
    source: q.source as QuakeEvent['source'],
    magnitude: Number(q.magnitude),
    depthKm: q.depth_km == null ? null : Number(q.depth_km),
    latitude: q.latitude,
    longitude: q.longitude,
    place: q.place,
    region: q.region,
    intensityMmi: q.intensity_mmi,
    occurredAt: q.occurred_at,
  };
}

/**
 * El sismo activo para este usuario, resuelto en el servidor.
 *
 * La regla de disparo (spec §6) se evalúa contra sus propios umbrales y su
 * última ubicación conocida. Se resuelve del lado del servidor a propósito: con
 * el feed global del USGS, bajar los N sismos más recientes y filtrarlos en el
 * cliente dejaría fuera el que sí importa, porque los 50+ sismos diarios del
 * mundo desplazan al local. Devuelve el evento canónico, así que un mismo
 * temblor reportado por IGP y USGS es una sola alerta con un solo id.
 */
export async function fetchActiveAlert(): Promise<QuakeEvent | null> {
  const { data, error } = await supabase.rpc('get_active_alert');
  if (error) throw error;

  const row = (data ?? [])[0];
  return row ? mapQuake(row as QuakeRow) : null;
}

export type QuakeFeedScope = 'nacional' | 'global';

/** El servidor rechaza el feed global de quien no es premium con este mensaje. */
export const PREMIUM_REQUIRED = 'requiere_premium';

export class PremiumRequiredError extends Error {
  constructor() {
    super(PREMIUM_REQUIRED);
    this.name = 'PremiumRequiredError';
  }
}

/**
 * Feed de Noticias Sísmicas (sección informativa, aparte del flujo de alertas).
 *
 * - `nacional`: sismos del país en los últimos 7 días, sin piso de magnitud.
 * - `global`: sismos del mundo en los últimos 7 días con magnitud ≥ 4.5.
 *   Premium; el servidor corta el acceso, no solo la UI.
 *
 * Devuelve solo eventos canónicos, así que un sismo reportado por IGP y USGS a
 * la vez aparece una sola vez.
 */
export async function fetchQuakeFeed(scope: QuakeFeedScope): Promise<QuakeEvent[]> {
  const { data, error } = await supabase.rpc('get_quake_feed', { scope });

  if (error) {
    if (error.message?.includes(PREMIUM_REQUIRED)) throw new PremiumRequiredError();
    throw error;
  }

  return (data ?? []).map((row) => mapQuake(row as QuakeRow));
}

export async function fetchQuakeById(id: string): Promise<QuakeEvent | null> {
  const { data, error } = await supabase
    .from('quake_events')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? mapQuake(data as QuakeRow) : null;
}

/** Última verificación exitosa de las fuentes, para el banner en calma (spec §5.2). */
export async function fetchLastMonitoringCheck(): Promise<string | null> {
  const { data, error } = await supabase
    .from('ingest_runs')
    .select('ran_at')
    .eq('ok', true)
    .order('ran_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.ran_at ?? null;
}

export async function fetchTips(): Promise<Tip[]> {
  const { data, error } = await supabase
    .from('tips')
    .select('*')
    .eq('is_active', true)
    .order('sort_order');

  if (error) throw error;

  return (data ?? []).map((t) => ({
    id: t.id,
    title: t.title,
    body: t.body,
    longBody: t.long_body,
    sourceName: t.source_name,
    sourceUrl: t.source_url,
    phase: t.phase as Tip['phase'],
    sortOrder: t.sort_order,
  }));
}

// ---------------------------------------------------------------------------
// Simulacros
// ---------------------------------------------------------------------------

/**
 * Convoca un simulacro (migración 0035).
 *
 * `groupId` lo convierte en grupal: el servidor mete a los integrantes como
 * participantes y les manda el aviso. Solo lo puede hacer el dueño del grupo,
 * y solo hay uno activo por grupo a la vez — las dos cosas las rechaza el
 * servidor con `42501`.
 *
 * ⚠️ **El cupo se descuenta acá, al iniciar**, no al terminar. Antes era al
 * completar y se podía empezar y abandonar sin gastar nada; con simulacros
 * grupales eso era un agujero.
 */
export async function startDrill(
  mode: 'silent' | 'notify',
  groupId: string | null = null,
): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('start_drill', {
    drill_mode: mode,
    p_group_id: groupId,
  });
  if (error) throw error;
  return { id: data.id };
}

/**
 * El simulacro que tengo encima ahora mismo, si hay alguno.
 *
 * Es la fuente de verdad del modo simulacro y por eso viaja en cada
 * sincronización: cuando alguien convoca uno grupal, esto es lo que hace que el
 * otro teléfono entre en modo simulacro solo, sin que nadie toque nada.
 */
export async function fetchActiveDrill(): Promise<ActiveDrill | null> {
  const { data, error } = await supabase.rpc('get_active_drill');
  if (error) throw error;

  const fila = (data ?? [])[0];
  if (!fila) return null;

  return {
    id: fila.id,
    groupId: fila.group_id,
    groupName: fila.group_name,
    startedBy: fila.started_by,
    startedByName: fila.started_by_name,
    isMine: fila.is_mine,
    startedAt: fila.started_at,
    endsAt: fila.ends_at,
  };
}

/**
 * Salir del simulacro. Una sola función para las dos cosas, y el servidor
 * decide cuál según quién llama: el convocante lo cierra **para todos**, el
 * resto se va solo.
 *
 * No falla si el simulacro ya no existe —pudo caducar, o el convocante pudo
 * cerrarlo un segundo antes—: en ese caso el modo ya tenía que apagarse igual.
 */
export async function endMyDrill(drillId: string): Promise<void> {
  const { error } = await supabase.rpc('end_my_drill', { p_drill_id: drillId });
  if (error) throw error;
}

export async function completeDrill(
  drillId: string,
  reportedStatus: StatusKey | null,
): Promise<void> {
  const { error } = await supabase.rpc('complete_drill', {
    drill_id: drillId,
    status_reported: reportedStatus,
  });
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Notificaciones
// ---------------------------------------------------------------------------

/**
 * Los dos últimos son **noticias**, no alertas, y esa distinción es el punto
 * (migración 0021). La alerta de sismo no tiene interruptor porque no es una
 * preferencia: es la razón por la que la app existe. Lo que se puede apagar es
 * enterarse de sismos que NO te dispararon una alerta.
 */
export type NotificationPrefs = {
  contactNeedsHelp: boolean;
  contactMessage: boolean;
  connectionRequest: boolean;
  connectionAccepted: boolean;
  contactNotResponding: boolean;
  quakeNational: boolean;
  quakeWorldwide: boolean;
  /**
   * Guardián (migración 0030): el estado de un contacto —«reportó» y «no
   * reporta»— cuando el sismo **no** me alcanzó a mí. Solo con premium.
   *
   * Hasta la 0022 esto además incluía «tembló cerca de un contacto» al minuto
   * 0; la 0030 quitó ese aviso por redundante con la noticia nacional, que
   * ahora llega a todos. El interruptor conservó el nombre para no arrastrar
   * un renombre de columna por los tipos y el cliente.
   */
  guardianAlerts: boolean;
  /**
   * Lo mismo, pero cuando el sismo **sí** me alcanzó a mí (migración 0027).
   *
   * Va aparte de `guardianAlerts` y no colgado de él: este aviso es **gratis**
   * —dentro de tu propio sismo la app es completa— y el interruptor de Guardián
   * está bloqueado en las cuentas gratis, así que compartirlos dejaría a esas
   * cuentas recibiendo algo que no pueden apagar.
   */
  contactReported: boolean;
  /**
   * Que alguien te meta en un simulacro grupal (migración 0035).
   *
   * 🔴 Apagarlo **no apaga solo el push: te deja fuera del simulacro.** El
   * servidor filtra por esta preferencia al armar la lista de participantes.
   * Recibir el aviso y ser arrastrado igual al modo simulacro sería respetar la
   * preferencia a medias, que es peor que no tenerla.
   */
  drillInvites: boolean;
};

export async function fetchNotificationPrefs(userId: string): Promise<NotificationPrefs | null> {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    contactNeedsHelp: data.contact_needs_help,
    contactMessage: data.contact_message,
    connectionRequest: data.connection_request,
    connectionAccepted: data.connection_accepted,
    contactNotResponding: data.contact_not_responding,
    quakeNational: data.quake_national,
    quakeWorldwide: data.quake_worldwide,
    guardianAlerts: data.guardian_alerts,
    contactReported: data.contact_reported,
    drillInvites: data.drill_invites,
  };
}

export async function updateNotificationPrefs(
  userId: string,
  patch: Partial<NotificationPrefs>,
): Promise<void> {
  const payload: TablesUpdate<'notification_preferences'> = {};
  if (patch.contactNeedsHelp !== undefined) payload.contact_needs_help = patch.contactNeedsHelp;
  if (patch.contactMessage !== undefined) payload.contact_message = patch.contactMessage;
  if (patch.connectionRequest !== undefined) payload.connection_request = patch.connectionRequest;
  if (patch.connectionAccepted !== undefined)
    payload.connection_accepted = patch.connectionAccepted;
  if (patch.contactNotResponding !== undefined) {
    payload.contact_not_responding = patch.contactNotResponding;
  }
  if (patch.quakeNational !== undefined) payload.quake_national = patch.quakeNational;
  if (patch.quakeWorldwide !== undefined) payload.quake_worldwide = patch.quakeWorldwide;
  if (patch.guardianAlerts !== undefined) payload.guardian_alerts = patch.guardianAlerts;
  if (patch.contactReported !== undefined) payload.contact_reported = patch.contactReported;
  if (patch.drillInvites !== undefined) payload.drill_invites = patch.drillInvites;

  // Upsert y no update: un `update` sobre una fila que no existe afecta cero
  // filas y **no devuelve error**, así que el interruptor se veía cambiado en
  // pantalla y no se guardaba nada. Hoy la fila la crea un disparador al
  // registrarse, pero una cuenta vieja o una restauración podrían no tenerla, y
  // el modo de falla sería invisible.
  const { error } = await supabase
    .from('notification_preferences')
    .upsert({ user_id: userId, ...payload }, { onConflict: 'user_id' });
  if (error) throw error;
}
