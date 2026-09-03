import * as SQLite from 'expo-sqlite';

/**
 * Base local. Es el origen de verdad de lo que se PINTA en pantalla: el
 * dashboard nunca espera a la red (spec §16.1). El servidor solo la refresca.
 *
 * Singleton a nivel de módulo, no solo contexto de React, porque la tarea de
 * background que responde al push de sismo corre fuera del árbol de componentes
 * y también necesita escribir aquí.
 */

const DATABASE_NAME = 'todosbien.db';
const DATABASE_VERSION = 6;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open().catch((error: unknown) => {
    // 🔴 Sin esta línea, un fallo al abrir queda cacheado **como promesa
    // rechazada**: `??=` no reemplaza un valor que no es null, así que cada
    // `getDb()` posterior devuelve el mismo rechazo y la app se queda en el
    // splash para siempre, sin más salida que reinstalar.
    //
    // Es lo que convirtió un tropiezo de esquema en una app muerta el
    // 2026-09-02. Abrir la base puede fallar por cosas transitorias —la tarea
    // de fondo tiene la base bloqueada, el disco está lleno—: el arranque
    // siguiente tiene que poder volver a intentarlo.
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return db;
}

/**
 * `ALTER TABLE … ADD COLUMN` que se puede correr dos veces.
 *
 * SQLite no tiene `ADD COLUMN IF NOT EXISTS`, así que la comprobación va a
 * mano. **No es cinturón y tirantes sobre la transacción de abajo**: hay
 * teléfonos que YA están en el estado que la transacción previene —columna
 * agregada, `user_version` sin subir— y para esos la atomicidad llega tarde.
 * Sin esto, esos teléfonos siguen sin abrir aunque el resto esté arreglado.
 */
async function agregarColumna(
  txn: SQLite.SQLiteDatabase,
  tabla: string,
  columna: string,
  definicion: string,
): Promise<void> {
  const columnas = await txn.getAllAsync<{ name: string }>(`PRAGMA table_info(${tabla})`);
  if (columnas.some((c) => c.name === columna)) return;
  await txn.execAsync(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${definicion};`);
}

/**
 * ## Por qué esto es una transacción exclusiva y no una lista de sentencias
 *
 * Lo era, y el 2026-09-02 la app se quedó muerta en el splash con
 * `duplicate column name: receives_notifications`. El estado del teléfono era
 * imposible según el código: la columna de la v6 estaba puesta **y**
 * `user_version` seguía en 5, así que la migración la intentaba de nuevo en cada
 * arranque y fallaba en cada arranque.
 *
 * Ese estado era inalcanzable leyendo el código de arriba abajo, porque el
 * `ALTER` y el `PRAGMA user_version` estaban a cuatro líneas. Pero eran **dos
 * sentencias sueltas**, y hay dos formas de quedarse en el medio. No se puede
 * saber cuál fue —el teléfono no lo cuenta— y da igual: las dos las cierra lo
 * mismo.
 *
 *   1. **Dos contextos de JavaScript a la vez.** La tarea de fondo que responde
 *      al push de sismo no vive en el árbol de React: tiene su propio módulo, su
 *      propio `dbPromise` y su propia migración, sobre el mismo archivo. Los dos
 *      leen la versión 5, los dos hacen el `ALTER`, uno gana y el otro muere — y
 *      el que muere nunca escribe la versión. Que el singleton evite la carrera
 *      **dentro** de un contexto no dice nada de lo que pasa entre dos.
 *   2. **El proceso muere en el medio.** Entre las dos sentencias, un cierre
 *      forzado o un iOS impaciente con un arranque lento dejan el `ALTER`
 *      commiteado y la versión sin subir.
 *
 * La documentación de expo-sqlite v57 lo dice con todas las letras para este
 * caso: una transacción normal «no es exclusiva y puede ser interrumpida por
 * otras consultas asíncronas», y recomienda `withExclusiveTransactionAsync`
 * para migraciones. Ahora el `ALTER` y el `PRAGMA user_version` son un solo
 * hecho: o pasan los dos o no pasa ninguno.
 */
async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  // Fuera de la transacción a propósito: SQLite **ignora en silencio** un cambio
  // de `journal_mode` dentro de una. Adentro, la base se quedaría sin WAL y sin
  // avisar. Es idempotente, así que correrlo en cada arranque no cuesta nada.
  await db.execAsync('PRAGMA journal_mode = WAL;');

  await db.withExclusiveTransactionAsync(async (txn) => {
    const row = await txn.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const current = row?.user_version ?? 0;

    // Al día, o más nueva que este código (una instalación que se degradó). En
    // los dos casos lo correcto es no tocar nada: bajar `user_version` a mano
    // haría que la próxima versión creyera que tiene que volver a migrar.
    if (current >= DATABASE_VERSION) return;

    if (current < 1) {
      await txn.execAsync(`
      -- Espejo de get_circle(). Una fila por contacto, aceptado o pendiente.
      CREATE TABLE IF NOT EXISTS circle (
        user_id                TEXT PRIMARY KEY NOT NULL,
        connection_id          TEXT NOT NULL,
        display_name           TEXT NOT NULL DEFAULT '',
        avatar_url             TEXT,
        action_plan            TEXT,
        action_plan_updated_at TEXT,
        connection_status      TEXT NOT NULL,
        requested_by           TEXT,
        connection_created_at  TEXT,
        status                 TEXT,
        status_message         TEXT,
        latitude               REAL,
        longitude              REAL,
        location_accuracy_m    REAL,
        location_at            TEXT,
        quake_event_id         TEXT,
        is_drill               INTEGER NOT NULL DEFAULT 0,
        reported_at            TEXT,
        status_updated_at      TEXT
      );

      -- Escrituras pendientes de subir. Se vacían solas al haber cualquier
      -- conectividad, sin que el usuario tenga que hacer nada.
      CREATE TABLE IF NOT EXISTS outbox (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT NOT NULL,
        payload     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        last_error  TEXT
      );

      CREATE TABLE IF NOT EXISTS conversations_cache (
        id              TEXT PRIMARY KEY NOT NULL,
        kind            TEXT NOT NULL,
        title           TEXT,
        other_user_id   TEXT,
        last_message_at TEXT,
        last_read_at    TEXT
      );

      CREATE TABLE IF NOT EXISTS messages_cache (
        id              TEXT PRIMARY KEY NOT NULL,
        conversation_id TEXT NOT NULL,
        sender_id       TEXT NOT NULL,
        body            TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        is_drill        INTEGER NOT NULL DEFAULT 0,
        pending         INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS messages_cache_conversation_idx
        ON messages_cache (conversation_id, created_at DESC);

      CREATE TABLE IF NOT EXISTS tips_cache (
        id          TEXT PRIMARY KEY NOT NULL,
        title       TEXT NOT NULL,
        body        TEXT NOT NULL,
        long_body   TEXT,
        source_name TEXT NOT NULL,
        source_url  TEXT NOT NULL,
        phase       TEXT NOT NULL,
        sort_order  INTEGER NOT NULL DEFAULT 0
      );

      -- Historial local de tips vistos, para rotar sin repetir consecutivos
      -- (spec §11). No hace falta que viva en el servidor.
      CREATE TABLE IF NOT EXISTS tips_seen (
        tip_id  TEXT PRIMARY KEY NOT NULL,
        seen_at TEXT NOT NULL
      );

      -- Clave/valor para lo suelto: perfil propio, estado propio, último sismo,
      -- marca de tiempo de la última sincronización.
      CREATE TABLE IF NOT EXISTS kv (
        key        TEXT PRIMARY KEY NOT NULL,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  // v2 · Planes de acción con nombre (migración 0024). Se guardan como JSON en
  // una sola columna en vez de una tabla local: no se consultan ni se filtran,
  // se pintan enteros junto al contacto, y así el espejo de `get_circle` sigue
  // siendo un INSERT por fila.
  //
  // Va como columna nueva y no como recreación de la tabla porque el círculo
  // cacheado es lo que se lee SIN RED después de un sismo. Borrarlo para
  // migrar dejaría la pantalla vacía justo hasta la primera sincronización.
    if (current < 2) {
      await agregarColumna(txn, 'circle', 'action_plans', 'TEXT');
    }

  // v3 · Qué sismos alcanzaron a cada contacto (migración 0025). Columna nueva
  // por el mismo motivo que la v2: el círculo cacheado es lo que se lee SIN RED
  // justo después de un sismo, y recrear la tabla lo dejaría vacío hasta la
  // primera sincronización.
  //
  // Las filas viejas quedan en NULL, que `parseQuakeIds` degrada a lista vacía:
  // hasta el primer `syncCircle` nadie sale marcado como callado. Es el lado
  // correcto para equivocarse.
    if (current < 3) {
      await agregarColumna(txn, 'circle', 'alerted_quake_ids', 'TEXT');
    }

  // v4 · Ocultar un chat directo de la lista (migración 0032 del servidor).
  //
  // Es LOCAL a propósito, y es la única forma honesta de «eliminar» un chat de
  // dos. Salir de verdad —borrar la fila de `conversation_members`— dejaría a la
  // persona sin avisos de ese contacto para siempre y sin manera de volver: la
  // política de DELETE del servidor directamente lo prohíbe. Ver la cabecera de
  // `0032_conversaciones_renombrar_y_salir.sql`.
  //
  // Guarda CUÁNDO se ocultó. La lista compara ese instante contra
  // `last_message_at` y **desoculta sola** en cuanto llega un mensaje posterior:
  // si te escriben, la conversación vuelve. Un chat oculto que se traga un
  // mensaje sería exactamente el fallo que esta app no se puede permitir.
  //
  // Por eso `writeConversations` hace UPSERT y no DELETE+INSERT: recrear la fila
  // en cada sincronización borraría esta columna y el chat reaparecería solo.
    if (current < 4) {
      await agregarColumna(txn, 'conversations_cache', 'hidden_at', 'TEXT');
    }

  // v5 · A qué grupo pertenece cada conversación (migración 0034 del servidor).
  //
  // Es lo que separa las dos clases de conversación grupal que ahora conviven:
  // las que tienen grupo detrás —donde el nombre y los integrantes se editan en
  // el grupo— y las **sueltas**, anteriores a la 0034, que ya no se pueden crear
  // pero siguen existiendo y siguen siendo mensajes de alguien. Sin esta columna
  // la lista no sabría cuál de las dos está pintando.
    if (current < 5) {
      await agregarColumna(txn, 'conversations_cache', 'group_id', 'TEXT');
    }

    // v6 · Quién de tu red no tiene dónde recibir un aviso (migración 0039).
    //
    // Nace en 1 —«sí recibe»— y no en 0: mientras no llegue el primer refresco no
    // sabemos nada, y una advertencia sobre un contacto es demasiado seria para
    // mostrarla por no tener el dato todavía. Es la misma regla del `coalesce`
    // del servidor: ante la duda, no se avisa.
    //
    // 🔴 Es la que reventó. El teléfono quedó con la columna puesta y
    // `user_version` en 5, así que reintentaba el `ALTER` en cada arranque.
    if (current < 6) {
      await agregarColumna(txn, 'circle', 'receives_notifications', 'INTEGER NOT NULL DEFAULT 1');
    }

    // Va DENTRO de la transacción, que es el punto entero: si esto no se
    // escribe, nada de lo de arriba se escribió tampoco.
    await txn.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  });
}

/** Borra todo lo local. Se llama al cerrar sesión. */
export async function wipeLocalCache(): Promise<void> {
  const db = await getDb();
  await db.execAsync(`
    DELETE FROM circle;
    DELETE FROM outbox;
    DELETE FROM conversations_cache;
    DELETE FROM messages_cache;
    DELETE FROM tips_seen;
    DELETE FROM kv;
  `);
}
