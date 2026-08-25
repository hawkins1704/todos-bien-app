-- ===========================================================================
-- 0023 · Sacar los códigos de invitación del servidor
--
-- El 2026-08-24 se quitaron del cliente (app y web) porque no entran en el MVP.
-- El servidor quedó entero: la tabla, las dos RPC y —lo que importa— un
-- disparador vivo.
--
-- Es la forma dada vuelta del problema que este proyecto viene arrastrando:
-- normalmente sobrevive la mitad que se ve y falta la que la alimenta. Acá se
-- borró la que se ve y quedó funcionando la que no.
--
-- NO ES SOLO LIMPIEZA. `redeem_invitation` seguía expuesta en
-- `/rest/v1/rpc/redeem_invitation` para cualquier usuario autenticado, y
-- `link_pending_invitations` —un AFTER INSERT OR UPDATE OF phone_hash sobre
-- `user_settings`— crea la conexión **ya aceptada**:
--
--     insert into public.connections (..., status, responded_at)
--     values (..., 'accepted', now())
--
-- O sea que alguien que se registrara con un teléfono que coincidiera con una
-- invitación pendiente quedaba conectado **sin haber aceptado nada**, y con eso
-- expuesto a ver y ser visto: ubicación, estado y plan de acción. Al momento de
-- escribir esto quedaba una fila `pending` sin vencer (caducaba el 2026-09-19),
-- así que el agujero estaba abierto, no era teórico.
--
-- Todo lo demás sigue igual: la ÚNICA forma de conectarse es la solicitud
-- explícita que la otra persona acepta a mano (`request_connection`).
--
-- El orden importa: primero el disparador, después las funciones, y la tabla al
-- final. Al revés, `link_pending_invitations` queda apuntando a una tabla que
-- no existe y **cualquier alta que guarde el teléfono revienta**.
-- ===========================================================================

-- 1 · El disparador, que es lo único que todavía corría solo
drop trigger if exists user_settings_link_invitations on public.user_settings;
drop function if exists private.link_pending_invitations();

-- 2 · Las dos RPC expuestas, y el generador de códigos
drop function if exists public.redeem_invitation(invite_code text);
drop function if exists public.create_invitation(phone_hash text, label text);
drop function if exists private.generate_invite_code();

-- 3 · La tabla. `cascade` se lleva sus políticas RLS, índices y grants.
drop table if exists public.invitations cascade;
