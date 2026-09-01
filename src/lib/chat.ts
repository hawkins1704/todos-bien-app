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
  /**
   * El grupo dueño de esta conversación (migración 0034).
   *
   * `null` en los directos y en las **grupales sueltas**: las que se crearon
   * antes de la 0034, cuando una conversación grupal era un objeto propio. Ya no
   * se pueden crear, pero las que hay siguen funcionando — son mensajes de
   * alguien — y son el único caso donde «salir» sigue siendo una acción del
   * chat y no del grupo.
   */
  groupId: string | null;
  lastMessageAt: string | null;
  lastReadAt: string | null;
  /**
   * Eliminada de la lista, y **solo en este teléfono** (esquema local v4).
   *
   * Ya viene resuelta: es `true` únicamente si la eliminaste y no ha llegado
   * ningún mensaje después. Un mensaje nuevo la trae de vuelta sola.
   */
  hidden: boolean;
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

/**
 * ⚠️ **Acá ya no se crean conversaciones grupales.** Desde la 0034 el chat nace
 * con el grupo (`createGroup` en lib/api), y sus integrantes son los del grupo:
 * los sincroniza un disparador, no el cliente. Una conversación grupal sin grupo
 * detrás es algo que solo puede venir de una versión anterior de la app.
 */
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
    .select('id, kind, title, last_message_at, group_id')
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
    groupId: c.group_id,
    lastMessageAt: c.last_message_at,
    lastReadAt: myReadByConversation.get(c.id) ?? null,
    // El servidor no sabe nada del ocultamiento: es local. Se escribe y se
    // relee, que es lo que resuelve el `hidden` de verdad contra `hidden_at`.
    hidden: false,
  }));

  await writeConversations(summaries);
  return readCachedConversations();
}

/**
 * UPSERT, y **no** DELETE + INSERT como antes.
 *
 * El motivo es `hidden_at`: recrear la fila en cada sincronización borraría el
 * corte de «eliminar chat» y la conversación reaparecería con sus mensajes al
 * siguiente refresco. Las filas que ya no vienen del servidor —una conversación
 * grupal de la que saliste, o de la que te sacaron— se borran aparte, junto con
 * sus mensajes: si el servidor ya no te deja leerlos, dejarlos acá sería guardar
 * en el teléfono lo único que queda de una sala a la que no perteneces.
 */
async function writeConversations(summaries: ConversationSummary[]): Promise<void> {
  const db = await getDb();
  const vigentes = summaries.map((c) => c.id);

  await db.withTransactionAsync(async () => {
    // `pending = 0` en el borrado de mensajes: lo que sigue en el outbox es
    // texto que la persona escribió y que todavía no salió. Un parpadeo del
    // servidor no puede llevárselo.
    if (vigentes.length === 0) {
      await db.runAsync('DELETE FROM conversations_cache');
      await db.runAsync('DELETE FROM messages_cache WHERE pending = 0');
    } else {
      const huecos = vigentes.map(() => '?').join(',');
      await db.runAsync(`DELETE FROM conversations_cache WHERE id NOT IN (${huecos})`, ...vigentes);
      await db.runAsync(
        `DELETE FROM messages_cache WHERE pending = 0 AND conversation_id NOT IN (${huecos})`,
        ...vigentes,
      );
    }

    for (const c of summaries) {
      await db.runAsync(
        `INSERT INTO conversations_cache
           (id, kind, title, other_user_id, group_id, last_message_at, last_read_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           kind = excluded.kind,
           title = excluded.title,
           other_user_id = excluded.other_user_id,
           group_id = excluded.group_id,
           last_message_at = excluded.last_message_at,
           last_read_at = excluded.last_read_at`,
        c.id,
        c.kind,
        c.title,
        c.otherUserId,
        c.groupId,
        c.lastMessageAt,
        c.lastReadAt,
      );
    }
  });
}

/**
 * Elimina una conversación de este teléfono: la saca de la lista **y borra sus
 * mensajes**, como WhatsApp.
 *
 * `hidden_at` no es solo un «ocultar»: es un CORTE. Marca hasta dónde se borró,
 * y `syncMessages` no vuelve a bajar nada anterior a esa marca. Sin ese corte
 * el borrado duraría hasta el siguiente refresco, porque los mensajes siguen
 * estando en el servidor —ahí no se toca nada, ni para uno ni para el otro—.
 *
 * Lo que NO hace, y es a propósito: no te saca de la conversación. Ver la
 * cabecera de la migración 0032 — borrar la fila de miembro de un chat directo
 * te dejaría sin recibir nunca más un aviso de esa persona, sin forma de
 * volver. Por eso «eliminar» es local y reversible: si te vuelve a escribir, la
 * conversación aparece de nuevo, con los mensajes nuevos y solo esos.
 *
 * El corte se toma como el más nuevo entre el reloj de este teléfono y el
 * último mensaje conocido. Un teléfono atrasado pondría la marca antes del
 * último mensaje y ese mensaje volvería a bajarse: el chat recién eliminado
 * reaparecería con contenido viejo.
 */
export async function deleteConversation(conversationId: string): Promise<void> {
  const db = await getDb();

  const fila = await db.getFirstAsync<{ last_message_at: string | null }>(
    'SELECT last_message_at FROM conversations_cache WHERE id = ?',
    conversationId,
  );

  const ahora = new Date().toISOString();
  const corte =
    fila?.last_message_at && fila.last_message_at > ahora ? fila.last_message_at : ahora;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      'UPDATE conversations_cache SET hidden_at = ? WHERE id = ?',
      corte,
      conversationId,
    );
    await db.runAsync('DELETE FROM messages_cache WHERE conversation_id = ?', conversationId);
  });
}

/**
 * Salir de una conversación grupal **suelta**, de las anteriores a la 0034.
 *
 * Para las que tienen grupo detrás esto no se usa: se sale del grupo, y el
 * disparador de la 0034 borra la fila de `conversation_members`. Queda para las
 * viejas, que si no serían inabandonables.
 *
 * El servidor solo lo permite en grupales: en un chat directo, borrar la fila de
 * miembro dejaría a la persona sin avisos de ese contacto para siempre (ver
 * cabecera de 0032). Por eso los directos se eliminan de este teléfono y no se
 * abandonan.
 */
export async function leaveGroupConversation(
  conversationId: string,
  myUserId: string,
): Promise<void> {
  const { error } = await supabase
    .from('conversation_members')
    .delete()
    .eq('conversation_id', conversationId)
    .eq('user_id', myUserId);

  if (error) throw error;

  const db = await getDb();
  await db.runAsync('DELETE FROM conversations_cache WHERE id = ?', conversationId);
  await db.runAsync('DELETE FROM messages_cache WHERE conversation_id = ?', conversationId);
}

export async function readCachedConversations(): Promise<ConversationSummary[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    kind: string;
    title: string | null;
    other_user_id: string | null;
    group_id: string | null;
    last_message_at: string | null;
    last_read_at: string | null;
    hidden_at: string | null;
  }>('SELECT * FROM conversations_cache ORDER BY last_message_at DESC NULLS LAST');

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as 'direct' | 'group',
    title: r.title,
    otherUserId: r.other_user_id,
    groupId: r.group_id,
    lastMessageAt: r.last_message_at,
    lastReadAt: r.last_read_at,
    // Se resuelve acá y no en quien la use: la regla —«sigue oculta salvo que
    // haya llegado algo después»— tiene que ser una sola, o alguna pantalla se
    // va a olvidar de la segunda mitad y va a esconder un mensaje nuevo.
    hidden:
      r.hidden_at !== null && (r.last_message_at === null || r.last_message_at <= r.hidden_at),
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
  const db = await getDb();

  // El corte de `deleteConversation`. Se lee antes de pedir nada: lo que quedó
  // del otro lado de la marca se borró de este teléfono a pedido de la persona,
  // y volver a bajarlo sería deshacerle el borrado en silencio.
  const cache = await db.getFirstAsync<{ hidden_at: string | null }>(
    'SELECT hidden_at FROM conversations_cache WHERE id = ?',
    conversationId,
  );

  let consulta = supabase
    .from('messages')
    .select('id, conversation_id, sender_id, body, created_at, is_drill, client_id')
    .eq('conversation_id', conversationId);

  if (cache?.hidden_at) consulta = consulta.gt('created_at', cache.hidden_at);

  const { data, error } = await consulta.order('created_at', { ascending: false }).limit(limit);

  if (error) throw error;

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
