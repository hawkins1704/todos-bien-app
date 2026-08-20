-- ============================================================================
-- 0013 · Borrar la propia cuenta
--
-- Lo exige la guía 5.1.1(v) de App Store Review: toda app que permita **crear**
-- una cuenta tiene que permitir **borrarla desde adentro de la app**. No alcanza
-- con un correo de soporte ni con un formulario web, y es causal de rechazo.
--
-- Aplica ahora y no antes porque hasta 0012 el acceso era por código al correo;
-- con el paso a correo + contraseña el registro pasó a ser un alta explícita.
--
-- Por qué hace falta un RPC y no basta con un DELETE desde el cliente: la fila
-- vive en `auth.users`, sobre la que `authenticated` no tiene ningún permiso —ni
-- debe tenerlo—. Esta función es el único agujero controlado, y solo deja pasar
-- el borrado de uno mismo.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- delete_my_account(password_attempt)
--
-- Borra la fila de `auth.users` del usuario que llama. Todo lo demás se va solo:
-- `profiles` referencia `auth.users` con `on delete cascade`, y las 13 tablas de
-- la app cuelgan de `profiles` con la misma regla. Verificado contra el esquema
-- real, no asumido:
--
--   auth.users
--     └─ profiles (cascade)
--          ├─ user_settings · notification_preferences · push_tokens
--          ├─ user_status · drills · alert_deliveries
--          ├─ connections (user_a, user_b, requested_by)
--          ├─ conversations (created_by) → messages · conversation_members
--          └─ invitations (inviter_id)
--
-- Dos consecuencias que no son obvias y que la app tiene que advertir antes:
--
-- 1. **Se llevan los chats.** `conversations.created_by` cascadea, así que si
--    quien borra su cuenta fue el que abrió la conversación, el otro también
--    pierde el historial. Es lo correcto para un chat de a dos —queda inservible
--    con una de las dos partes borrada— pero le pasa a alguien que no lo pidió.
-- 2. **No cancela la suscripción.** Las suscripciones las cobra Apple o Google,
--    no nosotros: borrar la cuenta acá no toca nada en la tienda. Por eso la
--    pantalla lo dice y manda a cancelarla aparte. `revenuecat_events` tampoco
--    se borra: es la bitácora de facturación y tiene que sobrevivir para poder
--    resolver un reclamo o un reembolso posterior. Solo la lee `service_role`.
--
-- La contraseña se valida **acá**, no solo en el cliente. Verificarla en la app
-- protege contra el teléfono desbloqueado, pero no contra alguien que ya tenga
-- el token de sesión y llame al RPC directo: eso solo lo cierra el servidor.
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account(password_attempt text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  stored_password text;
begin
  if me is null then
    raise exception 'no autenticado' using errcode = '28000';
  end if;

  select u.encrypted_password into stored_password
  from auth.users u
  where u.id = me;

  if not found then
    raise exception 'la cuenta ya no existe' using errcode = '28000';
  end if;

  -- Una cuenta sin contraseña no es un caso raro ni un error: son las que
  -- entran por Apple o Google, donde el proveedor ya autenticó y no hay nada
  -- que comparar. Para esas, la sesión abierta ES la prueba de identidad.
  if stored_password is not null and stored_password <> '' then
    if password_attempt is null
       or stored_password <> extensions.crypt(password_attempt, stored_password) then
      raise exception 'contraseña incorrecta' using errcode = '28P01';
    end if;
  end if;

  delete from auth.users where id = me;
end;
$$;

comment on function public.delete_my_account(text) is
  'Borra la cuenta de quien llama, previa validación de su contraseña. Todo lo demás cae por cascada desde profiles. Requisito 5.1.1(v) de App Store Review.';

revoke execute on function public.delete_my_account(text) from public, anon;
grant execute on function public.delete_my_account(text) to authenticated;
