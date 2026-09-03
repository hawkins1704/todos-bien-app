# Qué falta

Índice **único** de trabajo pendiente. Si algo está por hacerse, está acá; el resto de los
documentos explican *cómo* y *por qué*, no *qué queda*.

- `ESTADO-DEL-PROYECTO.md` — qué existe y por qué se decidió así. Más las **deudas
  conocidas**, que son problemas de lo ya construido, no trabajo nuevo.
- `QUE-PROMETE-LA-APP.md` — **fuente única de las afirmaciones públicas**: qué se puede
  prometer, qué no, y con qué palabras. La landing, la ficha de tienda y los textos de la app
  salen de ahí.
- `MONETIZACION.md` — **qué se cobra y por qué**: el corte gratis/Premium, los precios, los
  mercados y lo que se decidió NO hacer (anuncios, Premium compartido).
- `ALCANCE-Y-IDIOMAS.md` — en qué países se publica, en qué idiomas, y qué falta para cada uno.
  ⚠️ Revisado por `MONETIZACION.md` §6: **v1 sale solo en español**.
- `FICHA-APP-STORE.md` — el texto de la ficha, contado y listo para pegar.
- `PRIVACIDAD-APP-STORE.md` — la hoja de respuestas de los Nutrition Labels, dato por dato.
- `REVISION-APPLE.md` — cuenta de demostración, notas para el revisor y los rechazos probables.
- `VERIFICACION-EN-DISPOSITIVO.md` — el recorrido en un iPhone real que cierra las deudas de
  «sin verificar en pantalla».
- `RUNBOOK-OPERACION.md` — qué mirar cuando ya hay usuarios, con las consultas hechas.
- `ICONO-Y-MARCA.md` — qué exportar de Figma, con qué medidas, y dónde va cada archivo.
- `GUIA-SUSCRIPCIONES.md` — **el contenido para copiar y pegar** en App Store Connect y
  RevenueCat: localización de los tres planes, países, y el paywall entero.
- `GUIA-DESPLIEGUE.md` — el procedimiento paso a paso de tiendas y credenciales.
- `GUIA-CORREO-RESEND.md` — configuración de correo y plantillas.

Última revisión: **2026-09-02**.

> **2026-09-02 · Se cerró el código para el build 3.** Ya no queda ninguna deuda de cliente
> abierta: 1.13 y 1.15 se cerraron hoy, 1.11 también (es de servidor), y **1.4 resultó estar
> hecha desde el 20 de agosto** — la fila llevaba dos semanas pidiendo algo que ya existía.
>
> **Lo que este build TIENE que probar en el teléfono**, porque es lo único que separa al
> proyecto de un envío: el recorrido de `VERIFICACION-EN-DISPOSITIVO.md`, y dentro de él la
> prueba que no se puede saltear — **simulacro activo + sismo real sembrado**.
>
> Quedan fuera del build **a propósito**, con el porqué en su fila: **1.12** (no se arregla
> cambiando la sal; hace falta un *pepper* en el servidor, y toca el único camino de conexión
> que tiene la app), **1.6** (Sentry es una dependencia nativa nueva y solo paga después de
> publicar), **1.2** (es SQL, no necesita build, y hacerla bien exige no duplicar las 429 líneas
> de `geo.ts` en Postgres) y **1.7** (necesita padrón).
>
> 🔴 **La app no arrancó, y el arranque no estaba en ninguna lista de pruebas.** Al instalar el
> build, iOS se quedó en el splash con `duplicate column name: receives_notifications`. El
> teléfono estaba en un estado imposible según el código: la columna de la v6 puesta **y**
> `user_version` en 5, así que reintentaba el `ALTER` en cada arranque. `src/lib/db/index.ts`
> hacía el `ALTER` y el `PRAGMA user_version` como **dos sentencias sueltas**, y hay dos formas
> de quedarse en el medio: dos contextos de JavaScript migrando a la vez —la tarea de fondo del
> push tiene su propio módulo y su propio `dbPromise` sobre el mismo archivo— o el proceso
> muriendo entre las dos. Ahora van en `withExclusiveTransactionAsync`, que es lo que la
> documentación de expo-sqlite v57 recomienda **para migraciones**, y las columnas se agregan de
> forma idempotente porque hay teléfonos ya en ese estado y para esos la atomicidad llega tarde.
>
> **Pero lo que convirtió el tropiezo en una app muerta fue otra línea:** `dbPromise ??= open()`
> guardaba la promesa **rechazada**, y `??=` no reemplaza lo que no es null. Cada `getDb()`
> posterior devolvía el mismo rechazo, para siempre, sin más salida que reinstalar. Un fallo
> recuperable —la base bloqueada por la tarea de fondo, el disco lleno— se volvía permanente.
>
> Y el detalle de método: **este fallo no lo habría encontrado el recorrido**, porque el
> recorrido empieza en la pantalla 1 y da por sentado que la app abre. Todas sus secciones
> asumen una app viva. `VERIFICACION` §10 tiene ahora un paso 0.
>
> **La otra lección de la tanda es sobre las herramientas.** La barrida que buscaba
> `try/finally` sin `catch` comparaba `catch` contra `finally`, y así un archivo con un
> `try/catch` interno más un `try/finally` externo daba «equilibrado». Se corrió tres veces
> desde el 28 de agosto y las tres dijo que quedaba **uno**; quedaban dos.
> **Una herramienta de auditoría también necesita que la auditen.**

> **Lo que quedó en pie del 31 de agosto y el 1 de septiembre**, después de que la 0034
> reescribiera la mitad:
>
> 1. **«Círculo» ya no significa nada en el producto.** **Mi red** es el conjunto de tus
>    contactos, y dentro hay **grupos** (Casa, Familia, Trabajo) — compartidos, con chat, de
>    quien los crea. Los identificadores de código sí se renombraron esta vez (`groups`,
>    `group_members`), porque `circle_groups` había dejado de describir el objeto.
>    ⚠️ **Falta la landing y la ficha de tienda**, que están fuera de este repositorio.
> 2. **Guardián se redujo** (migración **0030**). Ver `MONETIZACION.md` §3.3.
> 3. **Grupos** (migraciones **0031** y **0034**): 2 gratis, ilimitados con Premium, con
>    desglose por grupo en la Home durante una alerta.
> 4. **Chats** (migraciones **0032** y **0034**): pestañas Individuales/Grupales, «eliminar
>    chat» que borra de verdad, y las grupales colgando de sus grupos.
>
> **El hallazgo que conviene no olvidar** salió al implementar «eliminar un chat»:
> `get_or_create_direct_conversation` devuelve la conversación existente **sin volver a
> insertar los miembros**. Borrar tu fila de `conversation_members` en un chat directo te
> dejaría sin avisos de esa persona **para siempre y sin forma de volver**. La 0032 lo prohíbe
> en la base. Es de la clase de fallo que no se ve leyendo el código: cada pieza por separado
> se comporta bien.

> **Lo que cambió entre el 2026-08-26 y el 2026-08-28.** Se corrió el recorrido del teléfono
> casi entero, en dos sesiones y con dos dispositivos, y salieron **quince bugs**
> (migraciones **0025** a **0029**). Se rehízo la grilla de la red y la Home en modo alerta,
> se corrigió una **afirmación falsa publicada en cuatro lugares**, y en la consola se cerró el
> pie del paywall, los precios y la copia de Premium.
>
> **Los tres que conviene no olvidar**, porque son de clases que se repiten:
>
> 1. **El bloqueo posponía el mensaje en vez de descartarlo.** El outbox reintentaba los
>    rechazos de RLS, así que al levantar el bloqueo el mensaje entraba. No se ve leyendo
>    código: cada pieza por separado se comporta bien.
> 2. **Tres `try/finally` sin `catch`**, en tres pantallas distintas. Cada uno daba dos
>    síntomas que parecían no tener relación, porque el error escapaba **y** se llevaba puesto
>    el refresco que venía después.
> 3. **El teclado en Android**, roto en las nueve pantallas con campos de texto por
>    edge-to-edge. Se resolvió **midiendo en un dispositivo**, después de que dos hipótesis
>    razonadas fallaran.
>
> **El corte gratis/Premium se movió el 28**, y hacia el lado gratis: dentro de tu propio
> sismo, el «X está bien» de un contacto ahora llega sin pagar (0027). Está reflejado en
> `QUE-PROMETE-LA-APP.md` §7, `MONETIZACION.md` §3 y la landing. **El paywall de RevenueCat no
> hace falta tocarlo**: su texto enumera lo que es gratis y sigue siendo cierto — ahora, de
> hecho, se queda corto a favor nuestro.
>
> **Ya no queda ni código ni redacción para enviar.** Lo que separa al proyecto de un envío
> es: subir el sitio, correr el resto del recorrido del teléfono, y pegar cuatro cosas en App
> Store Connect.

---

## Dónde está parado el proyecto

| Bloque | Estado |
|---|---|
| Backend, RLS, ingesta de sismos, fan-out | ✅ |
| Cliente completo (acceso, onboarding, red, chat, simulacro, noticias) | ✅ |
| **Push de punta a punta en iOS** | ✅ verificado con datos reales |
| **Guardián** | ✅ **verificado en dos teléfonos** el 27 y el 28: apertura, cierre, 7b.10 y §9.b. Faltan los casos negativos (7b.7–7b.9, 7b.11–7b.14) |
| **Premium / RevenueCat en iOS** | ✅ compra, restauración y transferencia probadas |
| **Productos, precios y paywall en las tiendas** | ✅ **cerrado el 2026-08-28**: precios nuevos, copia centrada en Guardián, y Términos + Privacidad en el pie |
| Denunciar y bloquear | ✅ migraciones 0020-0021, con pantalla propia. Falta verlo en el teléfono (§8.b) |
| Textos de la ficha, privacidad y notas de revisión | ✅ escritos |
| **Cuenta de demostración** | ✅ **red repuesto el 2026-08-28** (4 contactos, chat, plan). Ver `REVISION-APPLE.md` §1 |
| **Ícono, splash y textos de permiso** | ✅ en el binario: `ios/` regenerado y el `Info.plist` de disco ya tiene los textos nuevos |
| Sitio, dominio y páginas legales | 🟡 desplegado y respondiendo 200, pero **la versión de agosto no subió todavía** |
| Ficha cargada en App Store Connect | 🟡 falta App Privacy, notas del revisor y capturas |
| Verificación en dispositivo | 🟢 **Corrido entero el 2026-09-02** sobre el build 3, con iPhone y Android: acceso, agenda real, mapas, chats, grupos, simulacro individual y grupal, el atajo de tres cuentas, teclado en Android, compras en sandbox, borrar cuenta, y el bloque de sismos sembrados completo (push, captura en segundo plano en **las dos plataformas**, refresco en vivo, matriz gratis/premium y desglose por grupo). **Quedan tres**, y las tres necesitan el build siguiente: `9f.16.bis` y `9f.17` —arreglados hoy, todavía sin compilar— y `0b.1`, que exige instalar **encima** de una versión anterior y por eso no se pudo probar sobre una instalación limpia. `7.6` no es una tarea: la contesta el próximo sismo real. *(La entrada anterior, del 2026-09-01, decía:)* 🟡 casi entero, con iPhone y Android. se recorrió una primera versión de §9.d y §9.e el 2026-09-01 y lo que fallaba está arreglado, **pero las dos secciones se reescribieron esa misma tarde con la 0034 y hay que correrlas de nuevo enteras** — sobre todo **9d.7–9d.15** (que el otro teléfono vea el grupo) y **9d.18–9d.24** (el atajo, que necesita **tres** cuentas). Falta además lo que exige el build nuevo (§3, §4, §7, §8), lo que exige instalación nueva (7b.1, 7b.2, 9c.13, 9c.14), **§8.c** —el teclado en las 8 pantallas que no son el chat— y **7.6**, que no se puede forzar |
| **Textos de «red», «círculo» y «grupo» fuera del repo** | ✅ **cerrado el 2026-09-03.** La landing quedó reescrita, y con ella los tres textos de tienda: la **descripción de App Store** (que además vendía el aviso retirado por la 0030 y no mencionaba los grupos), las **keywords** (`circulo` → `grupos`), las **capturas** (ahora ocho, con los grupos de tercera) y la **copia del paywall** de `GUIA-SUSCRIPCIONES.md` §4. Los **legales** también: términos §2, §5, §5.1 y §5.2 nuevo, privacidad §1, §3, §6, §7 y §9, y la página de eliminar cuenta. Detalle en el **Bloque 1** del orden sugerido |
| Build de producción enviado | 🟡 el flujo funciona (Xcode local + `eas submit`); falta el build **posterior a los arreglos del 27-28** |
| **Android** | ❌ sin empezar salvo Firebase |
| Mercados fuera de Perú | ❌ decidido que sí, no construido (`ALCANCE-Y-IDIOMAS.md`) |

---

## 1 · Código

**Nada de esto bloquea el envío.** Son mejoras de lo ya construido.

| # | Qué | Por qué importa |
|---|---|---|
| 1.2 | **Texto del aviso en español para sismos globales** | Hoy sale el `place` crudo del USGS: *"170 km NE of Lorengau"* dentro de una app en español. `src/lib/geo.ts` ya resuelve país y continente, pero vive en TypeScript y el texto se arma en SQL (`notify_quake_news`). Solo afecta a las alertas Premium, que es justamente lo que se cobra |
| 1.3 | 🟡 **Leer las migajas cuando ocurra un sismo real** | La prueba con la app en **segundo plano** pasó el 2026-08-21: se despertó sola y capturó la ubicación **1,2 s** después del aviso. El caso de app **terminada** sigue sin medirse y **no se puede forzar** (reiniciar el teléfono produce un estado más estricto que iOS bloquea). El próximo sismo real lo contesta solo: `select stage, at from background_traces order by at desc`. Sin migajas = iOS no la levantó; `woke` sin nada más = la levantó y murió, y eso sí sería un bug nuestro |
| ~~1.4~~ | ✅ **Cerrada, y la fila llevaba semanas mintiendo.** Se construyó el 2026-08-20 (`ESTADO` §1.2.3) y nadie la tachó acá | La tarjeta existe (`src/components/my-location-card.tsx`) y se monta **solo en la rama de alerta** (`src/app/(tabs)/index.tsx:379`). Que fuera de una alerta no exista **no es lo que falta, es la decisión**: un botón de refrescar posición sin sismo sería el seguimiento que la app promete no hacer. Lo único pendiente es **verla en pantalla** — §6 del recorrido, que nunca se corrió. Es exactamente lo que advierte el punto 4 de `VERIFICACION` §10: una deuda cerrada que sigue escrita como pendiente hace perder el tiempo dos veces |
| 1.5 | 🟡 **Declaración de permisos en Play Console** | Quedan tres que vienen de la plantilla de Expo y de `expo-file-system` —`SYSTEM_ALERT_WINDOW` y los dos de almacenamiento acotados a `maxSdkVersion=32`— que hay que saber justificar al publicar. La recomendación es dejarlos |
| 1.6 | Sentry para errores de cliente | Sin esto, un crash en el teléfono de un usuario es invisible |
| 1.7 | Pruebas de carga (spec §16.2) | El fan-out recorre `user_settings` entero por sismo. Con padrón grande hay que medirlo |
| 1.16 | 🟡 **El bloqueo no alcanza al grupo de un tercero** | Encontrado el 2026-09-03 al escribir los legales. `private.conversation_blocked` filtra por `cv.kind = 'direct'`, así que solo cierra el chat individual. **Lo que sí funciona, y conviene no confundirlo:** el disparador `connections_drop_group_membership` borra la pertenencia en las dos direcciones al pasar de `accepted` a `blocked`, así que el bloqueado sale de los grupos de quien lo bloqueó y viceversa — **comprobado en transacción revertida**. El hueco es **uno**: un grupo cuyo dueño es una **tercera** persona y donde ambos son integrantes; ninguna rama del disparador coincide y el bloqueado sigue escribiendo donde el otro lo lee. **No bloquea el envío** —la guía 1.2 pide poder denunciar y bloquear, y las dos existen; además el remedio de salir del grupo está a un toque— pero es un agujero de moderación real y está **declarado** en los términos §5.1, en la política §7 y en las notas del revisor. El arreglo natural es que `conversation_blocked` mire también los grupos, y hay que decidir **qué significa**: ¿se le esconden los mensajes al que bloqueó, se le prohíbe escribir al bloqueado, o se lo saca del grupo? Las tres son defendibles y solo la tercera es visible para el resto del grupo |
| ~~1.11~~ | ✅ **Cerrada el 2026-09-02 (migración 0041, aplicada).** `revoke insert, update, delete, truncate … from anon, authenticated` | Venían del `grant all` que Supabase aplica por defecto a las tablas nuevas de `public`, no de una decisión. **No arregla un fallo** —RLS ya bloqueaba las tres primeras y PostgREST no expone TRUNCATE— sino que quita el terreno preparado para el día que alguien agregue una política de escritura por error. Seguro porque los tres únicos caminos que tocan la tabla se verificaron antes: el cliente solo hace `.select()` (`api.ts:698`), la ingesta usa `service_role`, y el fan-out son funciones `security definer`. Sembrar sismos de prueba sigue funcionando: corre como `postgres` |
| 1.12 | **Fortaleza del hash de teléfono** | La sal está hardcodeada en `src/lib/phone.ts` (`todosbien.v1`). El espacio de números peruanos es chico: con la sal conocida, la tabla de `phone_hash` es reversible por fuerza bruta. No bloquea el MVP; sí hay que resolverlo antes de tener padrón grande. 🔴 **Revisado el 2026-09-02: NO se arregla cambiando la sal.** El propio comentario de `phone.ts:46-58` ya lo dice — la sal **no es un secreto**, viaja en el bundle, y una sal nueva es igual de extraíble; lo único que se ganaría es invalidar todos los hashes guardados a cambio de nada. **El arreglo real es un *pepper* en el servidor:** el cliente sigue mandando `v1 = sha256(sal:e164)` y el servidor guarda `v2 = hmac(pepper, v1)`, con el pepper fuera del alcance del teléfono. Lo elegante es que **el backfill se calcula desde lo ya guardado** —`v2 = hmac(pepper, v1)` con el `v1` que ya está en la tabla— sin necesidad de conocer ni un solo número. Deja de ser un ataque offline sobre un volcado y pasa a ser uno online contra un RPC, que se puede limitar por tasa. **Por qué no entró en el build 3:** toca el **único** camino de conexión que tiene la app —el match de agenda, desde que se quitaron los códigos de invitación— y eso no se mete el día de compilar |
| 1.14 | ✅ **Cerrada el 2026-09-01 (migración 0039).** Lo que sigue es el porqué, que conviene no perder. El aviso **no se hizo sonar** —eso reintroduce el ruido sin antecedente de la 0020 y además mentiría: quien nunca recibió la alerta no está callado, está incomunicado—. Se resolvió como **estado permanente**: `get_circle_push_reach()`, security definer con el mismo patrón que `get_circle_alert_scope`, expone un solo booleano y solo sobre tu red aceptada; `get_circle` lo trae como `receives_notifications` y viaja en la caché local (v6 del esquema). Se ve en la ficha del contacto con qué hacer al respecto, y como distintivo junto al nombre en la pestaña Red. ⚠️ Consecuencia a mirar antes de enviar: **los cuatro contactos de la cuenta demo salen marcados**, porque de verdad no tienen dispositivo (ver `REVISION-APPLE.md` §1). El texto original de la deuda: | Si alguien de tu red no tiene ningún dispositivo registrado, su entrega cierra como `no_token` y no como `sent` (`send-alerts/index.ts:186`). Y `notify_silent_contacts` solo mira a los callados con `status = 'sent'`, así que **nunca se dispara «X no responde» por esa persona** — ni gratis ni con Guardián. El silencio de la app coincide con el silencio de quien más te preocuparía. *(«X está bien» sí funciona: se dispara cuando ella reporta, y para reportar no hace falta recibir ningún push.)* **El arreglo NO es quitar el filtro de `sent`** — eso reintroduce el ruido sin antecedente que corrigió la 0020. Va como **estado permanente**, no como notificación: una línea en la ficha del contacto y un distintivo en la grilla de la red, con el texto *«No recibe notificaciones · Las notificaciones de Todos Bien no están llegando a su teléfono. No va a recibir el aviso de sismo.»* — redactado sobre el efecto y no sobre la causa, porque el servidor sabe que no hay a dónde mandar pero **no sabe por qué** (permiso denegado, teléfono nuevo, o reinstalación sin abrir la app). Implementación: `push_tokens` tiene RLS `_own` y no se toca; hace falta una función `security definer` que exponga solo ese booleano para la red aceptada, **mismo patrón que `get_circle_alert_scope` de la 0025**, que existe por este mismo problema con `alert_deliveries`. Cero notificaciones nuevas |
| ~~1.15~~ | ✅ **Cerrada el 2026-09-02 (migración 0040, aplicada y probada).** Que te metan en un grupo ahora te avisa | Los cuatro lugares de la 0028, más la aserción de la 0036 al final. **Dos decisiones que conviene no perder:** (1) **columna propia y NO colgada de `contact_message`**, que era la idea anotada acá — ese interruptor se llama «Mensajes · Un contacto te escribió por chat», y quien lo apaga quiere silenciar el chat, no dejar de saber en qué grupos está; compartirlos haría que el interruptor **mienta**, que es la clase de fallo que la 0036 acaba de arreglar. El vecino correcto es `connection_accepted`. (2) **Sin `dedupe_key`, a propósito**: si te sacan y te vuelven a sumar (paso 9d.13) el aviso tiene que salir de nuevo, y una clave por grupo lo silenciaría para siempre. El emisor es un **disparador sobre `group_members`** y no una función RPC, porque el cliente inserta directo en la tabla — igual que `group_members_sync_chat`, que vive ahí por lo mismo. El cuerpo del push **no promete ver el estado de los demás**: estar en un grupo no conecta a nadie, y decirlo sería falso justo para el caso que el atajo de la 0034 existe para resolver |
| ~~1.13~~ | ✅ **Cerrada el 2026-09-02**, y de paso se encontró **uno más que la barrida no podía ver**. Los dos bloques de `(onboarding)/permissions.tsx` ya tienen `catch`: releen el estado real del permiso antes de hablar, porque el fallo típico —`updateMySettings` necesita red— dejaba la tarjeta en «Sin conceder» con el permiso **concedido de verdad**. 🔴 **El octavo: `components/permissions-checklist.tsx`.** La barrida comparaba `catch` contra `finally`, y ese archivo tenía un `try/catch` interno (el del token) más un `try/finally` externo: 1 y 1, «equilibrado». **La barrida correcta compara `try` contra `catch`**, y con esa salieron seis candidatos de los cuales cuatro son falsos positivos verificados uno por uno —`withTimeout` deja salir el error a propósito, `endDrill()` ya no lanza, y `alert-response.ts` solo suelta un candado. Lo que se escapaba en el checklist: conceder la ubicación con mala señal lanzaba en `syncLocationPermission`, la fila se quedaba en ámbar y no se decía nada — en la pantalla que existe justamente para que alguien arregle sus permisos. Se repite con: `for f in $(grep -rl "} finally {" src/); do t=$(grep -c "^\s*try {" "$f"); c=$(grep -c "} catch" "$f"); [ "$t" -gt "$c" ] && echo "$f"; done`. ⚠️ **Esa barrida marca cuatro archivos para siempre y los cuatro están verificados como falsos positivos** — anotarlo acá es lo que evita investigarlos una quinta vez: `lib/location.ts` (`withTimeout` deja salir el error **a propósito**, para no confundir «tardó» con «el sistema dijo que no»), `(tabs)/settings.tsx` (`endDrill()` ya no lanza: devuelve si el servidor confirmó), `lib/alert-response.ts` (el `finally` solo suelta el candado `capturing`, y los dos llamadores capturan) y `lib/sync.ts` (el `finally` solo repone la bandera `flushing`; los errores por fila ya los trata el `catch` interno, y **los dos llamadores se cerraron el 2026-09-02** — en `chat/[id].tsx` el fallo dejaba el mensaje recién escrito sin aparecer en pantalla, porque se llevaba puesto el `setMessages` que venía después). El barrido del 2026-08-28 encontró **siete**; los dos del simulacro se cerraron el 2026-09-01 al reescribirlo. El de `context/drill.tsx` era el peor de la familia: salir del simulacro apagaba el modo local igual, así que un fallo de red **parecía haber funcionado** mientras los demás seguían practicando. Ahora `end()` no lanza, devuelve si el servidor confirmó, y Ajustes lo dice **solo cuando le pasa algo a otra persona** — un simulacro grupal tuyo que no se cerró. ⚠️ **`lib/alert-response.ts` aparece en el barrido y NO es un caso**: ese `finally` solo suelta el candado `capturing`, y los dos llamadores (`(tabs)/index.tsx` y `background-alert.ts`) capturan. Se repite con: `for f in $(grep -rl "} finally {" src/); do ...` comparando cuántos `catch` y cuántos `finally` tiene cada archivo |

**Corregido el 2026-09-02 — «X no responde» tenía una tercera forma de mentir, y la advertía su
propia migración (0042, aplicada y probada).** Con dos sismos sembrados y las apps abiertas
salieron dos avisos falsos y cruzados —«Paolo no responde» a Renzo y «Renzo no responde» a
Paolo— citando el sismo **anterior**, sobre dos personas que sí habían reportado.

La 0038 sacó del CTE el filtro de **tiempo** y dejó `d.status = 'sent'`, que hace lo mismo por
otra puerta: descarta el sismo nuevo mientras su push está en la cola. La ventana es el jitter de
`send_after` (hasta 30 s) más lo que falte para el minuto siguiente del cron de envío —hasta ~90
segundos—, y adentro de ella la app **ya está mostrando la alerta nueva** (`get_active_alert` no
mira el estado del envío) y la captura automática ya reescribió `user_status` apuntando a ella,
borrando la prueba de que se contestó la anterior.

**La lección es sobre las advertencias que uno mismo escribe.** La cabecera de la 0038 dice
textualmente: *«un sismo nuevo que todavía no cumple los 20 minutos queda fuera y el "más
reciente" vuelve a ser el viejo, que es exactamente el bug que esto arregla»*. Estaba escrita, era
correcta, y la corrección tapó solo la puerta que tenía delante. **Una condición que excluye al
sismo vigente lo rompe, sea de tiempo o de estado de envío.**

**Corregido el 2026-09-01 — «X no responde» tenía dos formas de mentir (migraciones 0037 y 0038,
aplicadas y verificadas con dos teléfonos y sismos sembrados).** Las dos salieron de la misma
corrida y las dos golpean la mitad de Guardián que sostiene el precio.

- **0037 · La captura automática de ubicación apagaba el aviso.** `notify_silent_contacts`
  buscaba a los callados como «quien no tiene fila de estado para ese sismo», pero
  `captureLocationForActiveAlert` escribe una fila `unconfirmed` **sin que la persona reporte
  nada**. O sea: *cuanto mejor funcionaba el teléfono de tu contacto, menos probable era que
  Guardián te avisara de su silencio.* Medido antes de tocar nada: sin fila 1 aviso, con la fila
  de la captura automática 0. La regla, ahora en un solo lugar: **`unconfirmed` no es un
  reporte** — no lo puede elegir nadie, el selector no lo ofrece.
- **0038 · Guardián se contradijo solo, y se vio en el teléfono.** A Renzo le llegó
  «Paolo está bien» (20:01) y ocho minutos después «Paolo no responde» (20:10), **sobre el mismo
  sismo**. Causa: `user_status` tiene **una fila por persona**, así que cuando llegó un segundo
  sismo la captura automática sobrescribió la fila y desapareció la prueba de que había
  contestado el primero. El cron seguía preguntando por el viejo. **La corrección es de sentido,
  no de SQL:** con una tabla de estado actual, «¿contestó?» solo se puede responder sobre la
  alerta vigente; de cada persona se mira su alerta más reciente y nada más. ⚠️ El orden importa
  — el «más reciente» se elige **antes** del filtro de los 20 minutos, o un sismo nuevo que aún
  no los cumple deja que el viejo vuelva a ganar, que es el bug mismo.

No lo introdujo la 0037: con la condición anterior el falso aviso salía igual. Lo que hizo la
0037 fue destaparlo en diez minutos.

**Corregido el 2026-09-01 — cinco interruptores de Ajustes no hacían nada (migración 0036,
aplicada y verificada).** Lo rompió la **0035 la noche anterior**: agregó las dos ramas del
simulacro a `enqueue_notifications` con un `create or replace` sobre un cuerpo viejo, y en el
mismo gesto **borró cinco ramas ajenas** — `quake_national`, `quake_worldwide`,
`contact_reported`, `contact_is_safe` y el ya muerto `contact_in_quake_zone`. Todo lo que perdía
su rama caía en el `else true`: se mandaba siempre. Apagar «Sismos en el país», «Sismos en el
mundo», «Alguien reportó que está bien» o **Guardián entero** no tenía ningún efecto.

No lo vivió nadie —desde anoche no se emitió ninguno de esos tipos— pero es el fallo que un
usuario no puede diagnosticar: apaga un aviso y el aviso llega igual.

**La lección es sobre la regla de los 4 lugares, no sobre el bug.** Esa regla existe para no
*olvidarse* de un lugar al agregar un tipo. Acá pasó lo contrario: los cuatro lugares se
hicieron bien, y el mismo gesto borró cuatro tipos ajenos. Un `create or replace` de una función
de despacho no agrega: reemplaza, y lo que no se vuelve a escribir desaparece sin ruido. Por eso
la 0036 convierte la regla en algo que falla solo —`private.assert_notification_kinds_mapped()`,
que compara el CHECK contra el cuerpo del despachador— y **toda migración que vuelva a tocar
`enqueue_notifications` tiene que llamarla al final**. Un documento se puede no leer; una
excepción, no.

**Cambiado el 2026-09-01 (noche) — el simulacro pasó a ser un MODO (migración 0035, aplicada y
verificada).** Antes vivía en una pantalla propia con una alerta de mentira: se practicaba en una
maqueta, así que lo que se aprendía era a usar la maqueta. Ahora enciende la app de verdad, con
una guía paso a paso sobre los controles reales, y **puede ser de un grupo**: el dueño lo convoca
y los teléfonos de los demás entran en modo solos.

Lo que conviene tener presente:

- **El sismo del simulacro es local**, jamás una fila en `quake_events` — sembrar una haría que
  el fan-out se la mandara a usuarios reales.
- **Un sismo real cierra el simulacro solo.** Es la única regla no negociable: el banner amarillo
  sobre una alerta de verdad es una ambigüedad que puede costar una vida.
- **El cupo de 3 cuenta lo que convocas** y se descuenta **al iniciar**. Participar es gratis e
  ilimitado. Ver `MONETIZACION.md` §3.2.2.
- **Caduca a los 60 minutos**, o un convocante sin batería dejaría a su familia encerrada.
- ✅ **Corrido en dos teléfonos el 2026-09-01.** Pasó casi entero; los fallos que aparecieron están
  arreglados y anotados en `VERIFICACION-EN-DISPOSITIVO.md` §9.f, marcados con 🔁 para volver a
  correrlos. Tres tenían la misma raíz: **la guía daba por sentado que la Home estaba delante y
  entera.** No lo está cuando el objetivo queda debajo del viewport (el mapa), ni cuando el
  simulacro lo convoca otro y el teléfono está en un chat. Ahora la guía desplaza la pantalla
  hasta el objetivo, lleva a la Home al empezar, y se esconde en cualquier otra vista en lugar de
  iluminar coordenadas que ya no significan nada.
- 🔴 **El bug caro del simulacro, encontrado por una insignia que decía «1 por enviar».** El id
  del sismo sintético viajaba a `report_status(quake_id uuid)` y Postgres lo rechazaba con
  `22P02`, así que **ningún reporte de estado de un simulacro llegó nunca al servidor** y en un
  simulacro grupal nadie veía a nadie ponerse en verde. Encima `22P02` no estaba en los rechazos
  definitivos del outbox: la fila se reintentaba para siempre. Dos arreglos, los dos en el cuello
  de botella y no en quien llama —**el mismo olvido ya había pasado en tres pantallas**—: se
  descarta el id sintético en `reportMyStatus`, y `22P02` se suma a los rechazos definitivos para
  limpiar las colas ya envenenadas. La lección, que es la misma de la 0034: si un dato no puede
  salir del teléfono, el filtro va donde sale, no en cada uno de los que lo mandan.
- ⏸️ **Falta en dispositivo:** la caducidad a los 60 minutos y **la prueba del sismo real**
  —simulacro activo + sismo sembrado que sí alcance a esa cuenta—, que es la que no se puede
  saltear antes del build.

**Cambiado el 2026-09-01 (tarde) — los círculos y las conversaciones grupales se fusionaron
(migración 0034, aplicada y verificada).** Eran dos objetos que todo el mundo llamaba «grupo», y
el síntoma fue que en una sola sesión hubo que renombrarlos tres veces buscando palabras que no
chocaran. **La lección vale más que el código: cuando hace falta inventar vocabulario para que
dos conceptos no se pisen, casi siempre es que debería haber uno.**

Ahora hay uno solo: **un grupo es gente + un chat**, se comparte con todos los que están adentro,
y es de quien lo creó. Tres pantallas desaparecieron (`new-group-chat`, `conversation/[id]`,
`rename-conversation/[id]`) y ninguna se reemplazó: se llega a todo desde el detalle del grupo.

Lo que hay que tener presente al leer cualquier otra cosa de este documento:

- **El tope pasó a 2 gratis / ilimitados con Premium**, y cuenta los grupos que **creas**. La
  objeción —«un grupo tiene chat, y el chat es gratis»— está discutida y aceptada en
  `MONETIZACION.md` §3.2; el gancho alternativo (simulacro grupal) queda anotado ahí.
- **Estar en un grupo NO conecta a nadie.** Es lo único que no se pudo compartir, y no se puede:
  hacerlo transitivo permitiría que alguien te metiera en un grupo y le diera tu ubicación a un
  desconocido. El grupo presenta; conectar sigue siendo de a dos, y la app ofrece el atajo.
- **`create_group_conversation` sigue viva a propósito.** La build en revisión de App Store la
  llama, y romperla desde el servidor haría fallar una app que Apple está mirando.

**Cerrado el 2026-09-01 — el primer recorrido de §9.d y §9.e en el teléfono.** Salió bien casi
entero. Lo que se arregló a partir de lo que encontró:

- ✅ **El botón que desaparecía al llegar al tope.** Pasaba en «Nuevo círculo» y en «Agregar un
  plan». Ahora el botón se queda y al tocarlo abre el paywall (`src/hooks/use-paywall.ts`). Un
  botón que se va no se lee como un límite, se lee como un bug. `ESTADO` §1.9.1.0.
- ✅ **«Sacar de mi lista» → «Eliminar chat», y ahora borra los mensajes.** Nadie sabe qué es
  «la lista». Y borrar el chat sin borrar el contenido no es lo que la palabra promete:
  `hidden_at` pasó de ser un «ocultar» a ser un **corte** que `syncMessages` respeta, así que
  lo anterior al borrado no se vuelve a bajar nunca. `ESTADO` §1.19.1.b.
- ✅ **El menú de una grupal abre «Ver información del grupo».** Ofrecía solo cambiar el
  nombre, y dejaba sin puerta a ver quiénes están, sumar gente y salir. Pantalla nueva
  `conversation/[id]` + migración **0033**. `ESTADO` §1.19.4.
- ✅ **Los relojes de carga que faltaban.** Meter o sacar a alguien de un círculo, los chips de
  círculo en la ficha de un contacto, «Quitar de mi red» y borrar un plan de acción: los cuatro
  escriben en el servidor y refrescan, y los cuatro se quedaban quietos mientras tanto.
- ✅ **Mi red no se actualizaba sola.** Quitar o aceptar a alguien obligaba a tirar de la lista
  a mano. Le faltaba el `useFocusEffect` que Chats, Noticias y la ficha de contacto ya tenían.

Lo que quedó **pendiente de probar**, sin culpa de nadie:

- ⏸️ **El desglose por grupo en la Home durante una alerta** (hoy es el paso **9d.23**). No
  hubo alerta activa durante el recorrido, y sigue sin probarse después de la 0034 — que además
  le cambió la cuenta: ahora solo suma a los integrantes que están en tu red.
- ⏸️ **9d.4 — el rechazo por nombre repetido.** El índice existe y está bien
  (`circle_groups_user_name_idx`, sobre `lower(btrim(name))`), pero la prueba no lo tocó: iOS
  capitaliza sola la primera letra, así que escribir «casa» guardó «Casa» y no chocó con nada.
  Para probarlo hay que borrar la mayúscula a mano.

**Cambiado el 2026-08-31 — Guardián se redujo (migración 0030, aplicada).** Se quitó
«Tembló cerca de María»: no se podía enunciar en una frase —dependía de una condición que el
usuario no puede ver— y quedó redundante desde que la noticia nacional llega a todos.
**Guardián es ahora una sola cosa:** enterarte de que tu gente reportó, o de que no reportó,
aunque a ti el sismo no te haya tocado. Como ya no hay aviso de apertura que dé contexto,
cada aviso hacia fuera de la zona **nombra el sismo**; esa regla no es opcional si algún día
se agrega un tercer aviso de esta familia. El porqué completo está en `MONETIZACION.md` §3.3.

**Cerrado el 2026-08-27:**

- ✅ **1.10 — Guardián visto en el teléfono.** Los dos avisos, apertura y cierre, con dos
  dispositivos reales. ⚠️ La apertura ya no existe (0030): lo verificado que sigue vigente es
  el cierre.
- ✅ **El `TabBarExtraInset` de Android.** Los 80dp salían de la documentación de Material 3
  sin medir, y estaban de más: Android reporta la barra dentro de `insets.bottom` igual que
  iOS. Reemplazado por `tabScreenBottomInset()`, que devuelve 0 en Android. Esto **cierra
  también el ítem 3.1.3** de la sección de Android.
- ✅ **La Home que mostraba «todo en calma» con alerta activa.** Era real y estaba en la
  lista de deudas sin reproducir: `effectiveStatus` marcaba «sin confirmar» a contactos que
  el sismo nunca alcanzó, y el contador se calculaba sobre la red entera. Migración 0025.
- ✅ **El alivio que no llegaba.** La clave de dedup era una por sismo, así que después de un
  «necesita ayuda» el «ya está bien» se descartaba en silencio. Migración 0026.

**Cerrado el 2026-08-25:** el país detectado de verdad (1.9) — `country_code` nacía con
`default 'PE'` y ninguna pantalla lo escribía nunca.

**Cerrado el 2026-08-24:** los **códigos de invitación**, que salieron del MVP enteros. Lo que
se descubrió al sacarlos y conviene no olvidar: el «auto-vínculo por teléfono» que se citaba
como red de seguridad **nunca funcionó**, porque los dos llamadores de `create_invitation`
pasaban `null` como `invitee_phone_hash`. La única vía de conexión es —y era— el match de
agenda.

---

## 2 · iOS — para mandar a revisión

**No queda nada de código.** Lo que sigue es sitio, teléfono y consola.

### 2.a · Lo que falta

| # | Qué | Dónde |
|---|---|---|
| 2.1 | 🔴 **Build de producción posterior al 2026-08-28** | Los arreglos del 27 y del 28 son **JavaScript**: si el build es anterior, los cuatro bugs de interfaz y la grilla nueva **no viajan**. Se compila local con Xcode y `eas submit` sube el `.ipa` |
| 2.1.b | 🔴 **Subir el número de build en LOS DOS lugares** | `autoIncrement` de `eas.json` **no aplica a builds locales**, y App Store Connect rechaza un número repetido para la misma versión. La trampa, encontrada el 2026-09-02: subir `ios.buildNumber` en `app.json` **no alcanza**. `ios/` está en el repo, y al compilar en Xcode el número que viaja es `CFBundleVersion` de `ios/TodosBien/Info.plist`, que `app.json` no toca. Los dos decían cosas distintas (3 y 2) y el `.ipa` habría salido como el 2 otra vez. **Se sincroniza a mano** —una línea— y no con `prebuild`: regenerar el proyecto nativo el día del envío es riesgo sin ganancia si no cambió nada nativo. `grep -A1 CFBundleVersion ios/TodosBien/Info.plist` lo dice en un segundo. 🔧 **Corrección del 2026-09-03:** esta fila decía que «`ios/` está en el repo» y no es así — `/ios` y `/android` están los dos en `.gitignore` (líneas 56-57). Existen en disco como artefactos de `prebuild`. El consejo no cambia, porque Xcode compila lo que hay en disco; lo que cambia es que un clone limpio **no** trae ese `Info.plist` y hay que prebuildear antes |
| 2.4 | **Nutrition Labels** | Respuestas listas, dato por dato, en `PRIVACIDAD-APP-STORE.md`. Falta pegarlas. 🟢 **Revisadas con los grupos el 2026-09-03**: los tres datos nuevos caen en categorías ya declaradas y **no agregan ninguna casilla**. Lo que cambió es la política publicada, no el formulario — y por eso la política tiene que subir primero (Bloque 1) |
| 2.5 | **Justificación de ubicación en segundo plano, en inglés** | Escrita en `PRIVACIDAD-APP-STORE.md` §4. Falta pegarla |
| 2.7.b | 🔴 **Notas para el revisor** | El texto está en `REVISION-APPLE.md` §2. ⚠️ **Tenía el correo equivocado** de la cuenta demo hasta el 2026-08-28; usar la versión corregida. 🔴 **Y dos afirmaciones falsas hasta el 2026-09-03**, las dos sobre la guía 1.2: decían que los chats son «strictly one-to-one» —el revisor ve un chat de grupo y deja de creerle a la nota entera— y que el bloqueado no puede escribir «not even in an existing conversation», sin acotarlo a los grupos. Corregidas, con un bloque **HOW TO REVIEW GROUPS** nuevo porque la cuenta demo tiene **cero grupos** y la ficha ahora los vende |
| 2.8 | **Capturas de pantalla** | Ahora son **ocho**, con qué tiene que verse en cada una, en `FICHA-APP-STORE.md` §5. La tercera es nueva (**grupos**, con el desglose «Casa 4/5» y el chat) y la de simulacro **tiene que mostrar la franja amarilla** — sin ella parece una alerta falsa, que es justo lo que los términos §4 prohíben |
| 2.12 | Revisión legal de términos y limitación de responsabilidad | spec §18. 🟢 **Los grupos entraron el 2026-09-03** —términos §5.2 y privacidad §1/§3/§6/§7/§9—, que era el hueco que impedía que la declaración de App Privacy coincidiera con lo publicado. Lo que sigue pendiente es la revisión por un abogado, no el contenido |
| 2.13 | **Disponibilidad territorial: Perú + América + Japón** | Guardián se le vende a la diáspora, así que restringirlo a Perú deja fuera al que paga. **España e Italia quedan afuera por ahora** — distribuir en la UE exige declarar *trader status* y Apple publica nombre, dirección y teléfono del desarrollador |
| 2.6.d | 🟡 **Small Business Program de Apple** | Baja la comisión del 30 % al 15 % con menos de un millón de dólares al año. Es un formulario y duplica el margen |
| 2.14 | 🟢 **Corrido entero el 2026-09-02** sobre el build 3 | Quedan **tres** confirmaciones sobre el build siguiente: `9f.16.bis`, `9f.17` (arreglados hoy, sin compilar) y `0b.1` (instalar encima de una versión anterior, imposible sobre una instalación limpia). Ninguna es trabajo nuevo: es mirar tres pantallas una vez que el build exista |

### 2.b · Lo que ya está cerrado

| # | Qué | Cuándo |
|---|---|---|
| 2.-1 | ✅ Ícono y splash propios, el de iOS sin canal alfa | 2026-08-24 |
| 2.0 | ✅ Textos de permiso del `Info.plist` corregidos, **y ya presentes en `ios/` de disco** | 2026-08-24 |
| 2.3 | ✅ URLs de la ficha: soporte, privacidad, términos, eliminar cuenta — las cuatro responden 200 | 2026-08-24 |
| 2.6 | ✅ **Términos y Privacidad en el pie del paywall.** Era el rechazo más probable que quedaba (guía 3.1.2) | 2026-08-28 |
| 2.6.b | ✅ **Precios nuevos en App Store Connect y RevenueCat**, y coinciden con la landing: **S/ 9,90 mes · S/ 59,90 año · S/ 79,90 de por vida** | 2026-08-28 |
| 2.6.c | ✅ **Copia del paywall** reescrita alrededor de Guardián | 2026-08-28 |
| 2.7 | ✅ **Cuenta de demostración** `todosbienapp@gmail.com`, con login probado contra la API real | 2026-08-24 |
| 2.7.c | ✅ **Red de la cuenta demo repuesto**: 4 contactos aceptados, chat de 4 mensajes, plan de acción, 0 de 3 simulacros, `is_premium = false` | 2026-08-28 |
| 2.9 | ✅ **`qa.simulador@example.com` borrado** | 2026-08-28 |
| 2.10 | ⏸️ **Leaked password protection** — no se puede en el plan free de Supabase. **No bloquea la revisión**: Apple no lo pide | — |
| 2.11 | ✅ En *Reset Password* llega un código, no un link — confirmado por el dueño | 2026-08-24 |

> **Sign in with Apple no hace falta.** Apple lo exige solo si la app ofrece login con
> otros proveedores externos. Hoy el acceso es correo y contraseña. **En el mismo momento**
> en que se agregue Google Sign In hay que agregar Sign in with Apple, o la revisión rechaza.

---

## 3 · Android — sin empezar

Lo único hecho: el proyecto de **Firebase** y `google-services.json` en la raíz del repo.

El orden importa, porque hay dos cuentas de Google distintas que se confunden fácil:
**Firebase** (push) y **Play Console** (tienda). Son proyectos separados aunque los dos
sean de Google.

### 3.1 Push

| # | Qué |
|---|---|
| 3.1.1 | **Service account de FCM a EAS**. Firebase → Configuración → Cuentas de servicio → Generar clave privada. Subirla con `eas credentials -p android`. ⚠️ Ese `.json` **es un secreto**: quien lo tenga puede notificar a todos tus usuarios. El `.gitignore` ya lo cubre |
| 3.1.2 | Build de desarrollo Android y verificar que aparece una fila en `push_tokens` con `platform = 'android'` |
| ~~3.1.3~~ | ~~Medir `TabBarExtraInset`~~ — ✅ **cerrado el 2026-08-27**: medido en un Android real, la barra ya viene dentro de `insets.bottom`. El valor correcto era 0 |

### 3.1.b Mapas

| # | Qué |
|---|---|
| 3.1.4 | ✅ **API key de Google Maps declarada** (2026-08-28), en el config plugin de `app.json`. Restringida a `com.renzoarroyo.todosbien` + el SHA-1 de depuración |
| 3.1.5 | ✅ **El mapa dibuja en Android**, verificado en dispositivo |
| 3.1.6 | 🔴 **Falta el SHA-1 de PRODUCCIÓN en esa misma key.** El que está es el de depuración: sirve para el dev client y **no** para la app publicada. Play App Signing lo genera al subir el primer build (*Test and release → App integrity → Play app signing*). Hay que **agregarlo a la key que ya existe**, no crear otra |

> ⚠️ **Sin el paso 3.1.6 el mapa funciona en tu teléfono y sale gris para todos los que
> instalen la app.** Es el tipo de fallo que solo se descubre en producción, y por eso está
> escrito acá con marca roja aunque el bloque de mapas figure como hecho.

> **La key se commitea, y no es un descuido.** Una key de Maps para Android viaja dentro del
> APK de todas formas y cualquiera puede extraerla del binario; lo que la protege es la
> restricción paquete + SHA-1, no esconderla. Lo que sí sería un error es dejarla **sin
> restringir**.

> ⚠️ El uso **no factura**, pero Google **exige igual una cuenta de facturación con
> tarjeta** para emitir la key. iOS no necesita nada de esto: usa Apple Maps.

### 3.2 Tienda

| # | Qué |
|---|---|
| 3.2.1 | 🔴 **Cuenta de Google Play Developer (USD 25) — y es lo que hay que hacer PRIMERO de todo Android, incluso antes de que la app esté lista.** Una cuenta **personal** creada después del 13-11-2023 no puede publicar en producción hasta correr una prueba cerrada con **12 testers opted-in durante 14 días corridos**; recién ahí se solicita acceso a producción, que tarda hasta 7 días más. No aplica a cuentas de organización, pero la privacidad declara persona natural con RUC, así que **aplica**. Sumado a las 48 h de verificación de identidad, **entre abrir la cuenta y estar en producción hay tres semanas de calendario como piso**. Verificado contra la documentación de Google el 2026-09-03 |
| 3.2.2 | Crear la app en Play Console con el paquete `com.renzoarroyo.todosbien` (**sin guiones**: Android no los admite, y que difiera del bundle de iOS es correcto) |
| 3.2.3 | Ficha: descripción, capturas, icono, clasificación de contenido, cuestionario de seguridad de datos. ✅ **Todo escrito el 2026-09-03 en `FICHA-PLAY-STORE.md`**, con los largos contados y las respuestas de los tres formularios. Lo que falta es material gráfico: el **gráfico destacado de 1024 × 500 es obligatorio en Play y no existe en Apple**, así que hay que diseñarlo, no recortarlo |
| 3.2.4 | Firma de la app: dejar que **Play App Signing** la maneje, que es el default y lo que EAS espera |
| 3.2.5 | Primera subida a un *internal testing track* |

### 3.3 Pagos

| # | Qué |
|---|---|
| 3.3.1 | Crear los tres productos en Play Console. 🔧 **Corregido el 2026-09-03: NO llevan los mismos identificadores que App Store Connect**, y esta fila decía lo contrario. Cada tienda tiene su catálogo y lo único que comparten es el **entitlement**. Además el modelo es distinto: mensual y anual son **suscripciones con plan base**, y el de por vida es un **producto único**. Paso a paso, con los identificadores y el formato `producto:plan_base` que espera RevenueCat, en `GUIA-SUSCRIPCIONES.md` §8 |
| 3.3.2 | ✅ **Hecho el 2026-09-03 por el dueño**: Play Console conectado a RevenueCat, con la app `Todos Bien (Play Store)` (`app81b5d0c59d`, paquete `com.renzoarroyo.todosbien`) |
| 3.3.3 | ✅ **Clave puesta el 2026-09-03.** `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_…Pmwapw` en `.env`, que se commitea a propósito porque las SDK keys son públicas. ⚠️ **Transcrita desde una captura**: conviene pegarla una vez con el botón de copiar del panel, porque `I` mayúscula y `l` minúscula son indistinguibles a ojo y el SDK no arranca con un carácter mal |
| 3.3.4 | Probar una compra en el track de prueba. ⚠️ **No se puede desde un APK instalado a mano.** Play Billing solo responde si el build llegó por Play: hay que subirlo a un track de **internal testing** (3.2.5) y comprar con una cuenta declarada **license tester** en Play Console. Con un APK de depuración sale «el artículo que solicitaste no está disponible», que parece un fallo de la app y no lo es |

> El webhook de RevenueCat **no hay que tocarlo**: es el mismo para las dos tiendas. El
> campo `store` del evento distingue `APP_STORE` de `PLAY_STORE` y la función ya lo guarda.

---

## Orden sugerido — actualizado el 2026-08-28

**Quedan tres bloques y ninguno es de código.**

### Bloque 1 · Subir el sitio

1. **Hostinger**, y ahora son **cinco** archivos, no dos. Nada de esto está publicado, así que
   hoy el sitio describe un producto anterior a los grupos:

   | Archivo | Qué cambió |
   |---|---|
   | `index.html` | Reescrita entera el 2026-09-02/03: sin WhatsApp, banner simplificado, tarjetas cortas, grilla 3+4, títulos centrados, móvil arreglado, FAQ 15 sobre grupos. Antes traía una **afirmación falsa** sobre lo que es gratis |
   | `css/styles.css` | La grilla de 12 columnas y `.section-head.center` |
   | `js/main.js` | El menú móvil reescrito |
   | `terminos/index.html` | §2, §5 y §5.1 corregidos, **§5.2 nuevo** con las reglas de los grupos. Versión **1.2** |
   | `privacidad/index.html` | §1, §3, §6, §7 y §9. Versión **1.2** |
   | `eliminar-cuenta/index.html` | Qué pasa con los grupos al borrar la cuenta |

   ⚠️ **El sitio no está en git.** La copia previa a todo esto está en
   `scratchpad/landing-backup/` de la sesión.

   ⚠️ **Y la privacidad tiene que subir ANTES de contestar las Nutrition Labels (2.4)**, no
   después. Apple compara la declaración del formulario con la política publicada en la URL de la
   ficha: si el formulario declara contenido de grupo y la página en vivo no lo menciona, la
   contradicción está a un clic del revisor.

### Bloque 2 · Compilar

2. `npx expo prebuild -p ios --clean` si se tocó algo nativo, subir `ios.buildNumber`,
   compilar en Xcode y `eas submit`. **El build tiene que ser posterior a los arreglos del
   27-28**: son JavaScript y viajan dentro del bundle.

### Bloque 3 · El teléfono, lo que queda

3. Del recorrido quedan cuatro grupos, y **solo el primero se puede correr hoy**:
   - **§8.c** · el teclado en las 8 pantallas que no son el chat. Empezar por **iniciar
     sesión** y **denunciar**: son las dos que más miran un usuario nuevo y App Review.
   - Sobre el **build nuevo**: §3 (textos de permiso, que viajan en el `Info.plist`), §4
     (agenda **real** de cientos — con 5 contactos de prueba no prueba nada, así sobrevivió
     el bug de los lotes), §7 (push y captura en segundo plano) y §8 (compras en sandbox,
     mirando el **pie del paywall en pantalla**: que el campo esté guardado en RevenueCat y
     que se **vea** no son lo mismo).
   - Sobre una **instalación nueva**: 7b.1, 7b.2, 9c.13 y 9c.14.
   - **7.6** no se puede forzar. La contesta el próximo sismo real:
     `select stage, at from background_traces order by at desc`.

### Y en paralelo, la consola

4. **App Store Connect**: Nutrition Labels (2.4), justificación de ubicación en segundo plano
   (2.5), **notas del revisor con el correo corregido** (2.7.b), capturas (2.8), disponibilidad
   territorial (2.13) y Small Business Program (2.6.d).

### Y recién ahí

5. **Enviar a revisión.**
6. Después, dos frentes que no conviene mezclar: **Android** (3.1 a 3.3) y el **inglés**, si
   alguna vez se decide vender fuera de la comunidad peruana.

> **Ya no hay ningún ítem marcado como rechazo probable pendiente.** Los cuatro riesgos de
> `REVISION-APPLE.md` §4 están cerrados: moderación (1.2), pie del paywall (3.1.2), borrar la
> cuenta (5.1.1(v)) y «no pudimos probar la función principal» (2.1, cubierto por el
> simulacro). Lo que queda es ejecución.
