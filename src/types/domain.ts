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
  source: 'igp' | 'usgs';
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
};

export const FREE_DRILL_LIMIT = 3;

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
