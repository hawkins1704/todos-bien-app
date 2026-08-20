import { updateMySettings } from '@/lib/api';
import { ALERT_WRITE_JITTER_MS } from '@/lib/config';
import { KV, kvGet } from '@/lib/db/kv';
import { captureLocationOnce, getPermissionLevel } from '@/lib/location';
import { reportMyStatus, syncMe } from '@/lib/sync';
import type { MySettings, MyStatus, QuakeEvent } from '@/types/domain';

/**
 * Captura de ubicación asociada a la alerta.
 *
 * OJO con la distinción que resuelve este módulo: conceder el permiso de
 * ubicación NO guarda ninguna posición. El onboarding pedía el permiso y
 * anotaba el nivel concedido en `user_settings.location_permission_level`, pero
 * nunca tomaba una lectura, así que `user_status.latitude` quedaba en NULL.
 *
 * Consecuencia: la regla del radio de `get_active_alert()` exige
 * `my_lat is not null`, o sea que un usuario recién registrado solo recibía
 * alertas por la regla nacional (magnitud ≥ 6.0). Nunca por cercanía.
 */

let capturing = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Primera lectura de posición, para que la regla del radio funcione desde el
 * día uno.
 *
 * Es idempotente por diseño: si ya hay una posición guardada, no hace nada y
 * ni siquiera enciende el GPS. Esa idempotencia es lo que permite llamarla en
 * cada refresco (ver `syncLocationPermission`) sin convertir la app en tracking:
 * toma UNA posición en toda la vida de la instalación, la primera vez que hay
 * permiso y todavía no hay ninguna.
 *
 * Lo que sigue estando prohibido es *refrescar* una posición ya guardada fuera
 * de un sismo. El costo de esa decisión es que la posición puede quedar vieja
 * si la persona se muda de ciudad; lo cubre la regla nacional, que no depende
 * de la ubicación.
 */
export async function ensureInitialLocation(): Promise<boolean> {
  const current = await kvGet<MyStatus>(KV.myStatus);
  if (current?.latitude != null && current?.longitude != null) return false;

  if ((await getPermissionLevel()) === 'none') return false;

  const fix = await captureLocationOnce();
  if (!fix) return false;

  // Se preservan estado y sismo previos: esto agrega ubicación, no reporta nada.
  await reportMyStatus({
    status: current?.status ?? 'unconfirmed',
    message: current?.message ?? null,
    location: fix,
    quakeEventId: current?.quakeEventId ?? null,
    isDrill: current?.isDrill ?? false,
  });

  return true;
}

/**
 * Red de seguridad para el permiso concedido DESPUÉS del onboarding.
 *
 * Sin esto había un callejón sin salida real, no teórico: `ensureInitialLocation()`
 * solo se llamaba desde el onboarding, así que quien lo saltaba (o lo denegaba y
 * después lo activaba desde los Ajustes del sistema) quedaba para siempre sin
 * coordenadas. Y sin coordenadas la regla del radio de `get_active_alert()` no
 * se evalúa nunca → nunca hay alerta activa → `captureLocationForActiveAlert()`
 * tampoco corre nunca → nunca hay coordenadas. Cerrado sobre sí mismo: la única
 * salida era reinstalar la app.
 *
 * Verificado contra un caso real: un M4,8 a 49 km de Lima no disparó nada, con
 * el radio en 150 km y el umbral en 4,5. La regla estaba bien; faltaba el dato.
 *
 * Se llama en cada refresco. Es barato: consultar el nivel de permiso no
 * enciende el GPS, y `ensureInitialLocation()` corta de inmediato si ya hay una
 * posición guardada.
 */
export async function syncLocationPermission(userId: string): Promise<boolean> {
  const level = await getPermissionLevel();
  const settings = await kvGet<MySettings>(KV.mySettings);

  let changed = false;

  // El nivel guardado en el servidor puede haber quedado viejo: se escribía solo
  // en la pantalla de permisos del onboarding, y el SO permite cambiarlo por
  // fuera de la app en cualquier momento.
  if (settings && settings.locationPermissionLevel !== level) {
    await updateMySettings(userId, { locationPermissionLevel: level });
    await syncMe(userId);
    changed = true;
  }

  if (await ensureInitialLocation()) changed = true;

  return changed;
}

/**
 * Ante una alerta activa, guarda dónde está la persona sin esperar a que toque
 * un botón.
 *
 * Antes la ubicación solo se capturaba dentro del handler de "Mi estado", así
 * que alguien que abría la app tras un sismo y no tocaba nada no dejaba ningún
 * rastro de dónde estaba, que es justamente lo que la app promete.
 *
 * El estado se guarda como `unconfirmed` a propósito: el contador
 * "X/Y confirmados" exige `status <> 'unconfirmed'`, así que la persona sigue
 * figurando como no confirmada, pero su círculo ya puede ver dónde estaba.
 */
export async function captureLocationForActiveAlert(
  quake: QuakeEvent,
  { jitter = true }: { jitter?: boolean } = {},
): Promise<boolean> {
  if (capturing) return false;

  const before = await kvGet<MyStatus>(KV.myStatus);
  if (before?.quakeEventId === quake.id) return false;

  if ((await getPermissionLevel()) === 'none') return false;

  capturing = true;
  try {
    // Jitter (spec §6): evita que 200k+ dispositivos escriban en el mismo
    // instante exacto al dispararse una alerta. No bloquea nada de la UI: si la
    // persona toca su estado ahora mismo, esa escritura va por su propio camino
    // y es inmediata.
    //
    // Se puede desactivar (`jitter: false`) para la tarea de fondo: iOS da ~30
    // segundos en total y el GPS se puede comer buena parte, así que gastar
    // hasta 8 en esperar arriesga perder la captura entera. La dispersión ahí ya
    // la aplica el servidor al repartir los envíos con `send_after`.
    if (jitter) await sleep(Math.random() * ALERT_WRITE_JITTER_MS);

    const fix = await captureLocationOnce();
    if (!fix) return false;

    // Último chequeo justo antes de escribir. Entre el jitter y el fix del GPS
    // pueden pasar más de 20 s, y en ese rato la persona pudo tocar "estoy
    // bien". Sin esto la escritura automática lo pisaría: `enqueue('status')`
    // borra el estado anterior del outbox, así que el reporte manual se
    // perdería antes de subir.
    const latest = await kvGet<MyStatus>(KV.myStatus);
    if (latest?.quakeEventId === quake.id) return false;

    await reportMyStatus({
      status: 'unconfirmed',
      location: fix,
      quakeEventId: quake.id,
      isDrill: false,
    });

    return true;
  } finally {
    capturing = false;
  }
}
