-- 0053 · El hogar está pagado si **alguien** de la casa paga, no solo el dueño.
--
-- ## Por qué cambia
--
-- La 0048 lo ató al `is_premium` del dueño. Funcionaba mientras el candado no
-- tuviera botón de compra. Desde que el Centro bloqueado ofrece volver a Premium
-- —y se lo ofrece a **toda** la casa, que es a quien se le bloqueó— esa
-- definición vende algo que no funciona: la hija paga, y su Centro sigue cerrado
-- porque quien tenía que pagar era el papá. Una compra que no entrega lo que
-- muestra la pantalla no es un detalle de producto, es un reclamo en la tienda.
--
-- ## Qué NO cambia
--
-- **Sigue pagando una sola persona por casa.** La unidad que paga es el hogar;
-- lo único que se suelta es *quién* de la casa pone la tarjeta. De paso, el hogar
-- deja de depender de una sola cuenta: si el dueño se va o deja de pagar y otro
-- paga, la casa sigue andando.
--
-- Y no abre el modelo transitivo que `MONETIZACION.md` §2.1 descartó: **una
-- persona pertenece a un solo hogar**, así que la cadena se sigue cortando en un
-- salto. El Premium individual —Guardián, sismos mundiales, simulacros, planes—
-- sigue siendo de cada quien y no se contagia: esto gobierna únicamente las
-- tablas del Centro.

create or replace function private.household_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.user_settings s
     where s.is_premium
       and s.user_id in (
         select private.household_members(private.household_of(p_user))
       )
  );
$$;

comment on function private.household_premium(uuid) is
  'Si el hogar de esta persona está pagado. Basta con que UNO de la casa tenga '
  'Premium: la unidad que paga es el hogar, no una cuenta en particular. Sin '
  'hogar devuelve false, porque household_of() no encuentra ninguno y la lista '
  'de integrantes sale vacía. Es la única puerta de todo el Centro: la usan las '
  'políticas RLS de emergency_kits, kit_items, household_roles y tip_progress, y '
  'también get_household_preparedness().';
