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

Última revisión: **2026-09-01**.

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
| Verificación en dispositivo | 🟡 **casi entero**, con iPhone y Android. se recorrió una primera versión de §9.d y §9.e el 2026-09-01 y lo que fallaba está arreglado, **pero las dos secciones se reescribieron esa misma tarde con la 0034 y hay que correrlas de nuevo enteras** — sobre todo **9d.7–9d.15** (que el otro teléfono vea el grupo) y **9d.18–9d.24** (el atajo, que necesita **tres** cuentas). Falta además lo que exige el build nuevo (§3, §4, §7, §8), lo que exige instalación nueva (7b.1, 7b.2, 9c.13, 9c.14), **§8.c** —el teclado en las 8 pantallas que no son el chat— y **7.6**, que no se puede forzar |
| **Textos de «red», «círculo» y «grupo» fuera del repo** | ❌ **empeoró el 2026-09-01**: la landing (`../todos-bien-website`) y la ficha de App Store dicen «círculo», que ahora no describe nada. El producto tiene **grupos compartidos**. La fuente es `QUE-PROMETE-LA-APP.md` §7, ya reescrita |
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
| 1.4 | **Ver la propia ubicación en la app** | Hoy solo la ve tu red. Vos no tenés forma de confirmar que la app está haciendo lo que promete |
| 1.5 | 🟡 **Declaración de permisos en Play Console** | Quedan tres que vienen de la plantilla de Expo y de `expo-file-system` —`SYSTEM_ALERT_WINDOW` y los dos de almacenamiento acotados a `maxSdkVersion=32`— que hay que saber justificar al publicar. La recomendación es dejarlos |
| 1.6 | Sentry para errores de cliente | Sin esto, un crash en el teléfono de un usuario es invisible |
| 1.7 | Pruebas de carga (spec §16.2) | El fan-out recorre `user_settings` entero por sismo. Con padrón grande hay que medirlo |
| 1.11 | 🟡 **Endurecer los permisos de `quake_events`** | `anon` y `authenticated` tienen INSERT/UPDATE/DELETE/TRUNCATE sobre la tabla. **No es un agujero abierto**: RLS bloquea las tres primeras y PostgREST no expone TRUNCATE, así que por la API no se llega. Pero el permiso no tiene razón de existir y quitarlo es un `revoke` de una línea |
| 1.12 | **Fortaleza del hash de teléfono** | La sal está hardcodeada en `src/lib/phone.ts` (`todosbien.v1`). El espacio de números peruanos es chico: con la sal conocida, la tabla de `phone_hash` es reversible por fuerza bruta. No bloquea el MVP; sí hay que resolverlo antes de tener padrón grande |
| 1.14 | 🟡 **El contacto sin notificaciones desaparece del sistema de avisos** | Si alguien de tu red no tiene ningún dispositivo registrado, su entrega cierra como `no_token` y no como `sent` (`send-alerts/index.ts:186`). Y `notify_silent_contacts` solo mira a los callados con `status = 'sent'`, así que **nunca se dispara «X no responde» por esa persona** — ni gratis ni con Guardián. El silencio de la app coincide con el silencio de quien más te preocuparía. *(«X está bien» sí funciona: se dispara cuando ella reporta, y para reportar no hace falta recibir ningún push.)* **El arreglo NO es quitar el filtro de `sent`** — eso reintroduce el ruido sin antecedente que corrigió la 0020. Va como **estado permanente**, no como notificación: una línea en la ficha del contacto y un distintivo en la grilla de la red, con el texto *«No recibe notificaciones · Las notificaciones de Todos Bien no están llegando a su teléfono. No va a recibir el aviso de sismo.»* — redactado sobre el efecto y no sobre la causa, porque el servidor sabe que no hay a dónde mandar pero **no sabe por qué** (permiso denegado, teléfono nuevo, o reinstalación sin abrir la app). Implementación: `push_tokens` tiene RLS `_own` y no se toca; hace falta una función `security definer` que exponga solo ese booleano para la red aceptada, **mismo patrón que `get_circle_alert_scope` de la 0025**, que existe por este mismo problema con `alert_deliveries`. Cero notificaciones nuevas |
| 1.15 | 🟡 **Que te metan en un grupo no te avisa** | Desde la 0034 el dueño de un grupo suma gente de su red, y la persona **entra sin enterarse**: el grupo y su chat le aparecen al siguiente refresco y punto. No es un agujero de privacidad —solo puede meterte alguien que ya es contacto tuyo, y del otro lado la pantalla avisa que quien entra lee todo lo anterior— pero sí es un silencio raro en una app cuyo propósito es que la gente se entere, y ahora pesa más que antes: el grupo es visible, tiene nombre, y hay gente adentro que puede no ser contacto tuyo. El arreglo es la **regla de los 4 lugares** de la 0028: `kind` en el CHECK de `notification_deliveries`, rama en `enqueue_notifications`, columna en `notification_preferences` y el emisor. Lo natural sería colgarlo de `contact_message`, que ya existe |
| 1.13 | 🟡 **Quedan tres `try/finally` sin `catch`** | El barrido del 2026-08-28 encontró **siete** en total. Cinco están cerrados —aceptar solicitud, abrir chat, ficha del contacto, **reportar el estado** y actualizar la ubicación—; los tres que quedan son de menor consecuencia y están sin tocar: `context/drill.tsx` (completar un simulacro), `app/drill.tsx` (uno de sus tres bloques) y `(onboarding)/permissions.tsx` (los dos, en las peticiones de permiso del alta). El patrón deja el error escapando como promesa no capturada **y** se lleva puesto lo que venía después del `await`, así que da dos síntomas sin relación aparente. Se repite con: `for f in $(grep -rl "} finally {" src/); do ...` comparando cuántos `catch` y cuántos `finally` tiene cada archivo |

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
| 2.1.b | 🟡 **Subir `ios.buildNumber`** | Hoy `app.json` dice `"2"`. `autoIncrement` de `eas.json` **no aplica a builds locales**, y App Store Connect rechaza un número repetido para la misma versión: hay que subirlo a mano en cada envío |
| 2.4 | **Nutrition Labels** | Respuestas listas, dato por dato, en `PRIVACIDAD-APP-STORE.md`. Falta pegarlas |
| 2.5 | **Justificación de ubicación en segundo plano, en inglés** | Escrita en `PRIVACIDAD-APP-STORE.md` §4. Falta pegarla |
| 2.7.b | 🔴 **Notas para el revisor** | El texto está en `REVISION-APPLE.md` §2. ⚠️ **Tenía el correo equivocado** de la cuenta demo hasta el 2026-08-28; usar la versión corregida |
| 2.8 | **Capturas de pantalla** | Las seis, con qué tiene que verse en cada una, en `FICHA-APP-STORE.md` §5. Hay una séptima decidida: la lista de sismos |
| 2.12 | Revisión legal de términos y limitación de responsabilidad | spec §18 |
| 2.13 | **Disponibilidad territorial: Perú + América + Japón** | Guardián se le vende a la diáspora, así que restringirlo a Perú deja fuera al que paga. **España e Italia quedan afuera por ahora** — distribuir en la UE exige declarar *trader status* y Apple publica nombre, dirección y teléfono del desarrollador |
| 2.6.d | 🟡 **Small Business Program de Apple** | Baja la comisión del 30 % al 15 % con menos de un millón de dólares al año. Es un formulario y duplica el margen |
| 2.14 | 🔴 **Correr el recorrido de verificación** | `VERIFICACION-EN-DISPOSITIVO.md`, sobre el build de 2.1. Es la única puerta que queda |

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
| 3.2.1 | Cuenta de **Google Play Developer** (pago único de USD 25) |
| 3.2.2 | Crear la app en Play Console con el paquete `com.renzoarroyo.todosbien` (**sin guiones**: Android no los admite, y que difiera del bundle de iOS es correcto) |
| 3.2.3 | Ficha: descripción, capturas, icono, clasificación de contenido, cuestionario de seguridad de datos |
| 3.2.4 | Firma de la app: dejar que **Play App Signing** la maneje, que es el default y lo que EAS espera |
| 3.2.5 | Primera subida a un *internal testing track* |

### 3.3 Pagos

| # | Qué |
|---|---|
| 3.3.1 | Crear los productos en Play Console con los **mismos identificadores** que en App Store Connect |
| 3.3.2 | Service account con permisos de **facturación**, conectada a RevenueCat |
| 3.3.3 | Agregar la app de Android en RevenueCat y poner la clave `goog_...` en `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` |
| 3.3.4 | Probar una compra en el track de prueba |

> El webhook de RevenueCat **no hay que tocarlo**: es el mismo para las dos tiendas. El
> campo `store` del evento distingue `APP_STORE` de `PLAY_STORE` y la función ya lo guarda.

---

## Orden sugerido — actualizado el 2026-08-28

**Quedan tres bloques y ninguno es de código.**

### Bloque 1 · Subir el sitio

1. **Hostinger**: la landing corregida (`index.html` + `css/styles.css`) y
   **`terminos/index.html`**, que cambió con el bloqueo y todavía no subió. La landing tiene
   correcciones del 2026-08-28 que **arreglan una afirmación falsa** sobre lo que es gratis:
   mientras no suba, el sitio promete algo que la app no hace.

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
