-- ============================================================================
-- 0020 · Denuncias de contenido
--
-- Existe por la **guía 1.2 de App Store Review**: una app donde una persona
-- escribe algo que otra ve tiene que ofrecer denunciar, bloquear, un canal de
-- contacto publicado y actuar en 24 horas. De las cuatro, esta app ya tenía
-- tres: bloquear es quitar de mi círculo, el contacto está en
-- todosbien.app/soporte, y el compromiso va escrito en los términos. Faltaba
-- denunciar, y era el rechazo más probable del primer envío.
--
-- Alcance real: el chat es 1 a 1 entre dos personas que **ambas aceptaron** la
-- conexión, y el mensaje de estado lo ve solo el círculo. No hay contenido
-- público ni descubrimiento de desconocidos. Aun así el mecanismo tiene que
-- existir: la regla no distingue.
--
-- ## Dos decisiones que no son obvias
--
-- **1 · La denuncia guarda una copia del mensaje.** Si el mensaje se borra o la
-- persona denunciada elimina su cuenta, una denuncia que apunte con una llave
-- foránea se queda sin objeto justo cuando hay que revisarla. La copia es la
-- evidencia; el `message_id` es solo la referencia.
--
-- **2 · Las llaves foráneas son `on delete set null`, no `cascade`.** Todas las
-- tablas de este proyecto cuelgan de `profiles` con `cascade`, porque borrar la
-- cuenta tiene que borrar los datos de esa persona (§1.1.3). Acá no: una
-- denuncia no es un dato *del* denunciado, es un registro de moderación, y si
-- se borrara al eliminar la cuenta bastaría con borrarse para limpiar el
-- historial. Es el mismo criterio que `revenuecat_events`.
-- ============================================================================

create table if not exists public.content_reports (
  id uuid primary key default gen_random_uuid(),

  -- Las dos partes pueden quedar en null si alguna borra su cuenta: ver §2 de
  -- la cabecera. La denuncia sobrevive igual porque lleva la copia del texto.
  reporter_id uuid references public.profiles (id) on delete set null,
  reported_user_id uuid references public.profiles (id) on delete set null,

  conversation_id uuid references public.conversations (id) on delete set null,
  message_id uuid references public.messages (id) on delete set null,

  /** Copia del mensaje al momento de denunciarlo. Es la evidencia. */
  message_body text,

  reason text not null check (
    reason in ('harassment', 'spam', 'impersonation', 'inappropriate', 'other')
  ),
  detail text check (detail is null or char_length(detail) <= 1000),

  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'actioned', 'dismissed')),

  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists content_reports_pending_idx
  on public.content_reports (created_at desc)
  where status = 'pending';

create index if not exists content_reports_reported_user_idx
  on public.content_reports (reported_user_id);

-- Un mismo mensaje, una sola denuncia por persona: tocar dos veces el botón no
-- puede inflar la cola de moderación.
create unique index if not exists content_reports_unique_message
  on public.content_reports (reporter_id, message_id)
  where message_id is not null;

alter table public.content_reports enable row level security;

-- Sin políticas a propósito: nadie que use la app lee esta tabla. La escritura
-- entra solo por `submit_report()`, que es security definer. El grant por
-- defecto de Supabase a anon/authenticated se revoca explícitamente — el mismo
-- descuido que apareció en 0010 con `alert_deliveries`.
revoke all on public.content_reports from anon, authenticated;

-- ---------------------------------------------------------------------------
-- submit_report · el único camino de escritura
-- ---------------------------------------------------------------------------
create or replace function public.submit_report(
  reported_user_id uuid,
  reason text,
  detail text default null,
  conversation_id uuid default null,
  message_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  cuerpo text;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  if reported_user_id = me then
    raise exception 'no puedes denunciarte a ti mismo' using errcode = '22023';
  end if;

  -- Si viene un mensaje, se comprueba que quien denuncia de verdad lo pueda
  -- ver, y se copia el texto. Sin esta comprobación, cualquiera con un id
  -- podría extraer el contenido de una conversación ajena a través de la copia.
  if message_id is not null then
    select m.body into cuerpo
    from public.messages m
    join public.conversation_members cm
      on cm.conversation_id = m.conversation_id and cm.user_id = me
    where m.id = message_id;

    if cuerpo is null then
      raise exception 'ese mensaje no existe o no es tuyo para denunciar'
        using errcode = '42501';
    end if;
  end if;

  insert into public.content_reports (
    reporter_id, reported_user_id, conversation_id, message_id,
    message_body, reason, detail
  ) values (
    me, reported_user_id, conversation_id, message_id,
    cuerpo, reason, nullif(btrim(detail), '')
  )
  on conflict do nothing;
end;
$$;

revoke execute on function public.submit_report(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.submit_report(uuid, text, text, uuid, uuid) to authenticated;

comment on table public.content_reports is
  'Denuncias de contenido (App Store Review 1.2). Solo la lee service_role; se escribe con submit_report().';
comment on function public.submit_report is
  'Registra una denuncia. Verifica que el mensaje denunciado sea visible para quien denuncia y guarda una copia del texto como evidencia.';

-- ---------------------------------------------------------------------------
-- Poda: NO se agenda ninguna, y es a propósito
--
-- Las tres colas de este proyecto (`alert_deliveries`, `notification_deliveries`,
-- `push_receipts`) se podan a los 30 días porque son bitácoras de entrega. Esta
-- no: es el registro de que se atendió una denuncia, y es exactamente lo que
-- habría que poder mostrar si alguien pregunta cómo se moderó algo.
-- ---------------------------------------------------------------------------
