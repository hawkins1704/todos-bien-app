-- ============================================================================
-- 0020 · Dos bugs que destapó un M6,7 en el mar de Scotia
--
-- El 2026-08-22 a las 08:22 UTC ocurrió un sismo cerca de la Antártida, a
-- 5.887 km de Lima. Le llegó **dos veces** al único usuario premium con avisos
-- mundiales, y sus dos contactos —que no recibieron ningún aviso— recibieron
-- en cambio "Renzo Arroyo no responde. No reportó cómo está desde el sismo",
-- también dos veces, por un sismo del que nunca supieron.
--
-- Son dos fallos independientes. El disparo del aviso en sí NO lo era: la
-- regla mundial de premium dice magnitud ≥ 6,0 y el sismo era 6,7.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1 · La deduplicación solo miraba entre fuentes distintas
--
-- `link_canonical_quake()` (0008) exigía `q.source <> new.source`, escrito
-- cuando el único duplicado imaginado era "el mismo sismo según el IGP y según
-- el USGS". Pero el USGS publica un mismo sismo bajo **varios ids propios**:
-- una solución automática de una red contribuyente y la revisada de su
-- catálogo nacional. Acá entraron como:
--
--   attk5wls    M6,7  08:22:40     -60,500  -47,200
--   us6000tmrw  M6,2  08:22:37,74  -60,379  -47,605
--
-- 2,3 segundos y 26 km de diferencia: el mismo temblor. Como ambos tenían
-- `source = 'usgs'`, la condición los dejó pasar como sismos distintos, cada
-- uno con su fan-out y su aviso.
--
-- La condición se elimina. Agrupar dos filas de la misma fuente que caen
-- dentro de 120 s y 250 km es igual de correcto que agruparlas entre fuentes
-- —y el comentario original ya decía cuál es el criterio: **"queremos una
-- alerta por sacudida, no una por catálogo"**.
-- ---------------------------------------------------------------------------
create or replace function private.link_canonical_quake()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  match_id uuid;
begin
  select coalesce(q.canonical_id, q.id) into match_id
  from public.quake_events q
  where q.id <> new.id
    -- SIN `q.source <> new.source`: el USGS se duplica a sí mismo bajo ids
    -- distintos, y ese caso es el que se escapaba (ver cabecera).
    and abs(extract(epoch from (q.occurred_at - new.occurred_at))) <= 120
    and public.distance_km(q.latitude, q.longitude, new.latitude, new.longitude) <= 250
  order by abs(extract(epoch from (q.occurred_at - new.occurred_at))) asc
  limit 1;

  new.canonical_id := match_id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 · «Contacto no responde» se mandaba a gente que no sabía del sismo
--
-- `notify_silent_contacts()` avisaba a **todo** el círculo de quien no había
-- reportado, sin comprobar que ese sismo también les aplicara a ellos.
--
-- Con un usuario premium con avisos mundiales, eso filtra: él recibe el aviso
-- de un sismo en la Antártida, no reporta —razonablemente, no le pasó nada— y
-- entonces sus contactos no premium reciben "no responde... desde el sismo",
-- sin haber recibido ningún aviso de sismo. El mensaje no tiene antecedente:
-- «el sismo» no existe para quien lo lee.
--
-- Y no es solo ruido. El aviso viaja por el canal `alerts`, el mismo del
-- aviso de sismo, que es justamente el que no puede acostumbrar a nadie a
-- ignorarlo.
--
-- Ahora se manda solo a quienes tienen una entrega para **ese mismo** sismo,
-- o sea a quienes la regla de disparo también alcanzó. Es la condición que
-- hace que la frase signifique algo para quien la lee.
-- ---------------------------------------------------------------------------
create or replace function private.notify_silent_contacts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  fila record;
  destinatarios uuid[];
  total integer := 0;
begin
  for fila in
    select distinct d.user_id as callado, d.quake_event_id
    from public.alert_deliveries d
    join public.quake_events q on q.id = d.quake_event_id
    left join public.user_status st
      on st.user_id = d.user_id and st.quake_event_id = d.quake_event_id
    where d.status = 'sent'
      and d.sent_at < now() - interval '20 minutes'
      and q.occurred_at > now() - interval '6 hours'
      and st.user_id is null
  loop
    -- El círculo, intersectado con quienes recibieron el aviso de ESTE sismo.
    -- No se filtra por `status`: lo que importa es que la regla les aplicara,
    -- no que su teléfono tuviera token.
    select coalesce(array_agg(d2.user_id), '{}'::uuid[])
    into destinatarios
    from public.alert_deliveries d2
    where d2.quake_event_id = fila.quake_event_id
      and d2.user_id = any (private.accepted_circle_of(fila.callado));

    total := total + private.enqueue_notifications(
      destinatarios,
      'contact_not_responding',
      private.display_name_of(fila.callado) || ' no responde',
      'No reportó cómo está desde el sismo. Quizá quieras escribirle.',
      jsonb_build_object('type', 'contact_not_responding', 'userId', fila.callado),
      'alerts',
      'not_responding:' || fila.quake_event_id::text || ':' || fila.callado::text
    );
  end loop;

  return total;
end;
$$;
