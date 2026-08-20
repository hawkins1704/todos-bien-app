import type { StatusKey } from '@/theme/tokens';

export type { StatusKey };

export type ConnectionStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

/** Fila de get_circle() ya normalizada a camelCase. */
export type CircleMember = {
  userId: string;
  connectionId: string;
  displayName: string;
  actionPlan: string | null;
  actionPlanUpdatedAt: string | null;
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
 * Un sismo se considera "activo" mientras la alerta sigue siendo accionable.
 * Pasado ese tiempo la Home vuelve al modo tranquilo (spec §5.2).
 */
export const ACTIVE_ALERT_WINDOW_MS = 6 * 60 * 60 * 1000;
