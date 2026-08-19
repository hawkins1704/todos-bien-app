/** Formateo en español peruano, sin dependencias de i18n. */

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'nunca';

  const then = Date.parse(iso);
  if (Number.isNaN(then)) return 'nunca';

  const seconds = Math.max(0, Math.round((now - then) / 1000));

  if (seconds < 45) return 'hace un momento';
  if (seconds < 90) return 'hace 1 minuto';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} minutos`;

  const hours = Math.round(minutes / 60);
  if (hours === 1) return 'hace 1 hora';
  if (hours < 24) return `hace ${hours} horas`;

  const days = Math.round(hours / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;

  const months = Math.round(days / 30);
  if (months === 1) return 'hace 1 mes';
  if (months < 12) return `hace ${months} meses`;

  const years = Math.round(months / 12);
  return years === 1 ? 'hace 1 año' : `hace ${years} años`;
}

/** Versión compacta para el banner de alerta: "hace 4 min". */
export function elapsedShort(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';

  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';

  const minutes = Math.max(0, Math.round((now - then) / 60000));
  if (minutes < 1) return 'recién';
  if (minutes < 60) return `hace ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;

  return `hace ${Math.floor(hours / 24)} d`;
}

/**
 * ¿Esta fecha es más vieja que `ms`?
 *
 * Vive acá, y no en el cuerpo de un componente, porque leer el reloj es una
 * operación impura: llamar a Date.now() durante el render rompe las garantías
 * del React Compiler.
 */
export function isOlderThan(iso: string | null | undefined, ms: number, now = Date.now()): boolean {
  if (!iso) return false;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return false;
  return now - then > ms;
}

export function formatMagnitude(magnitude: number): string {
  return magnitude.toFixed(1).replace('.', ',');
}

export function formatDistanceKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

export function formatCoords(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

export function formatAccuracy(accuracyM: number | null): string {
  if (accuracyM == null) return '';
  if (accuracyM < 1000) return `±${Math.round(accuracyM)} m`;
  return `±${(accuracyM / 1000).toFixed(1).replace('.', ',')} km`;
}

export function initialsOf(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

