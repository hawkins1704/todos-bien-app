import { ACTIVE_ALERT_WINDOW_MS, type QuakeEvent } from '@/types/domain';

/**
 * Helpers de presentación de la alerta.
 *
 * La REGLA DE DISPARO de la spec §6 no vive acá: vive en el RPC
 * `get_active_alert()` de Postgres, que la evalúa contra los umbrales y la
 * última ubicación del propio usuario. Tenerla en un solo lugar evita que la
 * versión del cliente y la del servidor se separen con el tiempo y terminen
 * alertando a gente distinta.
 */

/** Un sismo deja de ser "alerta activa" pasada la ventana accionable (spec §5). */
export function isAlertActive(quake: QuakeEvent | null, now = Date.now()): boolean {
  if (!quake) return false;
  const occurred = Date.parse(quake.occurredAt);
  if (Number.isNaN(occurred)) return false;
  return now - occurred <= ACTIVE_ALERT_WINDOW_MS;
}

/**
 * Nombre corto de zona para el banner: el IGP y el USGS devuelven cadenas
 * largas como "34 km al S de Mala, Cañete - Lima".
 */
export function shortPlace(quake: QuakeEvent): string {
  const place = quake.place?.trim();
  if (!place) return 'Zona no especificada';

  const afterDistance = place.split(/\s+de\s+/i).slice(1).join(' de ') || place;
  return afterDistance.split(/\s*[-,]\s*/)[0]?.trim() || place;
}

/**
 * Contactos que ya confirmaron para ESTE sismo. Cualquier estado cuyo
 * quake_event_id no sea el del sismo activo cuenta como "sin confirmar", sin
 * necesidad de que el servidor reescriba filas al disparar la alerta.
 */
export function confirmedForQuake(
  members: { quakeEventId: string | null; status: string | null }[],
  quakeId: string | null,
): number {
  if (!quakeId) return 0;
  return members.filter((m) => m.quakeEventId === quakeId && m.status && m.status !== 'unconfirmed')
    .length;
}

/** Estado efectivo de un contacto respecto del sismo activo. */
export function effectiveStatus(
  member: { quakeEventId: string | null; status: string | null },
  activeQuakeId: string | null,
): string {
  if (!activeQuakeId) return member.status ?? 'unconfirmed';
  if (member.quakeEventId !== activeQuakeId) return 'unconfirmed';
  return member.status ?? 'unconfirmed';
}
