-- ===========================================================================
-- 0032 · Renombrar y salir de una conversación grupal
--
-- Hasta acá `conversations` y `conversation_members` solo tenían políticas de
-- SELECT (más el UPDATE de `last_read_at`). O sea: una conversación grupal se
-- creaba y no se podía renombrar ni abandonar nunca.
--
-- ⚠️ LO QUE ESTA MIGRACIÓN **PROHÍBE A PROPÓSITO**, y es lo más importante que
-- hay acá: **no se puede salir de una conversación DIRECTA.**
--
-- No es una omisión, es un cerrojo. `get_or_create_direct_conversation` busca
-- por `direct_key` y, si la encuentra, **devuelve sin tocar los miembros**:
-- solo los inserta cuando crea la conversación. Entonces, si alguien borrara su
-- fila de `conversation_members` en un chat directo:
--
--   1. `messages_select_member` deja de devolverle los mensajes.
--   2. `messages_insert_member` deja de dejarlo escribir.
--   3. `on_message_sent` (0015) arma los destinatarios desde
--      `conversation_members`, así que **nunca más le llega un aviso**.
--   4. Y volver a tocar a esa persona no lo arregla: la RPC encuentra la
--      conversación vieja y no lo vuelve a agregar.
--
-- El resultado sería un silencio permanente e invisible con un contacto — en
-- una app cuyo propósito es que la gente se entere. Por eso el `and c.kind =
-- 'group'` de la política de DELETE no es decoración: es lo que hace imposible
-- ese estado, venga la llamada de donde venga.
--
-- En el cliente, «eliminar» un chat directo se resuelve **ocultándolo en la
-- caché local**. La conversación sigue viva en el servidor, los avisos siguen
-- llegando, y reaparece con el próximo mensaje. Es lo único honesto que se
-- puede ofrecer sobre un objeto que es de dos.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1 · Renombrar
--
-- Cualquier integrante puede, no solo quien la creó: es lo que la gente espera
-- de un chat grupal, y el caso «el que la armó ya no está» no puede dejar a los
-- demás con un nombre equivocado para siempre.
--
-- El permiso es POR COLUMNA. Sin esto, una política de UPDATE dejaría reescribir
-- `kind`, `created_by` o `direct_key` — y cambiar `direct_key` a mano permitiría
-- colisionar la conversación directa de otras dos personas.
-- ---------------------------------------------------------------------------
grant update (title) on public.conversations to authenticated;

create policy conversations_rename_group on public.conversations
  for update to authenticated
  using (kind = 'group' and private.is_conversation_member(id))
  with check (kind = 'group' and private.is_conversation_member(id));

-- ---------------------------------------------------------------------------
-- 2 · Salir
--
-- Dos condiciones, y las dos son necesarias:
--   - `user_id = auth.uid()`  → sacas tu fila, no la de otro.
--   - `c.kind = 'group'`      → el cerrojo de la cabecera.
-- ---------------------------------------------------------------------------
grant delete on public.conversation_members to authenticated;

create policy conversation_members_leave_group on public.conversation_members
  for delete to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.kind = 'group'
    )
  );

comment on policy conversation_members_leave_group on public.conversation_members is
  'Salir de una conversación grupal. Los directos quedan fuera a propósito: sin fila de miembro no llegan avisos y la RPC no vuelve a agregar a nadie (ver cabecera de 0032).';
