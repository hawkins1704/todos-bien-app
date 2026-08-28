# Recorrido de verificación en un iPhone real

Escrito el **2026-08-24**. Se corre entero **una vez** antes del envío a revisión, y después
solo las secciones que toque cada cambio.

**Por qué existe.** El estado del proyecto acumuló cuatro deudas distintas que dicen lo
mismo: *«typecheck, lint y bundle en verde, sin verificar en pantalla»*. No son cuatro
problemas, es una sola tarea escrita cuatro veces, y cada una se volvió a anotar porque no
había dónde tacharla. Acá está el dónde.

**Qué no sirve para esto:**

- **El simulador.** El GPS es una posición fija inventada, no entrega tokens de APNs
  (`Device.isDevice` es `false`) y no ejecuta compras. Todo lo importante de esta app es
  justamente eso.
- **`expo start` / dev client para las tareas de fondo.** Necesitan Metro, y las tareas de
  fondo ahí son poco fiables de por sí (ESTADO, bitácora del 2026-08-21).

**Qué sí:** un build de TestFlight o `--profile preview` instalado en un iPhone físico.

---

## 0 · Montar el banco de pruebas

Casi todo lo de abajo necesita **dos teléfonos con dos cuentas conectadas**. Conviene dejar
una en cada plan y no ir cambiando: la mitad de los errores de este tipo aparecen al comparar
las dos pantallas lado a lado, no al mirar una sola.

**Cambiar de plan a mano:**

```sql
-- A Premium. Los DOS campos, siempre: el webhook de RevenueCat escribe los dos
-- juntos (revenuecat-webhook/index.ts), y tocar solo `is_premium` deja un
-- estado que en producción no existe — se prueba algo que nadie va a vivir.
update public.user_settings
   set is_premium = true, alert_worldwide_enabled = true
 where user_id = '<ID>';

-- De vuelta a gratis
update public.user_settings
   set is_premium = false, alert_worldwide_enabled = false
 where user_id = '<ID>';
```

> ⚠️ **Esto NO prueba la compra.** Saltea el paywall, la tienda y el webhook. Sirve para
> probar **qué hace la app según el plan**; que el plan se *active al pagar* es §8 y necesita
> sandbox de verdad.

**Sismo de prueba sin lastimar a nadie.** Un sismo sembrado se reparte **solo, al insertarlo**
(el disparador `quake_ingested_fan_out`), así que apunta a todos los que califiquen —
usuarios reales incluidos. Las tres reglas para que no se escape:

1. **Epicentro lejos de tus usuarios reales.** Si están en Lima, sembralo en Arequipa.
2. **Magnitud por debajo de 6,0.** En 6,0 se activan la regla nacional *y* la noticia mundial
   de Premium, y ahí ya no controlás a quién le llega.
3. **`country_code` en NULL**, que apaga la regla nacional del todo.

```sql
insert into public.quake_events
  (source, source_event_id, magnitude, latitude, longitude, place, country_code, occurred_at)
values ('igp', 'prueba-1', 5.5, -16.40, -71.54, 'Arequipa', null, now())
returning id;
```

> **Y si vas a sembrar varios:** separalos **más de 2 minutos** en `occurred_at` o más de
> 250 km. Si no, el deduplicador los fusiona en un solo evento y los sismos 2 en adelante no
> reparten nada — parece que la app está rota y lo que está mal es la prueba. `now()` dentro
> de un mismo bloque devuelve siempre la misma hora, así que hay que restar a mano:
> `now() - interval '30 minutes'`.

> 🔴 **No falsees coordenadas de un teléfono encendido: la app te las pisa.** Aprendido a los
> golpes el 2026-08-27. Se le puso a la cuenta B una posición en Arequipa, se sembró el sismo
> ahí, y a **un segundo** de recibir el push su app despertó, capturó su ubicación real (Lima)
> y sobrescribió la falsa. A partir de ahí `get_active_alert` hacía la cuenta correcta —sismo
> a 756 km, radio 150— y la Home decía «sin alertas activas». Parecía un bug de la app y era
> la **captura automática del §7.2 funcionando**.
>
> **La forma que sí funciona con dos teléfonos en la misma ciudad:** no tocar ninguna
> ubicación y **subirle el radio a la cuenta B** a 300 km —opción real del menú—, sembrando el
> sismo a ~265 km. Alcanza a B y a nadie más, las posiciones son verdaderas y la app de B
> muestra la alerta de verdad, que es lo que hace falta para probar el cierre (7b.5).

**Verificar a quién le llegó, antes de mirar el teléfono:**

```sql
select p.display_name, nd.kind, nd.title, nd.body
from public.notification_deliveries nd
join public.profiles p on p.id = nd.user_id
where nd.created_at > now() - interval '10 minutes'
order by nd.created_at desc;
```

---

## 1 · Acceso (5 pantallas nuevas desde el 2026-08-20, nunca recorridas a mano)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 1.1 | Crear cuenta con un correo nuevo | Llega el código de 8 dígitos y la cuenta queda creada |
| 1.2 | Crear cuenta con un correo **que ya tiene cuenta** | Mensaje claro, no un «listo» falso. Es el tercer resultado que Supabase no delata (ESTADO §1.1.1) |
| 1.3 | Cerrar sesión y entrar | Entra |
| 1.4 | Entrar con contraseña incorrecta | Error entendible, traducido por `code` |
| 1.5 | **Recuperar contraseña** | 🔴 Llega un **código**, no un link. Si llega un link, la plantilla *Reset Password* quedó con el `{{ .ConfirmationURL }}` de fábrica y la recuperación está rota sin dar error (`GUIA-CORREO-RESEND.md`) |
| 1.6 | Poner la contraseña nueva y entrar con ella | Entra, y la vieja ya no sirve |
| 1.7 | Cambiar la contraseña desde Mi cuenta | Pide la actual; con una incorrecta rechaza |

---

## 2 · Ubicación — el callejón sin salida (ESTADO §1.6.3.1)

El más importante de la lista: es el que dejó a un usuario real sin alerta en un sismo real.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 2.1 | Onboarding **negando** la ubicación | La Home muestra el recordatorio y Ajustes dice qué se pierde |
| 2.2 | Conceder el permiso desde los Ajustes del sistema y volver a la app | El estado se relee **solo**, sin reinstalar |
| 2.3 | Confirmar en la base | `select latitude, longitude from public.user_status where user_id = '<ID>'` deja de ser NULL |
| 2.4 | Los dos avisos | Desaparecen de la Home y de Ajustes |
| 2.5 | Con el permiso ya en «Siempre» | Ajustes muestra los tres permisos en verde |

> El punto que hay que tener presente al leer: **conceder el permiso no guarda ninguna
> coordenada.** La advertencia se dispara por falta de posición, no por falta de permiso. Es
> el error conceptual que generó el hueco original.

---

## 3 · Textos de permiso (nuevos el 2026-08-24)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 3.1 | Borrar la app, instalar y llegar a la pantalla de permisos | El diálogo del sistema dice «**una vez ahora, al dar el permiso**, y después solo cuando hay un sismo…» |
| 3.2 | Comparar con la pantalla de la app | Dicen lo mismo. Si no, uno de los dos miente y el que se declara en el Nutrition Label es el del sistema |

Se verifica sobre un build **posterior** al cambio: esos textos viajan en el `Info.plist`.

---

## 4 · Contactos y círculo (cambió el 2026-08-24 al quitar los códigos de invitación)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 4.1 | Revisar la agenda con una agenda **real**, de cientos de contactos | Encuentra coincidencias. Con 5 contactos de simulador esto no prueba nada: el bug de los lotes sobrevivió justamente por eso (ESTADO §1.6.6) |
| 4.2 | «Compartir Todos Bien» | Abre la hoja de compartir con un mensaje **sin código** y con `https://todosbien.app` |
| 4.3 | Enviar solicitud y aceptarla desde el otro teléfono | Quedan conectados, y le llega el aviso a quien la recibió |
| 4.4 | Negar el permiso de contactos | La tarjeta explica que igual pueden encontrarte a ti |
| 4.5 | Buscar la pantalla vieja de invitación | **No existe.** Ninguna ruta lleva a ella |

---

## 5 · Mapas (módulo nativo nuevo, nunca visto en pantalla)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 5.1 | Detalle de un sismo | El mini mapa dibuja, con encuadre de ~300 km |
| 5.2 | Detalle de un contacto con ubicación | Encuadre de ~3 km, el pin donde debe |
| 5.3 | Tocar el mapa | Abre **Apple Maps** con la etiqueta correcta, no una búsqueda ni el navegador |
| 5.4 | Cambiar el tema del sistema a oscuro | El mapa cambia también (`userInterfaceStyle`) |
| 5.5 | Desplazar la pantalla con el dedo sobre el mapa | La pantalla se desplaza; el mapa no se arrastra |

---

## 6 · «Mi ubicación» en modo alerta (ESTADO §1.2.3)

Necesita una alerta activa. Si no hay sismo, sirve un simulacro.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 6.1 | Con la alerta activa, mirar la Home | El círculo entra **completo** sin desplazar. La tarjeta de ubicación asoma **debajo** |
| 6.2 | Caminar unos metros y tocar «Actualizar mi ubicación» | El pin se mueve y `user_status` queda con las coordenadas nuevas |
| 6.3 | Mirar el estado reportado | **No cambia.** Actualizar dónde estás no es decir cómo estás |
| 6.4 | Sin permiso concedido | Ofrece ir a Ajustes; no falla en silencio |
| 6.5 | Fuera de una alerta | La tarjeta **no se monta**. Un botón de refrescar posición fuera de una alerta sería el seguimiento que prometemos no hacer |

---

## 7 · Push y captura en segundo plano

La parte que sostiene la promesa central. Se prueba con un sismo sembrado dirigido a **una
sola cuenta** (así se hizo el 2026-08-21, ESTADO §3.8.1).

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7.1 | Con la app en segundo plano, disparar el sismo de prueba | Llega el aviso visible |
| 7.2 | Sin tocar nada, esperar y mirar `user_status` | La ubicación se escribió sola. La firma que **solo** puede dejar la tarea de fondo es `status = 'unconfirmed'` sin jitter |
| 7.3 | Mirar `background_traces` | La cadena de migajas completa |
| 7.4 | **Con la app cerrada a mano** desde el multitarea | El aviso visible **llega igual**; la captura automática no ocurre. Es la limitación conocida, no un bug |
| 7.5 | Tocar el aviso | Se abre la app, captura la ubicación, y el sistema le devuelve el permiso de despertarse sola |
| 7.6 | Con la app **terminada por el sistema** | 🟡 No se puede forzar. Lo contesta el próximo sismo real leyendo las migajas (ESTADO §3.8.2) |

---

## 8 · Compras

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 8.1 | Con una cuenta de sandbox, abrir el paywall | Se ve la Offering, no un paywall vacío |
| 8.2 | Comprar | La pantalla pasa a Premium sola en segundos: es el webhook |
| 8.3 | Mirar el pie del paywall | 🔴 Están **Términos y Privacidad**. Sin eso el rechazo es casi automático |
| 8.4 | «Restaurar compras» | Recupera el derecho |
| 8.5 | Con Premium activo, la pestaña Global de Sismos | Se ve. Sin Premium, ofuscada con candado |

---

## 7.b · Guardián y país detectado (nuevo el 2026-08-25)

Guardián es lo único que sostiene el precio de Premium (`MONETIZACION.md` §3), así que si
algo de acá falla, no hay nada que vender.

**Necesita dos cuentas y un sismo sembrado.** El truco para no viajar a Madrid: sembrar el
sismo lejos de **tu** posición y cerca de la del contacto, editándole las coordenadas a mano.

> ✅ **7b.4 y 7b.5 verificados el 2026-08-27** con dos teléfonos (iPhone premium + Android
> gratis). Apertura enviada a los 0,7 s del insert; cierre enviado al reportar. La corrida
> destapó además los tres huecos de abajo, todos ya cerrados.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7b.1 | Instalación nueva, conceder ubicación, y mirar `select country_code from user_settings where user_id = '<ID>'` | Dice el país **real**. Hasta el 2026-08-25 todos decían `PE` sin excepción, porque nadie lo escribía nunca |
| 7b.2 | Repetir con el teléfono en **modo avión** al conceder el permiso | Queda en `PE` y **no** se marca como resuelto: el geocodificador necesita red. Al volver la señal y refrescar la app, se corrige solo |
| 7b.3 | Ponerle `is_premium = true` a la cuenta A, y a la cuenta B una ubicación en Lima | — |
| 7b.4 | Sembrar un sismo M6,5 **a 20 km de B** y lejos de A | 🔴 A recibe **«Tembló cerca de \<B\>»** con la distancia en el cuerpo. Es la función entera |
| 7b.5 | Desde B, marcar «estoy bien» | 🔴 A recibe **«\<B\> está bien»**. Sin este, Guardián solo fabrica ansiedad |
| 7b.6 | Tocar el aviso de 7b.4 | Abre la ficha de B, con su ubicación |
| 7b.7 | Quitarle Premium a A y repetir 7b.4 | A **no** recibe nada |
| 7b.8 | Con A premium, pero con la ubicación de B **borrada** (`latitude = null`) | A **no** recibe nada. Es la regla de honestidad: sin coordenadas no se sabe si le tocó cerca |
| 7b.9 | Con B a 900 km del epicentro, sismo M6,5 en su país | A **no** recibe nada, aunque B sí reciba su alerta nacional. «Cerca» tiene que ser cierto |
| 7b.10 | Con **A también dentro del radio** del sismo | A recibe su alerta normal y **no** el aviso de Guardián: ya está en modo emergencia y su círculo muestra lo mismo |
| 7b.11 | Con 3 contactos de A en la zona | Un **solo** aviso: «Tembló cerca de 3 de tus contactos», y al tocarlo abre el círculo |
| 7b.12 | Correr el reparto del mismo sismo dos veces | No se duplica (`dedupe_key`) |
| 7b.13 | Ajustes → GUARDIÁN, apagar el interruptor y repetir | No llega ninguno de los dos avisos |
| 7b.14 | Con A y B **bloqueados** entre sí (0021) | No llega nada: `accepted_circle_of` deja fuera a los bloqueados |

---

## 7.c · Lo que destapó la corrida de Guardián (2026-08-27)

Tres huecos que solo aparecen con dos teléfonos y un sismo real de por medio. Los tres están
arreglados; esto es para que no vuelvan.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 7c.1 | Con alerta activa, mirar el círculo de la cuenta **que sí recibió** el sismo | 🔴 Un contacto al que la alerta **no** le llegó sale **apagado**, no «sin confirmar». Y el contador dice `confirmados/los-de-la-zona`, no sobre el círculo entero. Antes marcaba como callado a cualquiera que viviera en otra ciudad — el perfil exacto al que se le vende Guardián (migración 0025) |
| 7c.2 | Sin alerta propia, con un contacto dentro de un sismo vivo | 🔴 Ese contacto sale **con su aro de estado** en la Home. Antes llegaba el push de Guardián, abrías la app y no había nada distinto que mirar |
| 7c.3 | Que ese contacto marque «necesito ayuda» y **después** «estoy bien» | 🔴 Llegan **los dos** avisos, y el segundo dice «**ya está bien**». La clave de dedup era una por sismo, así que el alivio posterior a una alarma se descartaba en silencio: te avisaba 4 veces que necesitaba ayuda y 0 que ya estaba bien (migración 0026) |
| 7c.4 | Que cambie de «estoy bien» a «ayudando» | **No** llega nada. Es el mismo grupo: repetirlo a las 3 AM es el ruido que hace que se apaguen las notificaciones |
| 7c.5 | Abrir la ficha de un contacto y, desde el otro teléfono, cambiarle el estado | Tirar de la ficha hacia abajo la actualiza. Antes leía la caché **una sola vez al montar** y se quedaba congelada aunque la app sincronizara por detrás |
| 7c.6 | Abrir la ficha de alguien cuyo último reporte es de hace días | **No** muestra estado ni ubicación: dice que la última es de hace N y que solo se guarda durante un sismo. Una coordenada de hace tres días es lo contrario de lo que promete la app |

---

## 8.b · Denunciar y bloquear (nuevo el 2026-08-24)

Es lo que mira App Review por la guía 1.2, así que conviene recorrerlo entero.

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 8b.1 | En el chat, mantener apretado un mensaje **de la otra persona** | Aparece el diálogo de denuncia |
| 8b.2 | Mantener apretado un mensaje **propio** | **No** pasa nada: denunciarse a uno mismo no significa nada |
| 8b.3 | Denunciar: elegir motivo y enviar | Confirma, y ofrece quitar del círculo en el mismo diálogo |
| 8b.4 | Elegir «Solo denunciar» | Vuelve al chat y la conexión sigue |
| 8b.5 | Denunciar el **mismo** mensaje otra vez | No falla ni se duplica en la base |
| 8b.6 | Contacto → «Denunciar a esta persona» | Igual, pero sin mensaje citado |
| 8b.7 | En la base | `select reason, message_body from content_reports order by created_at desc` — el texto denunciado está copiado |
| 8b.8 | Sin red | Muestra el error y no pierde lo escrito |
| 8b.9 | Elegir «Bloquear» al terminar la denuncia | Desaparece del círculo |
| 8b.10 | **Desde el otro teléfono**, escribir en ese chat | **Falla.** Es el agujero que cerró 0021: quitar el vínculo no cerraba la conversación que ya existía |
| 8b.11 | Desde el otro teléfono, volver a mandar solicitud | No se puede |
| 8b.12 | Ajustes → Personas bloqueadas | Aparece, con cuándo se bloqueó |
| 8b.13 | Desbloquear | Vuelve a «sin relación»: no se reconectan solos, hay que mandar solicitud de nuevo |
| 8b.14 | Contacto → «Quitar de mi círculo» (el camino amable) | Sigue funcionando como antes, y **sí** deja volver a agregarse |

---

## 9 · Borrar la cuenta

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9.1 | Ajustes → perfil → SEGURIDAD → Borrar mi cuenta | Existe y se llega en tres toques. Es la ruta que se le declara a Apple |
| 9.2 | Con la contraseña incorrecta | Rechaza, y **la cuenta sigue viva** |
| 9.3 | Con la correcta | Borra, cierra sesión y no se puede volver a entrar |
| 9.4 | La pantalla lo advierte | Dice que se pierde el Premium y que se recupera con «Restaurar compras» |

---

## 9.b · La matriz gratis vs Premium

Se corre con **las dos cuentas abiertas al mismo tiempo**, comparando pantalla contra
pantalla. Es el recorrido que decide si lo que cobramos coincide con lo que publicamos en
`QUE-PROMETE-LA-APP.md` §7 — y sobre todo si lo que **no** cobramos sigue intacto.

### La mitad que tiene que ser IDÉNTICA

Esta es la que importa más, y la que es fácil romper sin querer al agregar una función
Premium. Si algo de acá difiere entre las dos cuentas, **es un bug**, no una función.

| # | Con las dos cuentas | Tiene que pasar |
|---|---|---|
| 9b.1 | Sembrar un sismo que alcance a las dos | 🔴 Las dos reciben la alerta, **al mismo tiempo y con el mismo texto** |
| 9b.2 | Las dos pantallas en modo alerta | Iguales: los 4 estados, el círculo, el contador |
| 9b.3 | Captura automática de ubicación | Ocurre en las dos |
| 9b.4 | Que un contacto marque «necesito ayuda» | Las dos reciben el aviso |
| 9b.5 | Que un contacto se quede callado 20 min, **con el sismo alcanzando a las dos cuentas** | 🔴 Las dos reciben **«X no responde»**. Este es el corte que hace legítimo cobrar Guardián: entre quienes compartieron el sismo, la señal de que algo salió mal nunca se cobra |
| 9b.5b | Lo mismo, pero con **la cuenta observadora fuera** del alcance del sismo | **No recibe nada**, ni gratis ni premium, porque `notify_silent_contacts` solo escribe a quien tiene entrega de ESE sismo (0020). No es un bug: es lo que hace que Guardián sea el **único** canal para un sismo que no te tocó. Lo que sí sería un bug es prometer lo contrario en la landing — ver `QUE-PROMETE-LA-APP.md` §7 |
| 9b.6 | Chat, círculo ilimitado, plan de acción, tips | Iguales |
| 9b.7 | Noticias → pestaña **Perú** | Igual en las dos |

### La mitad que tiene que DIFERIR

| # | Dónde | Gratis | Premium |
|---|---|---|---|
| 9b.8 | Noticias → pestaña **Global** | Se ve, con candado; al tocar abre el paywall | Muestra el feed |
| 9b.9 | Ajustes → NOTICIAS → «Sismos en el mundo» | «Disponible con Premium», apagado y sin poder tocarlo | Se puede encender y apagar |
| 9b.10 | Ajustes → **GUARDIÁN** | «Disponible con Premium», apagado | Se puede encender y apagar |
| 9b.11 | Ajustes → PRÁCTICA | «0 de 3» | «0 de ilimitados» |
| 9b.11b | Ajustes → Planes de acción | 1 plan, sin botón de agregar | Hasta 5, con botón |
| 9b.12 | Cuarto simulacro | Bloqueado, con la oferta de Premium | Arranca |
| 9b.13 | Ajustes → tarjeta de perfil | «Plan gratuito» | «Premium» |
| 9b.14 | Mi cuenta | «Plan gratuito» | «Todos Bien Premium» |
| 9b.15 | **Guardián**: sismo cerca de un contacto, lejos de vos | No llega nada | «Tembló cerca de \<nombre\>» |
| 9b.16 | Ese contacto marca «estoy bien» | No llega nada | «\<nombre\> está bien» |

### El cambio de plan en vivo

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9b.17 | Con la app **abierta**, pasar la cuenta a Premium por SQL y refrescar | La pantalla se actualiza sin reinstalar |
| 9b.18 | La pestaña Global, recién comprada | Trae el feed. No se queda con la vista bloqueada cacheada |
| 9b.19 | Volver la cuenta a gratis y refrescar | Se vuelve a bloquear, sin dejar restos del feed global visibles |
| 9b.20 | Borrar la cuenta con Premium activo | Avisa que se pierde y que se recupera con «Restaurar compras» |

---

## 9.c · Planes de acción múltiples (nuevo el 2026-08-25)

| # | Paso | Qué tiene que pasar |
|---|---|---|
| 9c.1 | Cuenta **gratis** → Ajustes → Planes de acción | Se ve el plan que ya tenías, con el nombre «Mi plan» — el que puso la migración al traer la columna vieja |
| 9c.2 | Gratis, tocar «Agregar un plan» | **No aparece el botón.** En su lugar, la tarjeta que explica para qué sirven varios y ofrece Premium |
| 9c.3 | Editar el plan que ya existe, estando en gratis | Se puede. El tope es para **agregar**, no para editar |
| 9c.4 | Cuenta **Premium** → «Agregar un plan» | Pide nombre y texto, con las sugerencias («En el trabajo», «Con los chicos»…) |
| 9c.4b | Guardar y volver a la lista | 🔴 El plan nuevo **aparece de inmediato**, sin cerrar y reabrir la pantalla. Fue un bug real: la lista se cargaba una sola vez al montarse |
| 9c.4c | Volver a la Home después de escribir el **primero** | El aviso «Todavía no escribiste tu plan de acción» desaparece. Sale del espejo en el perfil, que hay que releer aparte |
| 9c.5 | Llegar a **5** planes | Al quinto desaparece el botón y dice que llegaste al máximo |
| 9c.6 | **Desde el otro teléfono**, abrir tu ficha | 🔴 Se ven **todos** tus planes, cada uno con su nombre, en el orden en que los creaste |
| 9c.7 | Con un solo plan | El nombre **no** se muestra: con uno solo es ruido |
| 9c.8 | Poner el teléfono en **modo avión** y abrir la ficha del contacto | 🔴 Los planes **siguen ahí**. Salen de la caché local, que es lo que se lee después de un sismo cuando no hay red |
| 9c.9 | Borrar un plan | Desaparece de tu lista y de la ficha del otro teléfono |
| 9c.10 | Borrar **todos** | La ficha del otro dice «Todavía no escribió su plan» |
| 9c.11 | Volver la cuenta a **gratis** teniendo 5 planes | 🔴 **Los 5 siguen visibles** para vos y para tu círculo. Solo desaparece el botón de agregar |
| 9c.12 | Una solicitud **pendiente**, sin aceptar | **No** ve ningún plan. Es más estricto que antes a propósito: quien no aceptaste no tiene por qué saber adónde vas |
| 9c.13 | Alta nueva: onboarding paso 4, escribir el plan | Queda guardado y aparece en la lista como «Mi plan» |
| 9c.14 | Alta nueva **saltando** el paso | La lista queda vacía, con el texto que invita a escribir uno |

---

## 10 · Antes de dar por cerrado el recorrido

- [ ] Se corrió sobre un build de TestFlight, no en el simulador ni con Metro
- [ ] La agenda usada era real, no de simulador
- [ ] Lo que falló quedó anotado en `ESTADO-DEL-PROYECTO.md` → Deudas conocidas
- [ ] Las deudas que se verificaron se **tacharon** ahí. Una deuda verificada que sigue
      escrita como pendiente hace perder el tiempo dos veces
