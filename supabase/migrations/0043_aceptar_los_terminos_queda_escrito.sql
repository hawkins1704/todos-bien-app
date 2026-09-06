-- 0043 · Aceptar los términos deja rastro.
--
-- ## De dónde sale
--
-- Rechazo de App Store del 2026-09-05 sobre el build 1.0 (11), guía 1.2:
--
--   «require that users agree to terms (EULA) and these terms must make it
--    clear that there is no tolerance for objectionable content or abusive
--    users»
--
-- La casilla ya vive en `src/app/(auth)/sign-up.tsx` y sin marcarla el botón de
-- crear cuenta no se habilita. Esto es la otra mitad: que quede escrito quién
-- aceptó, cuándo y **qué versión**.
--
-- ## Por qué no basta con la casilla
--
-- Apple pide el video de la pantalla, no la fila de la tabla, así que esto no
-- desbloquea el reenvío. Sirve para dos cosas que sí importan después:
--
--   · poder responder «esta cuenta aceptó la versión 1.2 el día tal» sin tener
--     que creerle a nadie;
--   · saber a quién habría que volver a pedirle la aceptación el día que los
--     términos cambien de forma sustantiva. Sin la versión, esa pregunta no
--     tiene respuesta y la única salida sería pedírsela a todos otra vez.
--
-- ## Por qué viaja en `raw_user_meta_data` y no lo escribe el cliente
--
-- Con confirmación por correo encendida, `supabase.auth.signUp()` devuelve
-- usuario **sin sesión**: en ese momento el cliente no puede escribir en
-- `user_settings` porque RLS no lo deja, y no tendría con qué autenticarse. Si
-- se dejara para después de confirmar el correo, la aceptación se perdería para
-- quien nunca confirma, que es justo el caso donde el registro quedó a medias.
--
-- Mandándola en `options.data` del propio `signUp`, llega dentro de la fila de
-- `auth.users` y el disparador que ya existe la copia en la misma transacción
-- que crea el perfil. Es el mismo camino que ya usaba `display_name`.
--
-- ## Las columnas nacen nulas a propósito
--
-- Las cuentas anteriores a hoy no aceptaron nada, y ponerles una fecha
-- inventada sería peor que no tener el dato: convertiría el registro en algo en
-- lo que no se puede confiar. `null` dice la verdad —«no consta»— y deja la
-- puerta abierta a pedirles la aceptación dentro de la app si alguna vez hace
-- falta.

alter table public.user_settings
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text;

comment on column public.user_settings.terms_accepted_at is
  'Cuándo aceptó los términos, al crear la cuenta. Null en las cuentas anteriores a la 0043: no consta, y no se inventa.';

comment on column public.user_settings.terms_version is
  'Versión de los términos aceptada, tal como la publica terminos/index.html. La app la manda desde TERMS_VERSION en src/lib/config.ts.';

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  version_aceptada text := nullif(btrim(new.raw_user_meta_data ->> 'terms_version'), '');
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;

  -- La fecha la pone el servidor, no el cliente. Un `terms_accepted_at` que
  -- viniera del teléfono sería un dato que el propio interesado eligió, y como
  -- prueba no valdría nada. Lo único que se acepta de afuera es *qué* versión
  -- dice haber aceptado; el *cuándo* es de acá.
  insert into public.user_settings (user_id, terms_version, terms_accepted_at)
  values (
    new.id,
    version_aceptada,
    case when version_aceptada is not null then now() end
  )
  on conflict (user_id) do nothing;

  insert into public.notification_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
