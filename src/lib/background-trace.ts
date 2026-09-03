import { KV, kvGet, kvSet } from '@/lib/db/kv';
import { supabase } from '@/lib/supabase';

/**
 * Migajas de la tarea de fondo.
 *
 * ## Por qué existe
 *
 * Cuando llega un push silencioso y la ubicación no se captura, hay dos causas
 * que dejan **el mismo rastro en el servidor: ninguno**.
 *
 *   1. iOS nunca levantó la app.
 *   2. iOS la levantó y la tarea murió antes de llegar a la red.
 *
 * La primera es una regla del sistema y no tiene arreglo de nuestro lado; la
 * segunda es un bug nuestro. Sin poder separarlas, un negativo no se puede
 * interpretar — pasó dos veces el 2026-08-21 (§3.8.2 del estado del proyecto).
 *
 * ## Por qué se guarda local y no se manda al instante
 *
 * Sería más directo escribirle al servidor apenas despierta, pero **esa
 * escritura podría fallar justo por lo que estamos investigando**: sin sesión
 * restaurada, sin red, o porque la app nunca arrancó. La migaja tendría el
 * mismo punto ciego que el problema.
 *
 * Guardarla local no depende de nada: solo de que el JS haya corrido. Que es
 * exactamente la pregunta que queremos contestar.
 *
 * ## Qué contesta
 *
 * | Lo que se ve después | Qué significa |
 * |---|---|
 * | Ninguna migaja | iOS no levantó la app |
 * | `woke` y nada más | Arrancó y se murió antes de consultar |
 * | `woke` + `alert:none` | Arrancó bien, pero el servidor dijo que no había alerta |
 * | `woke` + `alert:found` + `captured` | Todo funcionó |
 *
 * Y lo mejor: no hace falta armar pruebas. Lo contesta el **uso real**, la
 * próxima vez que tiemble en el teléfono de cualquier usuario.
 */

/** Cuántas migajas se guardan antes de empezar a tirar las viejas. */
const MAX_MIGAJAS = 30;

export type BackgroundStage =
  /** Primera línea de la tarea. Si esta falta, la tarea nunca corrió. */
  | 'woke'
  | 'alert:none'
  | 'alert:found'
  | 'captured'
  | 'no-fix'
  | 'no-permission'
  | 'error';

type Migaja = { at: string; stage: BackgroundStage; detail?: string };

/**
 * Anota una migaja. **Nunca lanza**: si el diagnóstico rompiera la tarea que
 * está diagnosticando, sería peor que no tenerlo.
 */
export async function traceBackground(stage: BackgroundStage, detail?: string): Promise<void> {
  try {
    const previas = (await kvGet<Migaja[]>(KV.backgroundTrace)) ?? [];
    const migaja: Migaja = { at: new Date().toISOString(), stage, ...(detail ? { detail } : {}) };
    await kvSet(KV.backgroundTrace, [migaja, ...previas].slice(0, MAX_MIGAJAS));
  } catch {
    // Sin base local no hay diagnóstico, y no hay nada mejor que hacer acá.
  }
}

/**
 * Sube las migajas acumuladas y las borra de local.
 *
 * Se llama desde el refresco normal. Es barato: lo habitual es que no haya
 * ninguna, y entonces ni toca la red.
 *
 * **El borrado va después de que el servidor confirmó.** Al revés se perdería
 * justo la evidencia de un despertar que ocurrió sin red, que es uno de los
 * casos que queremos poder ver.
 *
 * ## El candado, y por qué hace falta
 *
 * Leer → insertar → borrar no es atómico, así que dos llamadas a la vez leen
 * las mismas migajas y las dos las insertan. Y **dos a la vez es lo normal en el
 * momento que importa**: cuando llega el aviso de un sismo, `refresh()` se
 * dispara por el listener del push *y* por el AppState al tocarlo.
 *
 * Pasó el 2026-09-02: la cadena entera de un teléfono quedó duplicada, con el
 * mismo milisegundo. No se pierde información, pero la duplicación cae
 * justamente sobre la tabla que existe para diagnosticar, y ahí un `woke` de más
 * se puede leer como un despertar de más.
 *
 * Mismo patrón que el `flushing` de `flushOutbox`, por el mismo motivo.
 */
let subiendo = false;

export async function flushBackgroundTrace(userId: string): Promise<number> {
  if (subiendo) return 0;
  subiendo = true;

  try {
    const migajas = await kvGet<Migaja[]>(KV.backgroundTrace);
    if (!migajas || migajas.length === 0) return 0;

    const { error } = await supabase.from('background_traces').insert(
      migajas.map((m) => ({
        user_id: userId,
        stage: m.stage,
        detail: m.detail ?? null,
        at: m.at,
      })),
    );

    if (error) return 0;

    await kvSet(KV.backgroundTrace, []);
    return migajas.length;
  } catch {
    return 0;
  } finally {
    subiendo = false;
  }
}
