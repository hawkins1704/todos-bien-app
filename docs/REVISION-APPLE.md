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
| Simulacros | 0 de 3 usados: el revisor tiene los tres disponibles |
| Premium | **No.** Tiene que poder ver el paywall y probar la compra en sandbox |

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

```
WHAT THIS APP IS
Todos Bien is a post-earthquake family coordination app. It is NOT an early warning system:
notifications arrive a few minutes AFTER an earthquake, once the Geophysical Institute of
Peru (IGP) or the USGS publishes the event. The app lets people tell their family they are
safe, see who has responded, and share their location with the contacts they accepted.

HOW TO REVIEW THE MAIN FEATURE WITHOUT WAITING FOR AN EARTHQUAKE
Real alerts depend on a real seismic event, so the app includes a guided DRILL that walks
through the exact same flow. Please use it:
  Home tab -> "Simulacro" (Drill) -> start.
The drill shows the alert banner, the status buttons and the circle screen exactly as a real
alert does. It is clearly labeled as a drill and never notifies other users unless the tester
explicitly chooses that option.

DEMO ACCOUNT
Email: todosbienapp@gmail.com
Password: [ver el gestor de contraseñas]
The account already has an accepted circle of 4 contacts, an action plan and a chat thread,
so every screen has content.

WHY THE CIRCLE LOOKS QUIET
Outside of an active earthquake the app deliberately does NOT display anyone's status or
location. This is a privacy decision, not missing data: we only store where someone was
during an earthquake, so showing a position on a calm day would turn the app into a location
history, which is exactly what we promise not to be. Run the drill above to see statuses,
the status ring and the location card exactly as a real alert shows them.

REPORTING AND BLOCKING (guideline 1.2)
Users can report objectionable content and block other users:
  - Report a message: long-press any message from the other person in a chat -> "Denunciar".
  - Report a person: Circle -> tap the contact -> "Denunciar a esta persona".
  - Block: Circle -> tap the contact -> "Bloquear a esta persona", or right after sending a
    report. A blocked user cannot message you (not even in an existing conversation), cannot
    send you connection requests, and cannot see your status or location. Blocking can be
    undone from Settings -> "Personas bloqueadas"; the blocked user cannot undo it.
  - "Quitar de mi red" is a separate, softer action: it ends the connection but either
    side may send a new request later.
Reports are reviewed within 24 hours. Our terms of service state a zero-tolerance policy for
abusive content: https://todosbien.app/terminos (section 5.1). Contact for reports and
support: todosbienapp@gmail.com

Note that chats are strictly one-to-one between people who BOTH explicitly accepted the
connection. There is no public content, no discovery of strangers and no way to message
someone who has not accepted you.

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
