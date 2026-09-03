# Revisión de App Store: cuenta demo y notas para el revisor

Lo que se pega en **App Store Connect → App Review Information**, más lo que hay que
preparar antes. Escrito el **2026-08-24**.

**El riesgo específico de esta app** no es que el revisor no entienda qué hace: es que la
abra un martes tranquilo, no haya ningún sismo, vea «todo en calma» y no pueda evaluar la
función principal. Eso se rechaza como *«we were unable to review your app»* y cuesta un
ciclo entero. Por eso la nota le dice, en la segunda línea, cómo ver el flujo completo sin
esperar un terremoto.

---

## 1 · La cuenta de demostración

Apple **exige** credenciales de una cuenta funcional cuando la app pide iniciar sesión. Fue
el motivo de fondo del cambio de código OTP a contraseña (ESTADO §1.1.1): con acceso por
código, el correo llegaba a una casilla que Apple no tiene y la revisión era un rechazo
garantizado.

### ✅ Creada el 2026-08-24 · red **repuesto el 2026-08-28**

> ⚠️ **La red se había quedado vacío.** Los cuatro contactos se borraron durante una
> limpieza de datos de prueba y la cuenta llegó al 2026-08-28 con **cero conexiones**. Un
> revisor que entra a una app vacía no puede evaluar la función principal: es el rechazo
> *«we were unable to review»*. **Conviene verificarlo el mismo día del envío**, con esta
> consulta:
>
> ```sql
> select count(*) from public.connections
>  where (user_a = '00000000-0000-4000-a000-000000000001'
>      or user_b = '00000000-0000-4000-a000-000000000001')
>    and status = 'accepted';  -- tiene que dar 4
> ```

> 🟡 **Desde la 0039, los cuatro contactos demo salen marcados «No recibe notificaciones».**
> Y es correcto: son perfiles sembrados, sin ningún dispositivo registrado, así que de verdad
> no les llegaría un aviso. El distintivo hace su trabajo — pero cuatro de cuatro puede leerse
> como que la app está rota.
>
> **Se decidió dejarlo así.** La alternativa era sembrarles un token falso, y eso es peor por
> dos motivos: el primer sismo real de Lima intentaría enviarles, Expo devolvería
> `DeviceNotRegistered` y el token se borraría solo —volviendo el distintivo—, y mientras tanto
> la app le estaría mintiendo al revisor sobre un dato de seguridad. Lo que sí hay que hacer es
> **contarlo en las notas del revisor** (§2), para que lo lea como una función y no como un
> fallo. Comprobar cómo se ve el día del envío:
>
> ```sql
> select p.display_name, exists (select 1 from public.push_tokens t where t.user_id = p.id) as recibe
> from public.profiles p
> where p.id = any (private.accepted_circle_of('00000000-0000-4000-a000-000000000001'));
> ```

| Campo | Valor |
|---|---|
| Correo | `todosbienapp@gmail.com` |
| Contraseña | La que fijó el dueño. **No se escribe acá**: este archivo vive en un repositorio y es una cuenta viva |

**Verificado contra la API real**, no contra la base: `POST /auth/v1/token?grant_type=password`
devuelve sesión, y `get_circle` con ese token devuelve los cuatro contactos. Probar el login
importa más que revisar las filas — una cuenta que existe pero no deja entrar produce
exactamente el rechazo que se quiere evitar.

Qué tiene adentro:

| | |
|---|---|
| Perfil | «Renzo», onboarding completo, teléfono guardado y hasheado igual que lo haría la app |
| Red | 4 contactos con la conexión ya aceptada: **María Salazar** y **Jorge Salazar** en «estoy bien», **Ana Ríos** en «necesito ayuda» con mensaje, y **Carlos Medina** sin confirmar y sin ubicación |
| Plan de acción | Escrito, con punto de encuentro y contacto fuera de la ciudad |
| Chat | Una conversación con María, de cuatro mensajes |
| **Grupos** | **Dos, sembrados el 2026-09-03**: **Casa** (María y Jorge) y **Familia** (los cuatro). Cada uno con su chat: 3 mensajes en Casa, 2 en Familia |
| Simulacros | 0 de 3 usados: el revisor tiene los tres disponibles |
| Premium | **No.** Tiene que poder ver el paywall y probar la compra en sandbox |

> ✅ **Sembrados el 2026-09-03**, y hasta ese día la cuenta tenía cero: la ficha ya describía los
> grupos y los ponía en la **captura 3**, así que un revisor que abriera la pestaña Red habría
> encontrado vacía la única función que la tienda le acababa de prometer.
>
> Se sembraron **por el mismo camino que usa la app** —grupo, después su chat, y recién entonces
> los integrantes—, que es el orden que exige `create_group`: el disparador que espeja
> `group_members` en `conversation_members` necesita que el chat ya exista. Un grupo sin chat
> rompe la regla 1 de la 0034 y no se puede reparar desde el cliente.
>
> **Efecto secundario a tener presente: la cuenta queda en 2 de 2 grupos gratis**, así que tocar
> «Nuevo grupo» abre el **paywall**. No es un defecto —es el tope funcionando, y de paso le da al
> revisor una segunda puerta al paywall además de Ajustes— pero la nota de §2 tiene que decirlo,
> porque un botón que abre una pantalla de pago sin explicación se lee como un cobro sorpresa.
>
> Verificación, el día del envío:
>
> ```sql
> select g.name,
>        (select count(*) from public.group_members m where m.group_id = g.id) as integrantes,
>        (select count(*) from public.messages ms
>          join public.conversations c on c.id = ms.conversation_id
>         where c.group_id = g.id) as mensajes
>   from public.groups g
>  where g.owner_id = '00000000-0000-4000-a000-000000000001'
>  order by g.sort_order;   -- Casa 2/3 · Familia 4/2
> ```

> **Por qué Carlos está sin confirmar y sin ubicación, a propósito:** es la mitad del
> producto. Una red donde todos dicen «estoy bien» no muestra para qué sirve la app; lo
> que hay que poder ver es la diferencia entre quien respondió y quien no.

> 🔴 **Pero el revisor NO va a ver esos estados, y hay que decírselo.** Desde el 2026-08-27 la
> app oculta el estado y la ubicación de todo el mundo fuera de una alerta activa
> (`contact/[id].tsx`, `circle.tsx`, regla §5.2). En un martes tranquilo la red se ve como
> cuatro nombres sin nada más. **Es correcto y es la promesa de privacidad funcionando**, pero
> si el revisor lo lee como «la app no hace nada», cuesta el ciclo. Por eso la nota de §2
> ahora se lo explica y lo manda al **simulacro**, que es donde los estados sí se ven.
>
> Los estados sembrados no son inútiles: siguen siendo los datos correctos si el revisor corre
> el simulacro o si ocurre un sismo durante la revisión.

Los cuatro contactos son cuentas reales con correos `todosbienapp+nombre@gmail.com`: llegan a
la misma casilla del dueño y no rebota nada. Se sembraron con UUID fijos
(`00000000-0000-4000-a000-00000000000X`), así que el script se puede volver a correr sin
duplicar nada.

**Dos cosas que hicieron falta y no son obvias**, por si hay que rehacerlo:

- Una cuenta insertada a mano en `auth.users` **no puede entrar** hasta ponerle en `''` las
  ocho columnas de token (`confirmation_token`, `recovery_token`, `email_change*`,
  `phone_change*`, `reauthentication_token`). Si quedan en NULL, el login devuelve
  `500 Database error querying schema`, que no dice nada de lo que pasa.
- `auth.identities.email` es una **columna generada**: no se puede insertar, sale del
  `identity_data`.

> ⚠️ **Después de la aprobación conviene rotar la contraseña**, porque queda escrita en App
> Store Connect y en el historial de la revisión.

> ✅ **`qa.simulador@example.com` borrado el 2026-08-28.** Una cuenta de QA con datos raros que
> aparezca en la red del revisor es ruido en el peor momento.

---

## 2 · Notas para el revisor — texto listo para pegar

Va en **App Review Information → Notes**. En inglés, que es lo que lee el equipo de revisión.

> 🔴 **Reescritas el 2026-09-01, y no por gusto: mandaban al revisor a un sitio que ya no
> existe.** Decían «Home tab → Simulacro», y desde la 0035 el simulacro se convoca desde
> Ajustes → PRÁCTICA. Un revisor que sigue una instrucción y no encuentra el botón no
> concluye que la nota está vieja: concluye que la app está rota, y eso es exactamente el
> rechazo *«we were unable to review»* — sobre la **única** forma de evaluar la función
> principal sin esperar un terremoto.
>
> Tampoco decían **cómo salir** del modo simulacro, que ahora es un modo y no una pantalla:
> el revisor se habría quedado con una franja amarilla encima de toda la app sin saber qué
> hacer con ella.
>
> Y la palabra «círculo» ya no existe en el producto (0034). **Cada vez que cambie un
> recorrido de la app hay que releer este bloque**: es el único texto del proyecto donde una
> instrucción desactualizada cuesta un rechazo en vez de una molestia.

> 🔴 **Revisadas otra vez el 2026-09-03. Dos afirmaciones se habían vuelto falsas con los
> grupos, y las dos tocan la guía 1.2**, que es la que se revisa con lupa:
>
> 1. Decían *«chats are strictly one-to-one between people who BOTH explicitly accepted the
>    connection»*. Con los grupos eso es **falso y comprobable en un minuto**: el revisor abre
>    la pestaña Chats, ve un chat de grupo, y a partir de ahí no puede confiar en ninguna otra
>    línea de la nota. Reemplazado por el bloque MESSAGING MODEL, que describe los dos tipos de
>    chat y por qué ninguno expone a desconocidos.
> 2. Decían que quien está bloqueado *«cannot message you (not even in an existing
>    conversation)»*, sin acotarlo. `private.conversation_blocked` filtra por
>    `cv.kind = 'direct'`, así que la frase se queda corta en los grupos.
>
>    ⚠️ **Y acá el primer diagnóstico fue peor que la realidad.** Leyendo solo ese filtro parece
>    que el bloqueo no alcanza a ningún grupo, y eso es falso: el disparador
>    `connections_drop_group_membership` corre `after delete or update on connections`, y al pasar
>    el vínculo de `accepted` a `blocked` **borra la pertenencia en las dos direcciones** — la
>    persona sale de los grupos de quien la bloqueó, y viceversa. **Comprobado el 2026-09-03** en
>    una transacción revertida: bloquear a María la sacó del grupo de Renzo (`0`) y dejó a Jorge
>    intacto (`1`).
>
>    El hueco real es **uno y más chico**: un grupo de una **tercera** persona donde los dos son
>    integrantes. Ahí ninguna de las dos ramas del disparador coincide y el bloqueado sigue
>    escribiendo. Es lo que dice ahora la nota, y lo que quedó publicado en los términos §5.1.
>
>    **La lección:** leer el filtro de una función no alcanza para describir un comportamiento que
>    varios disparadores producen entre todos. Casi se publicó una limitación más grave que la
>    verdadera, en el texto legal y frente al revisor.
>
> **Decirlo antes es más barato que que lo encuentren.** Un límite declarado es una decisión de
> producto; el mismo límite descubierto por el revisor después de haber leído lo contrario es
> una nota que miente.
>
> Y también se corrigió el rótulo de la pestaña: la nota decía «Mi red» y en la app dice
> **«Red»**. Es exactamente el error que advierte el bloque de arriba.

```
WHAT THIS APP IS
Todos Bien is a post-earthquake family coordination app. It is NOT an early warning system:
notifications arrive a few minutes AFTER an earthquake, once the Geophysical Institute of
Peru (IGP) or the USGS publishes the event. The app lets people tell their family they are
safe, see who has responded, and share their location with the contacts they accepted.

HOW TO REVIEW THE MAIN FEATURE WITHOUT WAITING FOR AN EARTHQUAKE
Real alerts depend on a real seismic event, so the app includes a guided DRILL that puts the
app into the exact state a real earthquake produces. Please use it:

  1. Settings tab (Ajustes) -> section "PRÁCTICA" -> "Hacer un simulacro"
  2. Choose "Solo yo" (Just me) -> "Empezar simulacro"
  3. The app returns to the Home tab, now in alert mode, and a 5-step guided tour
     highlights each control in turn.

This is not a mock screen: the real Home, the real status picker, the real network grid and
the real location card are all live. A yellow "SIMULACRO" strip stays at the top of EVERY
screen so the drill can never be mistaken for a real alert.

  TO EXIT: Settings tab -> "PRÁCTICA" -> "Salir del modo simulacro".
  That is the only exit, and the yellow strip says so. The drill also expires on its own
  after 60 minutes, and a real earthquake would end it immediately.

Nothing is sent to anyone: a solo drill is private. (Choosing a group instead would invite
that group's members, which is why the option names them explicitly.)

GROUPS
The demo account already has two, so you can see the model without building anything:

  · "Casa" -- 3 people (the account plus 2 contacts), with a 3-message chat
  · "Familia" -- 5 people (the account plus all 4 contacts), with a 2-message chat

Both are in the "Red" tab, and their chats are listed in the "Chats" tab. During an alert the
Home screen breaks the network down per group ("Casa 2/3") instead of showing one flat list --
run the drill above to see it.

Only the person who created a group can add or remove members, and can only add contacts they
are ALREADY connected to. That restriction is enforced by a database policy, not by the UI.

Note: the free plan allows 2 groups and this account has both in use, so tapping "Nuevo grupo"
opens the Premium paywall. That is the free limit working as intended, not an error -- and it is
a second way to reach the paywall besides Settings -> "Obtener Premium".

DEMO ACCOUNT
Email: todosbienapp@gmail.com
Password: [ver el gestor de contraseñas]
The account already has an accepted network of 4 contacts, an action plan and a chat thread,
so every screen has content.

WHY SOME CONTACTS SHOW "No recibe notificaciones"
That label means the app has no registered device for that contact, so a real earthquake
alert would not reach them. It is a working safety feature, not an error: we surface it on a
calm day, when the user can still do something about it, precisely because during an
earthquake we could not tell the difference between "they are silent" and "they never got
asked". The four demo contacts are seeded profiles with no devices, so all four show it.

WHY THE NETWORK LOOKS QUIET
Outside of an active earthquake the app deliberately does NOT display anyone's status or
location. This is a privacy decision, not missing data: we only store where someone was
during an earthquake, so showing a position on a calm day would turn the app into a location
history, which is exactly what we promise not to be. Run the drill above to see statuses,
the status ring and the location card exactly as a real alert shows them.

REPORTING AND BLOCKING (guideline 1.2)
Users can report objectionable content and block other users:
  - Report a message: long-press any message from the other person in a chat -> "Denunciar".
  - Report a person: "Red" tab -> tap the contact -> "Denunciar a esta persona".
  - Block: "Red" tab -> tap the contact -> "Bloquear a esta persona", or right after sending a
    report. A blocked user cannot message you in your one-to-one chat (not even in an existing
    conversation), cannot send you connection requests, and cannot see your status or location.
    Blocking ALSO removes that person from every group you own, and removes you from every group
    they own, automatically and in both directions. Blocking can be undone from Settings ->
    "Personas bloqueadas"; the blocked user cannot undo it.
  - Leave a group: any member can leave at any time, without asking the owner. This covers the
    one case a block does not reach -- a group owned by a THIRD person where both users are
    members -- and that group's owner can remove either of them too. We state this precisely in
    our terms, section 5.1, rather than let a user assume a block covers more than it does.
  - "Quitar de mi red" is a separate, softer action: it ends the connection but either
    side may send a new request later.
Reports are reviewed within 24 hours. Our terms of service state a zero-tolerance policy for
abusive content: https://todosbien.app/terminos (section 5.1). Contact for reports and
support: todosbienapp@gmail.com

MESSAGING MODEL — no strangers, in either kind of chat
  - One-to-one chat: only between two people who BOTH explicitly accepted the connection.
  - Group chat: lives inside a group created by one user. Only the owner can add members, and
    only people the OWNER is already connected to, so no one can be placed in a group by a
    stranger. Members see the group name and each other's display names, and they do NOT see
    each other's status or location unless they separately accept each other -- group membership
    never creates a connection. Any member can leave at any time.
There is no public content and no discovery of strangers: nothing in the app lets a user find,
browse or message someone who has not accepted them or been added by a mutual contact.

ACCOUNT DELETION (guideline 5.1.1(v))
In-app path: Settings tab -> tap the profile card at the top -> SEGURIDAD -> "Borrar mi
cuenta". It asks for the account password and deletes the account and all associated data.

IN-APP PURCHASES
Premium is optional; the entire safety core is free. The paywall is served by RevenueCat and
can be opened from Settings -> "Obtener Premium". Please use a sandbox account to test.

LOCATION
[pegar acá el texto de docs/PRIVACIDAD-APP-STORE.md §4]

LANGUAGE
The app is currently in Spanish (Latin American), aimed at Peru. Screenshots and metadata
match that language.
```

> **La línea de la contraseña se completa a mano al pegar.** No se escribe en este archivo,
> que está en un repositorio: una contraseña de una cuenta viva no va en git ni aunque sea de
> demostración.

---

## 3 · Las cuatro preguntas que Apple hace en el formulario

| Pregunta | Respuesta | Dónde está el detalle |
|---|---|---|
| ¿Usa cifrado no exento? | **No.** Ya resuelto por código: `ITSAppUsesNonExemptEncryption: false` en `app.json`, así que no lo vuelve a preguntar en cada build | `app.json` |
| ¿Usa IDFA / publicidad? | **No.** No hay SDK de publicidad ni rastreo | `PRIVACIDAD-APP-STORE.md` §1 |
| ¿Contenido generado por usuarios? | **Sí** — chat y mensaje de estado | `FICHA-APP-STORE.md` §4, con la advertencia de moderación |
| ¿Ubicación en segundo plano? | **Sí**, con la justificación de `PRIVACIDAD-APP-STORE.md` §4 | — |

---

## 4 · Los rechazos probables de esta app, en orden

Ninguno es hipotético: los cuatro salen de reglas escritas de Apple y de cómo está construida
la app hoy.

| # | Riesgo | Por qué aplica acá | Estado |
|---|---|---|---|
| 1 | **Guideline 1.2 — contenido generado por usuarios sin moderación** | Hay chat entre personas. Apple pide: forma de denunciar, forma de bloquear, canal de contacto publicado y compromiso de actuar en 24 h | ✅ **Cerrado el 2026-08-24.** Denunciar desde el chat y desde el contacto (migración 0020), bloquear con «Quitar de mi red», contacto en `/soporte`, y las 24 h escritas en los términos §5.1 y sostenidas por el chequeo diario del runbook |
| 2 | **Guideline 3.1.2 — paywall sin Términos ni Privacidad** | El paywall vive en RevenueCat, y ahí es un campo que se olvida | ✅ **Cerrado el 2026-08-28.** Los dos enlaces y «Restaurar compras» están en el pie |
| 3 | **Guideline 5.1.1(v) — borrar la cuenta** | La app crea cuentas | ✅ Hecho, y la ruta está en §2 |
| 4 | **Guideline 2.1 — no pudimos probar la función principal** | Requiere un sismo real | ✅ Cubierto por la nota del simulacro |

> **Los cuatro están cerrados al 2026-08-28.** El que quedaba vivo era el 2, y era el más
> barato de todos: dos campos de texto en RevenueCat. Vale la pena mirar el pie del paywall en
> el teléfono antes de enviar (`VERIFICACION-EN-DISPOSITIVO.md` 8.3) — que el campo esté
> guardado en la consola y que se **vea** en la pantalla no son lo mismo.

---

## 5 · Antes de tocar «Submit for Review»

- [x] La cuenta demo existe, entra, y tiene red, plan y chat sembrados — **repuesto el
      2026-08-28**; volver a contarlo el día del envío con la consulta de §1
- [ ] **El correo de la cuenta demo en las notas es `todosbienapp@gmail.com`.** Hasta el
      2026-08-28 este documento decía `appreview@todosbien.app`, que **no existe**: pegado tal
      cual, era el rechazo «no pudimos entrar» garantizado
- [ ] La contraseña de la cuenta demo está pegada en el formulario (no en git)
- [x] `qa.simulador@example.com` borrado — 2026-08-28
- [x] El paywall de RevenueCat tiene los enlaces a Términos y Privacidad — 2026-08-28
- [x] Decidido qué se hace con la moderación de §4.1 — denunciar y bloquear existen
- [ ] La nota le explica al revisor **por qué la red se ve quieto** y lo manda al
      simulacro. Sin eso, la app parece vacía en un día sin sismos
- [ ] El build subido es **posterior a los arreglos del 2026-08-27/28**: los textos de permiso
      viajan en el `Info.plist`, y los cuatro bugs de interfaz viajan en el bundle de JS
