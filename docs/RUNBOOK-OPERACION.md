# Runbook: qué mirar cuando la app ya está en manos de gente

Escrito el **2026-08-24**, antes de tener usuarios, que es cuando conviene escribirlo.

**El modo de falla de esta app no se parece al de una app normal.** Una app rota se ve rota:
alguien abre, algo no carga, alguien se queja. Esta puede estar rota **sin que nadie lo note
hasta el próximo terremoto** — la ingesta caída, una credencial de push vencida o un cron
detenido no producen ni un error en pantalla. Solo producen silencio, que es exactamente lo
que se espera de una app de sismos un día tranquilo.

Por eso lo que sigue son consultas, no impresiones.

---

## 1 · El chequeo de 60 segundos

Cuatro consultas. Si las cuatro dan bien, la cadena completa está viva.

```sql
-- 1 · ¿Los crons están corriendo? Ninguno debería fallar.
select jobname, active from cron.job order by jobname;

select j.jobname, r.status, r.start_time
from cron.job_run_details r join cron.job j on j.jobid = r.jobid
where r.start_time > now() - interval '1 hour' and r.status <> 'succeeded'
order by r.start_time desc;

-- 2 · ¿Entran sismos? Con el cron cada 2 min, lo normal es tener algo de hoy.
select source, max(occurred_at) as ultimo, count(*) filter (where occurred_at > now() - interval '24 hours') as ultimas_24h
from public.quake_events group by source;

-- 3 · ¿Se está entregando el push? El veredicto real es el receipt, no el 'sent'.
select channel, status, count(*)
from public.push_receipts
where sent_at > now() - interval '7 days'
group by channel, status order by channel, status;

-- 4 · ¿Hay entregas atascadas? Deberían ser cero fuera de una ventana de alerta.
select status, count(*) from public.alert_deliveries group by status;
select status, count(*) from public.notification_deliveries group by status;

-- 5 · ¿Hay denuncias sin revisar? Prometimos 24 horas, así que esta es diaria.
select id, reason, created_at, now() - created_at as antiguedad
from public.content_reports where status = 'pending' order by created_at;
```

**Cómo se lee el punto 3, que es el que engaña:** `status = 'sent'` en la cola significa
«Expo aceptó el mensaje», no «llegó». El veredicto de Apple está en `push_receipts.status`, y
lo pide solo el barrido `check-receipts` cada 15 minutos (ESTADO §3.6). Un `error` repetido
con el mismo texto es una credencial, no mala suerte.

| Error del receipt | Qué significa | Qué hacer |
|---|---|---|
| `DeviceNotRegistered` | La app se desinstaló o revocó el permiso | Nada: el sender ya borra ese token solo |
| `TopicDisallowed` | La APNs Key cargada en EAS no está autorizada para este bundle | `eas credentials -p ios` → *Add a new push key*. **No hace falta rebuildear**: la clave vive en los servidores de Expo |
| `MessageRateExceeded` | Demasiados mensajes al mismo dispositivo | Solo aparece probando; en producción es señal de un bucle |
| Muchos `error` de golpe, todos iguales | Credencial o configuración, nunca el usuario | Ver ESTADO §3.4 |

---

## 2 · Los crons y qué pasa si uno se cae

| Job | Frecuencia | Si se detiene… |
|---|---|---|
| `ingest-quakes` | cada 2 min | **Lo más grave.** No entra ningún sismo, así que no hay alertas y la app se ve tranquila. Silencioso al 100 % |
| `fan-out-quakes` | cada minuto | Entra el sismo pero no se encola para nadie. La Home sí lo muestra al abrir, porque `get_active_alert()` no depende de la cola |
| `send-alerts` | cada minuto | Se encola y no sale. `alert_deliveries` se llena de `pending` — es la señal más visible de la lista |
| `send-notifications` | cada 5 min | No salen los avisos entre personas. El camino rápido no depende de él: un disparador despierta al cartero (ESTADO §1.13) |
| `notify-silent-contacts` | cada 5 min | Se pierde el aviso de «contacto sin responder» |
| `check-receipts` | cada 15 min | No se pierde ningún aviso: se pierde **saber** si llegaron. Es el que hace visible a todo el resto |
| `prune-*` | de madrugada | Nada urgente; las tablas crecen |

---

## 3 · «Hubo un sismo y alguien dice que no le llegó»

En orden, porque cada paso descarta el anterior y el orden ahorra el 90 % del tiempo:

```sql
-- 1 · ¿El sismo entró?
select id, canonical_id, source, magnitude, place, occurred_at, ingested_at,
       ingested_at - occurred_at as latencia_fuente
from public.quake_events order by occurred_at desc limit 5;
```
Si `latencia_fuente` es bastante más de ~8 minutos, el retraso es del IGP, no nuestro: de los
9 m 45 s medidos con el M7,2 de Coracora, **7 m 45 s fueron de la fuente** (ESTADO §1.13.4).

```sql
-- 2 · ¿La regla le aplicaba a esa persona? Se pregunta, no se supone.
select private.quake_applies(
  s.is_premium, s.alert_worldwide_enabled, s.country_code,
  s.alert_radius_km, s.alert_min_magnitude, s.alert_countrywide_magnitude,
  st.latitude, st.longitude,
  q.magnitude, q.country_code, q.latitude, q.longitude
) as le_aplica,
st.latitude is null as sin_ubicacion,
s.alert_radius_km, s.alert_min_magnitude
from public.user_settings s
left join public.user_status st on st.user_id = s.user_id
cross join (select * from public.quake_events where id = '<QUAKE_ID>') q
where s.user_id = '<USER_ID>';
```

> **`sin_ubicacion = true` explica el 90 % de estos reportes**, y no es un bug nuevo: es lo
> que destapó el M4,8 de Lurín (ESTADO §1.6.3.1). Sin coordenadas, la regla del radio ni se
> evalúa, así que solo llegan las alertas por magnitud nacional.

```sql
-- 3 · ¿Tiene token de push?
select platform, device_name, updated_at from public.push_tokens where user_id = '<USER_ID>';

-- 4 · ¿Se le encoló y qué pasó?
select d.status, d.attempts, d.created_at, d.sent_at, r.status as receipt, r.error
from public.alert_deliveries d
left join public.push_receipts r on r.delivery_id = d.id
where d.user_id = '<USER_ID>' order by d.created_at desc limit 10;
```

Si llegó al paso 4 con `receipt = 'ok'`, el aviso **se entregó** y el problema está en el
teléfono: notificaciones silenciadas, modo concentración, o la app desinstalada.

---

## 4 · «El aviso llegó pero la ubicación no se actualizó»

Es el caso que las migajas de la migración 0019 existen para contestar
(ESTADO §3.8.3):

```sql
select stage, detail, at from public.background_traces
where user_id = '<USER_ID>' order by at desc limit 20;
```

| Lo que se ve | Qué significa |
|---|---|
| Sin ninguna migaja | iOS **no levantó** la app. Es la limitación conocida, no un bug: la app fue cerrada a mano, o el teléfono se reinició y no se abrió desde entonces, o está en modo de bajo consumo (`QUE-PROMETE-LA-APP.md` §4) |
| `woke` y nada más | iOS **sí la levantó** y la tarea murió en el camino. **Eso sí es un bug nuestro** y hay que mirarlo |
| La cadena completa | Funcionó. Comparar `at` contra `push_receipts.sent_at` da la latencia real |

---

## 5 · «Compré Premium y sigo en plan gratuito»

```sql
select event_id, type, environment, outcome, affected_user_ids, received_at
from public.revenuecat_events order by received_at desc limit 10;
```

| `outcome` | Causa | Salida |
|---|---|---|
| No aparece el evento | El webhook no llegó | Revisar el header `Authorization` contra `select public.get_revenuecat_secret();`, sin `Bearer` |
| `unmapped` | El `app_user_id` no es el UUID de Supabase | Verificar que `Purchases.logIn()` corra (`syncPurchasesUser`) |
| Aplicado, pero la app dice gratuito | La app está mostrando su caché | Cerrar y abrir; `is_premium` lo escribe solo el webhook |

**El caso que no es un bug y parece uno:** quien **borró su cuenta** y creó otra pierde el
Premium, porque el derecho quedó atado al `app_user_id` viejo. Se recupera con «Restaurar
compras», que dispara un `TRANSFER` (ESTADO §1.1.3).

---

## 6 · Llegó una denuncia

Los términos prometen revisarla en **menos de 24 horas**, y ese compromiso es parte de lo que
se le declara a Apple (guía 1.2). La consulta 5 del chequeo diario es lo que lo sostiene.

```sql
select r.id, r.reason, r.detail, r.message_body, r.created_at,
       den.display_name as denunciante,
       acu.display_name as denunciado
from public.content_reports r
left join public.profiles den on den.id = r.reporter_id
left join public.profiles acu on acu.id = r.reported_user_id
where r.status = 'pending' order by r.created_at;
```

`message_body` es **una copia** guardada al momento de denunciar, así que sigue ahí aunque el
mensaje o la cuenta ya no existan. Es la evidencia; el `message_id` es solo la referencia.

Al resolverla:

```sql
update public.content_reports
   set status = '<reviewed|actioned|dismissed>', reviewed_at = now()
 where id = '<REPORT_ID>';
```

| Estado | Cuándo |
|---|---|
| `dismissed` | No incumple nada |
| `reviewed` | Incumple algo leve; queda anotado y se avisa |
| `actioned` | Se suspendió o eliminó la cuenta |

> ⚠️ **Esto se revisa a mano y esa es su debilidad.** No hay alerta: una denuncia cae en una
> tabla y espera a que alguien mire. Con volumen bajo alcanza con la consulta diaria, pero es
> exactamente la forma de fallo que este proyecto ya encontró tres veces —la pieza existe y
> nadie la lee—, así que **el día que llegue la primera denuncia real conviene automatizar el
> aviso**, aunque sea un correo.

---

## 7 · Lo que este runbook no puede cubrir todavía

- **Crashes del cliente.** No hay Sentry. Hoy, si la app crashea en el teléfono de alguien,
  es literalmente invisible: no hay dónde mirarlo. Es el hueco más grande de esta lista.
- **Alertas automáticas.** Todo lo de arriba hay que ir a mirarlo. Lo mínimo que valdría la
  pena automatizar, en orden: que `ingest-quakes` no haya escrito nada en 30 minutos, que un
  cron falle, y que la tasa de `error` en `push_receipts` pase de un umbral.
- **Carga.** El fan-out recorre `user_settings` entero por sismo. Con padrón chico no se
  nota; hay que medirlo antes de que sea grande (spec §16.2).
