-- 0027 · El reporte de un contacto también avisa a quien está DENTRO del mismo sismo.
--
-- El hueco, encontrado en el recorrido del 2026-08-28 con dos teléfonos:
-- `on_status_safe` elegía destinatarios leyendo quién había recibido el aviso de
-- APERTURA de Guardián (`dedupe_key = 'guardian:<sismo>'`). Y `notify_guardians`
-- excluye a propósito a quien el sismo también alcanzó (está en modo emergencia,
-- su círculo ya se lo muestra). El encadenamiento de las dos reglas producía
-- esto:
--
--   Alguien en Madrid, con Premium ......... recibe «Paolo está bien»
--   Vos, en el MISMO terremoto que Paolo ... no recibís nada, nunca
--
-- O sea: adentro de tu propio sismo la app solo te mandaba malas noticias
-- —«necesita ayuda» es gratis e incondicional— y jamás las buenas. Al revés de
-- lo que la persona necesita.
--
-- POR QUÉ EL ARREGLO ES GRATIS Y NO DE PREMIUM. Es la regla de `MONETIZACION.md`
-- §3, la misma que se corrigió en cuatro lugares públicos el 2026-08-27: cuando
-- el sismo te toca a ti, la app funciona completa sin pagar. Poner este aviso
-- detrás del muro volvería falsa la frase del paywall y de la landing, que es
-- justo el tipo de afirmación que revisa Apple. Guardián no pierde nada: sigue
-- siendo el único canal para el sismo que NO te tocó, que es lo que se vende.
--
-- Los dos caminos son mutuamente excluyentes por construcción: el de Guardián
-- exige haber recibido la apertura, que solo reciben los que NO están en zona;
-- el nuevo exige tener entrega de alerta, que solo tienen los que SÍ lo están.

-- ---------------------------------------------------------------------------
-- 1 · Preferencia propia, para que se pueda apagar.
-- ---------------------------------------------------------------------------
-- No se reutiliza `guardian_alerts`: ese interruptor dice «Guardián» en Ajustes
-- y está bloqueado para las cuentas gratis, así que colgar de él un aviso que
-- ahora es gratuito dejaría a esas cuentas recibiendo algo que no pueden apagar.
-- Un aviso que no se puede apagar es la razón número uno por la que alguien
-- apaga TODAS las notificaciones de una app.
alter table public.notification_preferences
  add column if not exists contact_reported boolean not null default true;

comment on column public.notification_preferences.contact_reported is
  'Avisos de que un contacto reportó su estado en un sismo que también me alcanzó a mí. Gratis: ver migración 0027.';

-- ---------------------------------------------------------------------------
-- 2 · La compuerta de preferencias tiene que conocer el tipo nuevo.
-- ---------------------------------------------------------------------------
-- Sin esta rama el `else true` lo dejaría pasar igual, pero ignorando la
-- preferencia: el interruptor existiría en Ajustes y no haría nada.
create or replace function private.enqueue_notifications(
  p_user_ids uuid[],
  p_kind text,
  p_title text,
  p_body text,
  p_data jsonb default '{}'::jsonb,
  p_channel text default 'social',
  p_dedupe_key text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  encolados integer;
begin
  if p_user_ids is null or array_length(p_user_ids, 1) is null then
    return 0;
  end if;

  insert into public.notification_deliveries (user_id, kind, title, body, data, channel, dedupe_key)
  select u.id, p_kind, p_title, p_body, p_data, p_channel, p_dedupe_key
  from unnest(p_user_ids) as u(id)
  left join public.notification_preferences n on n.user_id = u.id
  where case p_kind
          when 'connection_request'     then coalesce(n.connection_request, true)
          when 'connection_accepted'    then coalesce(n.connection_accepted, true)
          when 'contact_needs_help'     then coalesce(n.contact_needs_help, true)
          when 'contact_message'        then coalesce(n.contact_message, true)
          when 'contact_not_responding' then coalesce(n.contact_not_responding, true)
          when 'quake_national'         then coalesce(n.quake_national, true)
          when 'quake_worldwide'        then coalesce(n.quake_worldwide, true)
          when 'contact_in_quake_zone'  then coalesce(n.guardian_alerts, true)
          when 'contact_is_safe'        then coalesce(n.guardian_alerts, true)
          when 'contact_reported'       then coalesce(n.contact_reported, true)
          else true
        end
  on conflict do nothing;

  get diagnostics encolados = row_count;
  return encolados;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3 · El disparador, con las dos audiencias.
-- ---------------------------------------------------------------------------
create or replace function private.on_status_safe()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nombre text := private.display_name_of(new.user_id);
  circulo uuid[];
  guardianes uuid[];
  en_zona uuid[];
  titulo text;
  cuerpo text;
  estado_previo text;
  venia_de_alarma boolean;
  clave text;
begin
  if new.quake_event_id is null or new.is_drill then
    return new;
  end if;

  estado_previo := case when tg_op = 'UPDATE' then old.status else null end;

  -- Moverse DENTRO del grupo «está bien» (de safe a helping, o viceversa) no es
  -- noticia: repetirlo a las 3 AM es el ruido que hace que alguien apague las
  -- notificaciones para siempre. Se avisa al ENTRAR al grupo, no al moverse
  -- adentro (migración 0026).
  if tg_op = 'UPDATE'
     and estado_previo in ('safe', 'helping')
     and old.quake_event_id is not distinct from new.quake_event_id then
    return new;
  end if;

  circulo := private.accepted_circle_of(new.user_id);
  if array_length(circulo, 1) is null then
    return new;
  end if;

  venia_de_alarma := estado_previo = 'needs_help';

  if venia_de_alarma then
    titulo := nombre || ' ya está bien';
    cuerpo := case new.status
      when 'helping' then 'Cambió su estado: ya no necesita ayuda y está ayudando a otros.'
      else 'Cambió su estado: ya no necesita ayuda.'
    end;
  else
    titulo := nombre || ' está bien';
    cuerpo := case new.status
      when 'helping' then 'Reportó que está bien y está ayudando a otros.'
      else 'Reportó que está bien.'
    end;
  end if;

  -- La clave lleva el instante del reporte para que el alivio posterior a una
  -- alarma no se descarte como repetido del aviso de apertura (migración 0026).
  clave := new.quake_event_id::text || ':' || new.user_id::text || ':'
           || extract(epoch from coalesce(new.reported_at, new.updated_at))::bigint::text;

  -- (a) GUARDIÁN — Premium, y solo a quien recibió la apertura. Es el cierre de
  --     un hilo que empezó con «tembló cerca de <nombre>»: sin apertura no hay
  --     cierre, porque sería un aviso sobre un sismo del que nunca se enteró.
  select coalesce(array_agg(nd.user_id), '{}'::uuid[])
  into guardianes
  from public.notification_deliveries nd
  join public.user_settings s on s.user_id = nd.user_id
  where nd.dedupe_key = 'guardian:' || new.quake_event_id::text
    and s.is_premium
    and nd.user_id = any (circulo);

  perform private.enqueue_notifications(
    guardianes, 'contact_is_safe', titulo, cuerpo,
    jsonb_build_object('type', 'contact_is_safe', 'userId', new.user_id),
    'alerts', 'guardian_safe:' || clave
  );

  -- (b) EN ZONA — gratis y sin condición de plan: a quien el MISMO sismo también
  --     alcanzó. Es el caso que faltaba entero.
  select coalesce(array_agg(d.user_id), '{}'::uuid[])
  into en_zona
  from public.alert_deliveries d
  where d.quake_event_id = new.quake_event_id
    and d.user_id = any (circulo);

  perform private.enqueue_notifications(
    en_zona, 'contact_reported', titulo, cuerpo,
    jsonb_build_object('type', 'contact_is_safe', 'userId', new.user_id),
    'alerts', 'en_zona_safe:' || clave
  );

  return new;
end;
$$;
