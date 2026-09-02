import type { StatusKey } from '@/theme/tokens';

export type { StatusKey };

export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

/**
 * Un plan de acción con nombre (migración 0024).
 *
 * El nombre no es decoración: es lo que hace legible la lista. Tu contacto abre
 * tu ficha un martes a las 3 de la tarde, lee «Si estoy en el trabajo» y sabe
 * cuál de tus planes le sirve. Sin nombre, varios planes son un párrafo largo.
 */
export type ActionPlan = {
  id: string;
  name: string;
  body: string;
  updatedAt: string | null;
};

export const FREE_ACTION_PLAN_LIMIT = 1;
export const PREMIUM_ACTION_PLAN_LIMIT = 5;

/**
 * Un grupo: gente + un chat, una sola cosa (migración 0034).
 *
 * **Se comparte.** Todos los integrantes ven el nombre y a los demás. Es de
 * quien lo creó: solo el dueño suma, saca y renombra; cualquiera puede irse.
 *
 * Reemplazó a los «círculos» privados de la 0031 y a las conversaciones
 * grupales sueltas de la 0004, que eran dos objetos que la gente llamaba igual.
 * Los integrantes del grupo **son** los del chat, siempre: lo garantiza un
 * disparador, no el cliente.
 */
export type GroupMember = {
  userId: string;
  displayName: string;
  /** Quien lo creó: el único que suma, saca y renombra. */
  isOwner: boolean;
  /**
   * 🔴 Si es `false`, esta persona está en el grupo pero **no en tu red**, y por
   * eso no vas a ver su estado ni su ubicación en un sismo. No es un bug que se
   * pueda arreglar: las conexiones son de a dos y no se contagian (0034).
   *
   * La pantalla lo usa para ofrecer el atajo de agregarla. Ese atajo es lo que
   * convierte el grupo en una presentación en vez de una etiqueta.
   */
  inMyNetwork: boolean;
};

export type Group = {
  id: string;
  name: string;
  sortOrder: number;
  ownerId: string;
  /** `true` si lo creaste tú. Decide qué se puede tocar en la pantalla. */
  isOwner: boolean;
  /**
   * El chat del grupo. Un grupo tiene uno y solo uno, creado con él.
   *
   * Es `null` únicamente si algo falló a mitad de camino en el servidor: el
   * `create_group` de la 0034 escribe las dos filas en la misma transacción.
   */
  conversationId: string | null;
  /** Incluye al dueño, que no tiene fila en `group_members`. */
  members: GroupMember[];
};

/**
 * El tope cuenta los grupos que **creaste**, no en cuántos estás.
 *
 * Contar la pertenencia dejaría que un tercero te bloqueara la creación de los
 * tuyos con solo sumarte a los suyos. Con Premium no hay tope.
 */
export const FREE_GROUP_LIMIT = 2;

/** Fila de get_circle() ya normalizada a camelCase. */
export type CircleMember = {
  userId: string;
  connectionId: string;
  displayName: string;
  /**
   * @deprecated Copia del primer plan, mantenida por un disparador para las
   * builds viejas. Lo que se pinta es `actionPlans`.
   */
  actionPlan: string | null;
  actionPlanUpdatedAt: string | null;
  actionPlans: ActionPlan[];
  connectionStatus: ConnectionStatus;
  requestedBy: string | null;
  connectionCreatedAt: string | null;
  status: StatusKey | null;
  statusMessage: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationAt: string | null;
  quakeEventId: string | null;
  isDrill: boolean;
  reportedAt: string | null;
  statusUpdatedAt: string | null;
  /**
   * Sismos de las últimas 6 horas cuya alerta le llegó a esta persona.
   *
   * Es lo que distingue «no ha reportado» de «nunca se le preguntó». Sin esto
   * la Home marcaba «sin confirmar» a cualquiera que no hubiera reportado para
   * el sismo activo, incluso a quien estaba a cientos de kilómetros y jamás
   * recibió la alerta (migración 0025).
   */
  alertedQuakeIds: string[];
  /**
   * Si esta persona tiene **algún dispositivo donde recibir un aviso**
   * (migración 0039, deuda 1.14).
   *
   * En `false` no le llega la alerta de sismo, y tampoco se dispara nunca
   * «no responde» por ella: su entrega cierra como `no_token` y
   * `notify_silent_contacts` solo mira las `sent`. O sea que el silencio de la
   * app coincide con el silencio de quien más te preocuparía, y la única forma
   * honesta de resolverlo es **decirlo antes**, no avisarlo durante un sismo.
   *
   * Ante la duda vale `true`: una advertencia sobre otra persona es demasiado
   * seria para mostrarla por no tener el dato todavía.
   */
  receivesNotifications: boolean;
};

export type MyProfile = {
  id: string;
  displayName: string;
  actionPlan: string | null;
  actionPlanUpdatedAt: string | null;
};

export type MySettings = {
  phoneE164: string | null;
  phoneHash: string | null;
  countryCode: string;
  alertRadiusKm: number;
  alertMinMagnitude: number;
  alertCountrywideMagnitude: number;
  alertWorldwideEnabled: boolean;
  locationPermissionLevel: 'none' | 'foreground' | 'background';
  onboardingCompletedAt: string | null;
  isPremium: boolean;
  drillsCompleted: number;
};

export type MyStatus = {
  status: StatusKey;
  message: string | null;
  latitude: number | null;
  longitude: number | null;
  locationAccuracyM: number | null;
  locationAt: string | null;
  quakeEventId: string | null;
  isDrill: boolean;
  reportedAt: string | null;
};

export type QuakeEvent = {
  id: string;
  /**
   * `'simulacro'` es el sismo **sintético** del modo simulacro (0035): existe
   * solo en el teléfono y nunca en `quake_events`. Está en la unión a propósito
   * — así el compilador obliga a cada pantalla que mire el origen a decidir qué
   * hace con él, en vez de que se cuele como si fuera del IGP.
   */
  source: 'igp' | 'usgs' | 'simulacro';
  magnitude: number;
  depthKm: number | null;
  latitude: number;
  longitude: number;
  place: string | null;
  region: string | null;
  intensityMmi: string | null;
  occurredAt: string;
};

export type Tip = {
  id: string;
  title: string;
  body: string;
  longBody: string | null;
  sourceName: string;
  sourceUrl: string;
  phase: 'antes' | 'durante' | 'despues';
  sortOrder: number;
};

/** Contacto de la agenda que ya tiene la app instalada. */
export type ContactMatch = {
  userId: string;
  displayName: string;
  /** Nombre tal como está guardado en la agenda del teléfono. */
  localName: string;
  phoneHash: string;
  connectionStatus: ConnectionStatus | null;
  /**
   * ¿Yo bloqueé a esta persona?
   *
   * Solo puede ser `true` para quien bloqueó. El servidor **no** informa el caso
   * contrario a propósito: `connectionStatus` vale `'blocked'` para los dos
   * lados, y distinguirlos en el cliente le diría a la persona bloqueada que la
   * bloquearon. Ver `match-contacts`.
   */
  blockedByMe: boolean;
};

export const FREE_DRILL_LIMIT = 3;

/**
 * El simulacro que está corriendo ahora mismo (migración 0035).
 *
 * Desde la 0035 el simulacro **no es una pantalla, es un modo**: mientras esto
 * no sea `null` la app entera se comporta como si hubiera una alerta, con el
 * banner amarillo fijo arriba. Sale de `get_active_drill()` y viaja en cada
 * sincronización, que es lo que hace que un simulacro grupal encienda el
 * teléfono del otro sin que nadie toque nada.
 */
export type ActiveDrill = {
  id: string;
  /** `null` en un simulacro individual, que es privado y no avisa a nadie. */
  groupId: string | null;
  groupName: string | null;
  startedBy: string;
  startedByName: string;
  /** Quien lo convocó lo cierra **para todos**; el resto solo se va. */
  isMine: boolean;
  startedAt: string;
  /** Caduca solo. Sin esto, un convocante sin batería dejaría a los demás dentro. */
  endsAt: string;
};

/**
 * El sismo del simulacro es **local y sintético**: nunca una fila en
 * `quake_events`. Sembrar uno de verdad haría que `quake_ingested_fan_out` lo
 * repartiera a usuarios reales.
 *
 * El id lleva el del simulacro adentro para que dos simulacros seguidos no
 * compartan identidad y un reporte viejo cuente como nuevo.
 */
export function drillQuakeId(drillId: string): string {
  return `simulacro:${drillId}`;
}

/**
 * Si un id de sismo es el sintético de un simulacro.
 *
 * Existe porque ese id **no puede salir del teléfono**: `report_status` recibe
 * `quake_id uuid` y `simulacro:<uuid>` no es un uuid, así que Postgres rechaza
 * la escritura entera con `22P02`. Ver `reportMyStatus`, que es donde se filtra.
 */
export function isDrillQuakeId(quakeId: string | null | undefined): boolean {
  return typeof quakeId === 'string' && quakeId.startsWith('simulacro:');
}

/**
 * Cuánto dura el modo alerta: **6 horas** desde la hora del sismo (spec §5.3).
 *
 * Pasado ese tiempo la Home vuelve sola al modo tranquilo. No hay nada que
 * "cerrar" ni ningún estado que expirar en la base: el modo se deriva de
 * `occurred_at`, así que el paso a tranquilo ocurre por el mero avance del reloj.
 *
 * ⚠️ **Este valor está duplicado en el servidor** y los dos tienen que moverse
 * juntos: `get_active_alert()` filtra con `q.occurred_at > now() - interval
 * '6 hours'` (migración 0010). Si acá fuera más largo, la Home entraría en modo
 * alerta con un sismo que el servidor ya dejó de devolver y la pantalla quedaría
 * sin datos; si fuera más corto, el servidor seguiría mandando un sismo que la
 * app ya no muestra. No se puede compartir una constante entre TypeScript y SQL,
 * así que lo único que los mantiene unidos es este comentario y el de la
 * migración.
 */
export const ACTIVE_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;
