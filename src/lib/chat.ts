import * as Crypto from 'expo-crypto';

import { getDb } from '@/lib/db';
import { enqueue } from '@/lib/db/outbox';
import { supabase } from '@/lib/supabase';

/** Chat individual y grupal (spec §12, tier free). */

export type ConversationSummary = {
  id: string;
  kind: 'direct' | 'group';
  title: string | null;
  otherUserId: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  isDrill: boolean;
  /** true mientras sigue en el outbox esperando conexión. */
  pending: boolean;
};

export async function openDirectConversation(otherUserId: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    other_user_id: otherUserId,
  });
  if (error) throw error;
  return data.id;
}

export async function syncConversations(myUserId: string): Promise<ConversationSummary[]> {
  const { data: memberships, error: membershipError } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id, last_read_at');

  if (membershipError) throw membershipError;

  const conversationIds = [...new Set((memberships ?? []).map((m) => m.conversation_id))];
  if (conversationIds.length === 0) {
    await writeConversations([]);
    return [];
  }

  const { data: conversations, error: conversationError } = await supabase
    .from('conversations')
    .select('id, kind, title, last_message_at')
    .in('id', conversationIds);

  if (conversationError) throw conversationError;

  const myReadByConversation = new Map(
    (memberships ?? [])
      .filter((m) => m.user_id === myUserId)
      .map((m) => [m.conversation_id, m.last_read_at]),
  );

  const otherByConversation = new Map(
    (memberships ?? [])
      .filter((m) => m.user_id !== myUserId)
      .map((m) => [m.conversation_id, m.user_id]),
  );

  const summaries: ConversationSummary[] = (conversations ?? []).map((c) => ({
    id: c.id,
    kind: c.kind as 'direct' | 'group',
    title: c.title,
    otherUserId: c.kind === 'direct' ? (otherByConversation.get(c.id) ?? null) : null,
    lastMessageAt: c.last_message_at,
    lastReadAt: myReadByConversation.get(c.id) ?? null,
  }));

  await writeConversations(summaries);
  return summaries;
}

async function writeConversations(summaries: ConversationSummary[]): Promise<void> {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM conversations_cache');
    for (const c of summaries) {
      await db.runAsync(
        `INSERT INTO conversations_cache (id, kind, title, other_user_id, last_message_at, last_read_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        c.id,
        c.kind,
        c.title,
        c.otherUserId,
        c.lastMessageAt,
        c.lastReadAt,
      );
    }
  });
}

export async function readCachedConversations(): Promise<ConversationSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    kind: string;
    title: string | null;
    other_user_id: string | null;
    last_message_at: string | null;
    last_read_at: string | null;
  }>('SELECT * FROM conversations_cache ORDER BY last_message_at DESC NULLS LAST');

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as 'direct' | 'group',
    title: r.title,
    otherUserId: r.other_user_id,
    lastMessageAt: r.last_message_at,
    lastReadAt: r.last_read_at,
  }));
}

/**
 * Baja los mensajes del servidor y **reconcilia el envío optimista**.
 *
 * 🔴 Acá vivía el bug del mensaje duplicado. `sendMessage()` guarda la fila
 * local con `id = client_id`, porque en ese momento el id del servidor todavía
 * no existe. Al subirla, Postgres le pone su propio `id` (`gen_random_uuid()`),
 * y esta función insertaba esa fila **como si fuera un mensaje nuevo**: quedaban
 * dos filas con el mismo texto y distinta clave primaria, y la lista pintaba
 * las dos.
 *
 * Se veía exactamente como lo reportó quien lo encontró: el reloj de «pendiente»
 * al enviar, y al volver a entrar el reloj ya no estaba pero el mensaje aparecía
 * dos veces. El reloj desaparecía porque el outbox apagaba `pending` en la fila
 * provisional; la copia del servidor entraba aparte y ya nacía sin reloj.
 *
 * El arreglo es traer `client_id` y borrar la provisional antes de insertar la
 * definitiva. De paso **limpia los duplicados que ya estén guardados**: cada
 * sincronización vuelve a intentar el borrado, así que los teléfonos que
 * arrastran el problema se arreglan solos al abrir la conversación.
 */
export async function syncMessages(conversationId: string, limit = 100): Promise<void> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, is_drill, client_id')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const db = await getDb();
  await db.withTransactionAsync(async () => {
    for (const m of data ?? []) {
      // La fila provisional del envío optimista, si esta copia es el eco de un
      // mensaje propio. Para los mensajes ajenos no borra nada: su `client_id`
      // se generó en otro teléfono y no coincide con ninguna clave de acá.
      await db.runAsync('DELETE FROM messages_cache WHERE id = ?', m.client_id);

      await db.runAsync(
        `INSERT INTO messages_cache (id, conversation_id, sender_id, body, created_at, is_drill, pending)
         VALUES (?, ?, ?, ?, ?, ?, 0)
         ON CONFLICT (id) DO UPDATE SET body = excluded.body, pending = 0`,
        m.id,
        m.conversation_id,
        m.sender_id,
        m.body,
        m.created_at,
        m.is_drill ? 1 : 0,
      );
    }
  });
}

export async function readCachedMessages(conversationId: string): Promise<ChatMessage[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    conversation_id: string;
    sender_id: string;
    body: string;
    created_at: string;
    is_drill: number;
    pending: number;
  }>(
    'SELECT * FROM messages_cache WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 200',
    conversationId,
  );

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
    isDrill: r.is_drill === 1,
    pending: r.pending === 1,
  }));
}

/**
 * Envío optimista: el mensaje aparece al instante marcado como pendiente y
 * queda en el outbox. `client_id` hace la subida idempotente —hay un índice
 * único `(conversation_id, sender_id, client_id)`—, así que un reintento tras
 * un corte no duplica el mensaje en el servidor.
 *
 * **No sube nada por sí misma, a propósito.** Antes hacía `void flushOutbox()`
 * acá adentro, y como nadie sabía cuándo terminaba, el reloj de «pendiente» se
 * quedaba puesto hasta que algo ajeno provocara una relectura —normalmente el
 * eco de Realtime—. Si el socket estaba caído, el mensaje ya estaba entregado y
 * la burbuja seguía mostrando que no. Ahora la subida la dispara quien llama,
 * que es el único que puede refrescar la pantalla al terminar.
 */
export async function sendMessage(input: {
  conversationId: string;
  senderId: string;
  body: string;
  isDrill: boolean;
}): Promise<void> {
  const clientId = Crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const db = await getDb();
  await db.runAsync(
    `INSERT INTO messages_cache (id, conversation_id, sender_id, body, created_at, is_drill, pending)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    clientId,
    input.conversationId,
    input.senderId,
    input.body,
    createdAt,
    input.isDrill ? 1 : 0,
  );

  await enqueue('message', {
    conversationId: input.conversationId,
    clientId,
    body: input.body,
    isDrill: input.isDrill,
    createdAt,
  });
}

export async function markConversationRead(conversationId: string, userId: string): Promise<void> {
  const now = new Date().toISOString();

  const db = await getDb();
  await db.runAsync(
    'UPDATE conversations_cache SET last_read_at = ? WHERE id = ?',
    now,
    conversationId,
  );

  await supabase
    .from('conversation_members')
    .update({ last_read_at: now })
    .eq('conversation_id', conversationId)
    .eq('user_id', userId);
}
