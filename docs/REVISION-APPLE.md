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
| Simulacros | 0 usados. Con Premium son ilimitados, así que el revisor puede repetir |
| **Hogar** | **«Casa»**, sembrado el 2026-09-10 marcando el grupo que ya existía. 3 personas |
| **Centro de Preparación** | **51 %**: mochila 9/16, punto de encuentro escrito, 2 de 3 con tarea, minicurso terminado por Carlos, simulacro sin hacer |
| Premium | **Sí, desde el 2026-09-10.** Ver el recuadro de abajo |

> 🔴 **La cuenta demo pasó a ser Premium, y es un cambio de criterio.** Hasta el 2026-09-10 era
> gratuita a propósito, para que el revisor viera el paywall. Con la pestaña Preparación eso se
> dio vuelta: una cuenta libre abre la función principal de la versión y **solo encuentra el
> candado**, que es literalmente el rechazo *«we were unable to review»*.
>
> **El paywall no se pierde:** sigue alcanzable desde el engranaje de Inicio → «Obtener
> Premium», y así lo dicen las notas de §2.1. Lo que se pierde es ver el tope de grupos
> disparándose, que era un efecto secundario, no una función.
>
> Se puso a mano en `user_settings.is_premium`, que **solo escribe el webhook de RevenueCat** —
> la app no tiene permiso sobre esa columna—, así que no hay nada que lo pise. Verificación el
> día del envío:
>
> ```sql
> select s.is_premium,
>        (public.get_household_preparedness() ->> 'total') as centro_pct
>   from public.user_settings s
>  where s.user_id = '00000000-0000-4000-a000-000000000001';  -- true, y ~51
> ```
>
> ⚠️ Esa RPC solo devuelve el hogar **del que llama**, así que para verla como la cuenta demo
> hay que fijar `request.jwt.claims` con su `sub`, o consultarla con su sesión.

> ✅ **Sembrados el 2026-09-03**, y hasta ese día la cuenta tenía cero: la ficha ya describía los
> grupos y los ponía en la **captura 3**, así que un revisor que abriera la pestaña Red habría
> encontrado vacía la única función que la tienda le acababa de prometer.
>
> Se sembraron **por el mismo camino que usa la app** —grupo, después su chat, y recién entonces
> los integrantes—, que es el orden que exige `create_group`: el disparador que espeja
> `group_members` en `conversation_members` necesita que el chat ya exista. Un grupo sin chat
> rompe la regla 1 de la 0034 y no se puede reparar desde el cliente.
>
> ~~**Efecto secundario: la cuenta queda en 2 de 2 grupos gratis**, así que «Nuevo grupo» abre
> el paywall.~~ **Dejó de aplicar el 2026-09-10**, cuando la cuenta pasó a Premium: los grupos
> son ilimitados y ese botón ya no abre nada. La nota de §2.1 se corrigió en consecuencia —
> quedó tachado y no borrado porque si algún día se vuelve a una cuenta demo gratuita, este
> efecto vuelve con ella y la nota tiene que volver a decirlo.
>
> Y **«Casa» es además el hogar** desde esa fecha, así que ese grupo ahora sale con casita y
> otro color en Mi red, en Chats y en el simulacro. Es la marca funcionando, no un defecto.
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

> 🔴 **El campo tiene un tope de 4.000 caracteres, y el texto de referencia de abajo mide
> 8.467.** Descubierto el 2026-09-06 preparando el reenvío. Pegado tal cual, App Store Connect
> lo corta o rechaza el guardado, y lo que se pierde es **el final** — que es justo donde
> estaban el modelo de mensajería, el borrado de cuenta y la ubicación en segundo plano.
>
> Por eso ahora hay **dos** bloques: §2.1 es el que se pega, medido y con margen; §2.2 queda
> como referencia larga, para consultar y para contestar si Apple repregunta. **Cada vez que se
> toque §2.1 hay que volver a medirlo**, contando que el enlace del video y la contraseña se
> pegan encima de los marcadores.

### 2.1 · Para pegar — versión del Centro de Preparación · **3801 caracteres**

> 🔴 **Reescritas el 2026-09-10, y por el motivo de siempre.** Las anteriores mandaban al
> revisor a `Ajustes → PRÁCTICA` para probar la función principal, y **Ajustes dejó de ser
> pestaña** ese mismo día: ahora se abre desde el engranaje de Inicio. Ese error exacto —una
> ruta que la nota da por buena y la app ya no tiene— **ya costó un ciclo de rechazo**.
>
> Quedan **198 caracteres de margen** sobre el tope de 4.000, contando que el enlace del video
> y la contraseña se pegan **encima** de los marcadores. Un enlace de `youtube.com/watch?v=`
> gasta ~3 más que el marcador; la contraseña, unos 6 menos.

El orden no es casual: lo primero que busca el revisor es qué cambió y cómo probarlo, así que
la función nueva y la advertencia de navegación van arriba de todo.

```
NEW VERSION. Main change: "Preparación" (Preparedness Center), a new tab.

SCREEN RECORDING
[PEGAR EL ENLACE DE YOUTUBE - NO LISTADO]

WHAT IS NEW
A household prepares together BEFORE an earthquake: a shared emergency-kit checklist (contents from Peru INDECI, each item sourced), one meeting point, who does what, a 12-tip mini-course and drills. One paid account unlocks it for the whole household.
IMPORTANT FOR NAVIGATION: "Ajustes" (Settings) IS NO LONGER A TAB. It opens from the GEAR ICON at the top right of the Home screen, next to the avatar.

DEMO ACCOUNT
todosbienapp@gmail.com / [PEGAR LA CONTRASENA]
Premium is enabled on it so every screen has content: 4 accepted contacts, 2 groups with chats, an action plan, and a household ("Casa", 3 people) with the Preparedness Center at 51%.

HOW TO REVIEW THE MAIN FEATURE WITHOUT AN EARTHQUAKE
Alerts arrive minutes AFTER an event published by Peru's IGP or the USGS. This is NOT an early-warning app. Use the built-in drill:
Home -> GEAR ICON (top right) -> "PRACTICA" -> "Hacer un simulacro" -> "Solo yo" -> "Empezar simulacro".
The real Home enters alert mode with a 5-step guided tour, and a yellow "SIMULACRO" strip stays on every screen. EXIT: same path -> "Salir del modo simulacro". A solo drill sends nothing to anyone.

USER-GENERATED CONTENT - FOUR PRECAUTIONS (guideline 1.2)

1) TERMS AGREEMENT BEFORE REGISTRATION
An UNCHECKED checkbox on the sign-up screen states that the user accepts the Terms and Privacy Policy and understands that offensive content and harassment are not tolerated. "Crear cuenta" stays DISABLED until it is ticked.
https://todosbien.app/terminos (zero tolerance: section 5.1)
https://todosbien.app/privacidad

2) AUTOMATED CONTENT FILTERING, SERVER SIDE
Chat messages, status messages, display names, group names, action plans, emergency-kit item labels and household task labels are checked on the SERVER before storage. Directed insults, slurs and threats are rejected outright, never stored, never delivered; the author is told why. It is a database trigger, so a modified client cannot bypass it.
TO SEE IT: in any chat, send "conchatumadre" (a common Peruvian insult). It is rejected and the text returns to the input box. It targets aggression, not profanity: during a quake "se cayo la pared, mierda, hay un herido" must go through.

3) FLAG CONTENT
Message: LONG-PRESS any message from the other person -> "Denunciar". Person: "Red" tab -> tap the contact -> "Denunciar a esta persona". Reviewed within 24 hours: todosbienapp@gmail.com

4) BLOCK USERS
"Red" tab -> tap the contact -> "Bloquear a esta persona", also offered right after a report. A blocked user cannot message you, send requests, or see your status or location. Reversible from GEAR ICON -> "Personas bloqueadas"; the blocked user cannot undo it.

NO STRANGERS: one-to-one chat requires that BOTH people accepted the connection; in a group only the owner adds members, and only their own contacts. No public content, no way to find a stranger.

NOT DEFECTS
- Outside an active earthquake the app hides everyone status and location by design. The drill shows them.
- All 4 demo contacts show "No recibe notificaciones": seeded profiles with no device. It is a working safety warning.

PURCHASES: Premium is optional and the safety core is free. Paywall (RevenueCat): GEAR ICON -> "Obtener Premium". Please use a sandbox account. The demo account is already Premium so the new tab can be reviewed; on a free account that tab shows a lock over placeholder shapes, never real data.

BACKGROUND LOCATION: a silent push tied to a verified earthquake wakes a task that reads the position EXACTLY ONCE. No continuous updates, geofencing or significant-change monitoring; only the latest reading is stored, visible only to accepted contacts.
```

**Lo que se sacó para entrar, en orden de reposición** si el campo admitiera más: el borrado de
cuenta (`engranaje → tarjeta de perfil → SEGURIDAD → «Borrar mi cuenta»`, guía 5.1.1(v)), la
línea que explicaba que la cuenta demo usa sus 2 grupos gratis —**ya no aplica: la cuenta es
Premium desde el 2026-09-10**— y la justificación larga de ubicación de
`PRIVACIDAD-APP-STORE.md` §4.

#### La cuenta demo cambió, y sin eso las notas serían falsas

Hasta el 2026-09-10 la cuenta demo era **gratuita y sin hogar**. Con la pestaña nueva eso
significaba que el revisor abría Preparación y **veía únicamente el candado**: no podía revisar
la función principal de la versión que se está enviando. Se corrigió sembrando:

| | |
|---|---|
| `is_premium` | `true` — puesto a mano en `user_settings`, que solo escribe el webhook de RevenueCat, así que no se lo pisa nadie |
| Hogar | «Casa», el grupo que ya tenía, con 3 personas |
| Mochila | 16 ítems del INDECI, **9 marcados** — ni vacía ni llena, para que el dibujo del nivel se vea a media asta |
| Punto de encuentro y plan | Escritos |
| Tareas | 2 de 3 integrantes |
| Minicurso | Carlos terminado, o sea 1 de 3 |
| **Progreso total** | **51 %**, verificado con la RPC el 2026-09-10 |

⚠️ **Si alguna vez se resiembra la cuenta demo, esto se pierde y hay que rehacerlo.** Un
Centro en 0 % no sirve para revisar ni para capturas.

### 2.2 · Referencia larga — **no entra en el campo**

> 🔴 **Las rutas de acá adentro se corrigieron el 2026-09-10 igual que las de §2.1.** Este
> bloque no se pega en el formulario, pero **sí se copia para contestarle a Apple** cuando
> repregunta, y una ruta vieja en una respuesta es el mismo rechazo que una ruta vieja en las
> notas. `Settings tab` pasó a ser `Home -> GEAR ICON`.

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

  1. Home -> GEAR ICON, top right -> section "PRÁCTICA" -> "Hacer un simulacro"
  2. Choose "Solo yo" (Just me) -> "Empezar simulacro"
  3. The app returns to the Home tab, now in alert mode, and a 5-step guided tour
     highlights each control in turn.

This is not a mock screen: the real Home, the real status picker, the real network grid and
the real location card are all live. A yellow "SIMULACRO" strip stays at the top of EVERY
screen so the drill can never be mistaken for a real alert.

  TO EXIT: Home -> GEAR ICON -> "PRÁCTICA" -> "Salir del modo simulacro".
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

TERMS OF USE ACCEPTANCE (guideline 1.2)
New users must actively agree to our terms before an account can be created. On the sign-up
screen there is an unchecked checkbox reading "Acepto los Términos de uso y la Política de
privacidad. Entiendo que no se tolera el contenido ofensivo ni el acoso, y que las cuentas que
incumplan pueden ser suspendidas o eliminadas." The "Crear cuenta" button stays DISABLED until
it is ticked. Both documents are one tap away from that screen and from the sign-in screen.
The accepted version and the date are stored on the account.

  Terms: https://todosbien.app/terminos  (zero tolerance is section 5.1)
  Privacy: https://todosbien.app/privacidad

AUTOMATED CONTENT FILTERING (guideline 1.2)
Every piece of user-generated content is checked on the SERVER before it is stored: chat
messages, the message attached to a status, display names and group names. Text containing
directed insults, discriminatory slurs or threats is rejected outright -- it is never stored
and never delivered -- and the author is told why, on the spot.

The check runs in the database (a trigger), not in the app, so it cannot be bypassed by a
modified client.

To see it: open any chat, send the word "conchatumadre" (a common insult in Peru). The message
is rejected with an explanation and the text is returned to the input box.

Note on scope: the filter targets aggression, not profanity. During an earthquake people write
things like "se cayó la pared, mierda, hay un herido" ("the wall came down, shit, someone is
hurt") and that must go through -- blocking it would silence the user in the exact minutes this
app exists for. Our terms explain this distinction in section 5.1.

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

SCREEN RECORDING (requested in the September 5, 2026 review)
A recording captured on a physical device, showing the terms agreement presented before
registration, the mechanism to flag content, and the mechanism to block a user:
[PEGAR ACÁ EL ENLACE DE YOUTUBE — no listado]

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
In-app path: Home -> GEAR ICON -> tap the profile card at the top -> SEGURIDAD -> "Borrar mi
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

Ninguno es hipotético: los cinco salen de reglas escritas de Apple y de cómo está construida
la app hoy. **Y dos dejaron de ser probables el 2026-09-05: pasaron a ocurridos.**

| # | Riesgo | Por qué aplica acá | Estado |
|---|---|---|---|
| 1 | **Guideline 1.2 — contenido generado por usuarios sin moderación** | Hay chat entre personas | 🔴 **Rechazado el 2026-09-05 sobre el build 11**, después de que esta misma fila lo diera por cerrado. ✅ Reabierto y cerrado de verdad el 2026-09-06 — ver el recuadro de abajo |
| 2 | **Guideline 5.1.1(iv) — botones que empujan a conceder un permiso** | La app pide ubicación y contactos con una pantalla propia antes del diálogo del sistema | 🔴 **Rechazado el 2026-09-05.** ✅ Corregido el mismo día: los tres botones que Apple citó dicen «Continuar» |
| 3 | **Guideline 3.1.2 — paywall sin Términos ni Privacidad** | El paywall vive en RevenueCat, y ahí es un campo que se olvida | ✅ **Cerrado el 2026-08-28.** Los dos enlaces y «Restaurar compras» están en el pie |
| 4 | **Guideline 5.1.1(v) — borrar la cuenta** | La app crea cuentas | ✅ Hecho, y la ruta está en §2 |
| 5 | **Guideline 2.1 — no pudimos probar la función principal** | Requiere un sismo real | ✅ Cubierto por la nota del simulacro |

> 🔴 **Qué faltaba en la 1.2, y por qué esta tabla decía lo contrario.**
>
> Hasta el 2026-09-05 la fila 1 decía «✅ Cerrado el 2026-08-24». Era verdad a medias, y la
> mitad que faltaba costó un rechazo entero.
>
> Apple pide **cuatro** cosas, no dos. Denunciar y bloquear estaban, y estaban bien. Las otras
> dos no existían:
>
> | Lo que pide la guía | Estado el 2026-09-05 |
> |---|---|
> | Denunciar contenido | ✅ existía — mantener apretado el mensaje, migración 0020 |
> | Bloquear a alguien | ✅ existía |
> | **Aceptar los términos antes de registrarse**, y que digan tolerancia cero | 🔴 **no existía.** No había un solo enlace legal en ninguna pantalla de registro o ingreso |
> | **Un método de filtrado de contenido** | 🔴 **no existía** |
>
> **La lección, que es la misma que ya cuesta caro en este archivo:** un requisito con varias
> partes se da por cerrado cuando se cumple la parte que uno ya estaba construyendo. La fila
> decía «denunciar y bloquear existen» y de ahí saltaba a «cerrado», sin volver a leer la guía
> entera. Al escribir «✅ cerrado» conviene copiar **la lista completa** de lo que exige la
> regla y tacharla ítem por ítem.
>
> Cerrado el 2026-09-06 con la casilla de aceptación (`sign-up.tsx` + migración 0043) y el
> filtro de contenido del servidor (migración 0044).

> **Guideline 5.1.1(iv), en una línea, para que no vuelva.** El botón que dispara el diálogo de
> permisos del sistema **no puede llamar a conceder**: nada de «Permitir ubicación» ni «Revisar
> mi agenda», solo palabras neutras como «Continuar». La explicación de para qué sirve el
> permiso va en el texto de arriba, que es donde Apple sí la quiere. Hay un comentario 🔴 en
> cada uno de los tres botones para que nadie los «mejore» de vuelta.

---

## 5 · Antes de tocar «Submit for Review»

- [x] La cuenta demo existe, entra, y tiene red, plan y chat sembrados — **repuesto el
      2026-08-28**; volver a contarlo el día del envío con la consulta de §1. **Contado el
      2026-09-06: 4 contactos aceptados, 2 grupos, 7 mensajes.** Los cuatro contactos siguen sin
      dispositivo, así que los cuatro muestran «No recibe notificaciones» — la nota lo explica
- [ ] **El correo de la cuenta demo en las notas es `todosbienapp@gmail.com`.** Hasta el
      2026-08-28 este documento decía `appreview@todosbien.app`, que **no existe**: pegado tal
      cual, era el rechazo «no pudimos entrar» garantizado
- [ ] La contraseña de la cuenta demo está pegada en el formulario (no en git)
- [x] `qa.simulador@example.com` borrado — 2026-08-28
- [x] El paywall de RevenueCat tiene los enlaces a Términos y Privacidad — 2026-08-28
- [x] Decidido qué se hace con la moderación de §4.1 — **las cuatro partes**, no dos:
      denunciar, bloquear, aceptar términos y filtrar. Las dos últimas se agregaron el
      2026-09-06 tras el rechazo
- [ ] La nota le explica al revisor **por qué la red se ve quieto** y lo manda al
      simulacro. Sin eso, la app parece vacía en un día sin sismos
- [ ] El build subido es **posterior a los arreglos del 2026-08-27/28**: los textos de permiso
      viajan en el `Info.plist`, y los cuatro bugs de interfaz viajan en el bundle de JS

### Lo que agregó el rechazo del 2026-09-05

- [x] 🔴 **El sitio está subido ANTES que el build.** Los términos pasaron a **v1.3** (sección
      5.1, con el filtro) y la app enlaza ahí. Si el build sale primero, el revisor toca el
      enlace y lee la versión sin el filtro que la nota le promete — **comprobado el 2026-09-06
      contra la URL pública**: `https://todosbien.app/terminos` sirve «Versión 1.3» y su §5.1
      describe el filtro automático
- [x] 🔴 **`TERMS_VERSION` de `src/lib/config.ts` coincide con la cabecera de
      `terminos/index.html`.** Hoy las dos dicen `1.3`. Se mueven juntas o la aceptación queda
      registrando una versión que no existe
- [ ] 🔴 **El video está grabado en un teléfono físico y su enlace está pegado en las notas.**
      Apple lo pidió explícitamente y pide dejarlo para todos los envíos futuros. Tiene que
      mostrar: los términos presentados **antes** de registrarse (con el botón apagado y
      encendiéndose al marcar la casilla), denunciar un mensaje, y bloquear a una persona.
      Conviene sumar el filtro rechazando un insulto: no lo pidieron grabar, pero es la pieza
      más difícil de creer sin verla
- [ ] En el teléfono más chico disponible, el bloque legal de la pantalla de ingreso se alcanza
      sin pelearse con el scroll
- [x] ~~`is_premium` de la cuenta demo vuelve a **`false`**.~~ 🔴 **Se invirtió el 2026-09-10:
      ahora tiene que estar en `true`.** El criterio viejo era que sin Premium el revisor ve el
      paywall; con la pestaña Preparación, sin Premium el revisor ve **el candado en lugar de la
      función principal de la versión**, que es el rechazo *«we were unable to review»*. El
      paywall sigue alcanzable desde el engranaje → «Obtener Premium», y la nota de §2.1 lo dice.
      **Verificado el 2026-09-10: `true`.**
      ⚠️ Ojo con RevenueCat: un `TRANSFER` ya le arrancó el Premium a esta cuenta una vez
      (2026-09-06). Es una columna que solo escribe el webhook, así que **hay que volver a
      contarla el día del envío**, no darla por puesta
- [ ] 🔴 **El Centro de Preparación de la cuenta demo no está en 0 %.** Un Centro vacío no se
      puede revisar ni fotografiar. Tiene que dar ~51 %, con la mochila a media asta para que el
      dibujo del nivel se vea lleno hasta la mitad:
      ```sql
      -- con la sesión de la cuenta demo
      select public.get_household_preparedness() ->> 'total';   -- ~51
      ```
- [ ] 🔴 **Ninguna ruta de las notas dice «Ajustes» como pestaña.** Ajustes se abre desde el
      engranaje de Inicio desde el 2026-09-10. Revisar §2.1, §2.2 y el guion del video: es
      **exactamente** el error que costó el ciclo del 2026-09-05, repetido con otra pantalla
- [x] 🟡 ~~El `display_name` de la cuenta demo es «Carlos», y uno de sus cuatro contactos es
      «Carlos Medina».~~ **Renombrado a «Renzo» el 2026-09-10.** El revisor se veía a sí mismo
      con el mismo nombre que el contacto que a propósito está **sin confirmar y sin ubicación**,
      que es la mitad del producto que tiene que entender. Ahora §1 dice la verdad

---

## 6 · El guion del video

**Teléfono físico, no simulador.** Una sola toma de ~2 minutos. Empezar con la app
desinstalada o con la sesión cerrada, porque la primera escena es el registro.

> 🔴 **Actualizado el 2026-09-10.** La toma 4 mandaba a `Ajustes → Personas bloqueadas` por la
> pestaña, que ya no existe: **hay que grabar el engranaje de Inicio**. Y se sumaron dos tomas
> del Centro de Preparación, que es lo que esta versión pide revisar.

| # | Toma | Por qué esa y no otra |
|---|---|---|
| 1 | Abrir → «Crear mi cuenta» → llenar correo y contraseña. **Quedarse quieto unos segundos con «Crear cuenta» apagado.** Marcar la casilla y que se vea encenderse | El contraste **es** la toma. Una casilla ya marcada no demuestra nada: lo que Apple quiere ver es que sin aceptar no se puede seguir |
| 2 | Tocar «Términos de uso» y que se abra la página. Volver | Prueba que el documento existe y es alcanzable, no solo que hay una frase |
| 3 | Entrar a un chat, **mantener apretado** un mensaje ajeno → «Denunciar mensaje» → motivo → enviar | «A method for users to flag objectionable content» |
| 4 | Pestaña **Red** → un contacto → «Bloquear» → confirmar. Y mostrar **el engranaje de Inicio → Personas bloqueadas** | «A mechanism to block abusive users». Lo segundo prueba que es reversible, que es lo que evita la pregunta siguiente. ⚠️ **Grabar el engranaje, no una pestaña de Ajustes** |
| 5 | En un chat, escribir **`conchatumadre`** y enviar. Sale el aviso y el texto vuelve al campo. Después mandar algo normal | No lo pidieron grabar. Es la precaución más difícil de creer sin verla, y mostrarla contesta la pregunta antes de que la hagan |
| 6 | **Pestaña Preparación** → que se vean el 51 % y las seis tarjetas → entrar a **Mochila** y marcar un ítem, que el dibujo suba | La función nueva de la versión. Sin esta toma el revisor tiene que buscarla, y lo que no se encuentra se rechaza |
| 7 | Volver a Inicio → **engranaje** → «PRÁCTICA» → «Hacer un simulacro» → «Solo yo» → que se vea la franja amarilla | Prueba en un gesto la ruta nueva de Ajustes **y** cómo revisar la app sin un sismo. Dos respuestas en una toma |

**Tres detalles que deciden si la aceptan:** dispositivo físico, rótulos **en inglés** sobre
cada sección —la app está en español y el revisor no lo lee— y subirla a YouTube **como no
listada**, que el formulario acepta. El enlace va en *App Review Information → Notes* y **se
queda ahí para todos los envíos futuros**: la nota de Apple lo pide explícitamente.
