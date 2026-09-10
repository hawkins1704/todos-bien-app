-- 0047 · El plan de acción también se modera.
--
-- ## El hueco, y la premisa falsa que lo abrió
--
-- La 0044 dejó `action_plans` fuera del filtro de contenido justificándose así,
-- textual (`0044:20-22`):
--
--   «eso action_plans NO está: el plan de acción es privado de su autor, nadie
--    más lo ve, y filtrarlo sería censurarle a alguien sus propias notas.»
--
-- **Es falso desde la 0024.** Su política de lectura dice lo contrario:
--
--   create policy action_plans_select_visible on public.action_plans
--     for select to authenticated
--     using ((select auth.uid()) = user_id or private.is_connected(user_id));
--
-- Lo lee **todo el círculo aceptado**, y además `get_circle()` lo empaqueta y lo
-- manda a la caché local de cada contacto (`0039:77-120`). La propia app se lo
-- dice al autor en el editor: *«Tus contactos ven este plan junto con tu última
-- ubicación cuando tocan tu foto»* (`action-plan-editor.tsx:88`).
--
-- Resultado: `action_plans` era **la única superficie de texto escrita por una
-- persona y leída por otras que no pasaba por el filtro**. Justo el criterio que
-- la 0044 dice usar para decidir qué se modera.
--
-- ## Por qué importa ahora y no dentro de un año
--
-- Dos motivos, y ninguno es teórico:
--
--   1. Las notas del revisor de Apple afirman que **todo** el contenido de
--      usuario se revisa en el servidor antes de guardarse. Esto llega justo
--      después de un rechazo por la guía 1.2, y es de las cosas que un revisor
--      encuentra tocando dos pantallas.
--   2. El Centro de Preparación va a colgar el **plan del hogar** de esta misma
--      tabla, así que el texto pasa a leerlo también la gente de tu casa.
--
-- ## Se moderan las DOS columnas
--
-- `body` es lo obvio. `name` va igual: son 40 caracteres que ve toda tu red, con
-- la misma exposición que `groups.name`, que la 0044 sí filtra. Un insulto entra
-- igual de bien en un título que en un cuerpo.
--
-- ## Lo que este archivo NO cambia
--
-- Ni la lista de términos, ni la función, ni el mensaje de rechazo. Solo cuelga
-- dos disparadores más de `private.rechazar_contenido_ofensivo`, que ya existe y
-- ya recibe el nombre de la columna por `TG_ARGV[0]`. La regla de fondo sigue
-- siendo la de la 0044: se apunta a la agresión dirigida, no a las groserías —
-- «se cayó la pared, mierda, hay un herido» tiene que poder escribirse.

drop trigger if exists action_plans_moderar_body on public.action_plans;
create trigger action_plans_moderar_body
  before insert or update of body on public.action_plans
  for each row execute function private.rechazar_contenido_ofensivo('body');

drop trigger if exists action_plans_moderar_name on public.action_plans;
create trigger action_plans_moderar_name
  before insert or update of name on public.action_plans
  for each row execute function private.rechazar_contenido_ofensivo('name');

comment on table public.action_plans is
  'Planes de acción con nombre. Gratis 1, Premium 5 (docs/MONETIZACION.md §3). '
  'El círculo aceptado los ve todos — por eso `name` y `body` pasan por el filtro '
  'de contenido desde la 0047, y NO son notas privadas.';
