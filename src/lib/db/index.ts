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
const DATABASE_VERSION = 2;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= open();
  return dbPromise;
}

async function open(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await migrate(db);
  return db;
}

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;

  if (current < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

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
    await db.execAsync(`ALTER TABLE circle ADD COLUMN action_plans TEXT;`);
  }

  if (current !== DATABASE_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
  }
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
