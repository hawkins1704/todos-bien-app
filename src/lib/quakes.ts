import { describePlace } from '@/lib/geo';
import { type StatusKey } from '@/theme/tokens';
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
 * Nombre corto de zona: el IGP y el USGS devuelven cadenas largas como
 * "34 km al S de Mala, Cañete - Lima" o "63 km NNE of Ruteng, Indonesia".
 *
 * Delega en `describePlace` para que haya **un solo** parser. La versión que
 * había acá solo entendía el " de " del IGP, así que con el USGS devolvía
 * "63 km NNE of Ruteng": dejaba el prefijo en inglés y tiraba el país.
 */
export function shortPlace(quake: QuakeEvent): string {
  return describePlace(quake.place, quake.source).spot;
}

/** Lo mínimo que hace falta para situar a un contacto respecto de un sismo. */
type Situable = {
  quakeEventId: string | null;
  status: string | null;
  alertedQuakeIds: string[];
};

/**
 * ¿A esta persona le llegó la alerta de ESTE sismo?
 *
 * Es la pregunta que faltaba, y la que separa «no ha reportado» de «nunca se le
 * preguntó». La lista la arma el servidor en `get_circle` (migración 0025):
 * el cliente no puede calcularla porque no conoce el radio ni la magnitud
 * mínima que cada contacto tiene configurados, que son suyos y privados.
 */
export function wasAlertedFor(member: Situable, quakeId: string | null): boolean {
  if (!quakeId) return false;
  return member.alertedQuakeIds.includes(quakeId);
}

/**
 * Estado de un contacto que está dentro de la ventana de un sismo vivo, aunque
 * a MÍ no me haya tocado. `null` cuando no hay ningún sismo reciente que lo
 * alcance, que es el caso normal.
 *
 * **Por qué esto no rompe la §5.2** («en modo tranquilo no se muestran anillos
 * de urgencia»): esa regla existe para que la Home no sea un tablero de
 * vigilancia permanente. Un anillo que solo aparece mientras un sismo real
 * sigue vivo —`alertedQuakeIds` únicamente trae los de las últimas 6 horas— no
 * es vigilancia: es el evento. Al pasar la ventana desaparece solo.
 *
 * **Por qué es gratis y no de Premium:** el estado ya se ve entrando a la ficha
 * del contacto, así que cobrarlo sería cobrar por una comodidad visual de un
 * dato que ya se regala. Lo que vende Guardián es el aviso que llega sin que
 * abras la app (`MONETIZACION.md` §3).
 */
export function liveQuakeStatus(member: Situable): StatusKey | null {
  if (member.alertedQuakeIds.length === 0) return null;
  // Reportó para uno de los sismos que lo alcanzaron: ese es su estado.
  if (member.quakeEventId && member.alertedQuakeIds.includes(member.quakeEventId)) {
    return (member.status as StatusKey | null) ?? 'unconfirmed';
  }
  // Le llegó la alerta y todavía no dijo nada.
  return 'unconfirmed';
}

/** Los del círculo a quienes SÍ les llegó la alerta de este sismo. */
export function membersInQuakeZone<T extends Situable>(members: T[], quakeId: string | null): T[] {
  if (!quakeId) return [];
  return members.filter((m) => wasAlertedFor(m, quakeId));
}

/**
 * Contactos que ya confirmaron para ESTE sismo. Cualquier estado cuyo
 * quake_event_id no sea el del sismo activo cuenta como "sin confirmar", sin
 * necesidad de que el servidor reescriba filas al disparar la alerta.
 *
 * El denominador de este contador NO es el círculo entero: es
 * `membersInQuakeZone`. Contar a quien nunca fue alertado infla el «faltan N»
 * con gente que no tenía nada que reportar.
 */
export function confirmedForQuake(
  members: { quakeEventId: string | null; status: string | null }[],
  quakeId: string | null,
): number {
  if (!quakeId) return 0;
  return members.filter((m) => m.quakeEventId === quakeId && m.status && m.status !== 'unconfirmed')
    .length;
}

/**
 * Estado efectivo de un contacto respecto del sismo activo, o `null` si a esa
 * persona el sismo no le llegó.
 *
 * **Por qué `null` y no `'unconfirmed'`** (el bug que cerró 0025): marcar «sin
 * confirmar» a quien jamás recibió la alerta lo pinta como si estuviera
 * callado. No es un caso raro — pasa con cualquier contacto que viva en otra
 * ciudad, que es justo el perfil al que se le vende Guardián. El servidor ya
 * pensaba así: `notify_silent_contacts` nunca avisa «X no responde» por alguien
 * a quien el sismo no alcanzó.
 *
 * Devolver `null` obliga a quien llama a decidir qué pintar, en vez de dejar
 * que un estado equivocado se cuele por descuido.
 */
export function effectiveStatus(member: Situable, activeQuakeId: string | null): StatusKey | null {
  if (!activeQuakeId) return (member.status as StatusKey | null) ?? 'unconfirmed';
  if (!wasAlertedFor(member, activeQuakeId)) return null;
  if (member.quakeEventId !== activeQuakeId) return 'unconfirmed';
  return (member.status as StatusKey | null) ?? 'unconfirmed';
}
