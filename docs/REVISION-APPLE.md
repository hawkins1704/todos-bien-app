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

### ✅ Creada y sembrada el 2026-08-24

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
| Círculo | 4 contactos con la conexión ya aceptada: **María Salazar** y **Jorge Salazar** en «estoy bien», **Ana Ríos** en «necesito ayuda» con mensaje, y **Carlos Medina** sin confirmar y sin ubicación |
| Plan de acción | Escrito, con punto de encuentro y contacto fuera de la ciudad |
| Chat | Una conversación con María, de cuatro mensajes |
| Simulacros | 0 de 3 usados: el revisor tiene los tres disponibles |
| Premium | **No.** Tiene que poder ver el paywall y probar la compra en sandbox |

> **Por qué Carlos está sin confirmar y sin ubicación, a propósito:** es la mitad del
> producto. Un círculo donde todos dicen «estoy bien» no muestra para qué sirve la app; lo
> que hay que poder ver es la diferencia entre quien respondió y quien no.

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

> Las cuentas de prueba viejas se borran antes de enviar: `qa.simulador@example.com` sigue en
> la base (`QUE-FALTA.md` 2.9). Una cuenta de QA con datos raros que aparezca en el círculo
> del revisor es ruido en el peor momento.

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
Email: appreview@todosbien.app
Password: [ver el gestor de contraseñas]
The account already has an accepted circle of 4 contacts with mixed statuses, an action plan
and a chat thread, so every screen has content.

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
| 1 | **Guideline 1.2 — contenido generado por usuarios sin moderación** | Hay chat entre personas. Apple pide: filtro de contenido ofensivo, forma de denunciar, forma de bloquear y compromiso de actuar en 24 h | 🔴 **Abierto.** Existe eliminar la conexión, que cubre «bloquear»; falta **denunciar** |
| 2 | **Guideline 3.1.2 — paywall sin Términos ni Privacidad** | El paywall vive en RevenueCat, y ahí es un campo que se olvida | 🔴 Abierto (`QUE-FALTA.md` 2.6) |
| 3 | **Guideline 5.1.1(v) — borrar la cuenta** | La app crea cuentas | ✅ Hecho, y la ruta está en §2 |
| 4 | **Guideline 2.1 — no pudimos probar la función principal** | Requiere un sismo real | ✅ Cubierto por la nota del simulacro |

> El 1 es el que puede costar el ciclo. La respuesta más barata es un «Denunciar» en el
> detalle del contacto y en el chat que mande el reporte a una tabla y confirme al usuario —
> no hace falta un panel de moderación para el envío inicial, hace falta que el mecanismo
> exista y que se pueda demostrar.

---

## 5 · Antes de tocar «Submit for Review»

- [ ] La cuenta demo existe, entra, y tiene círculo, plan y chat sembrados
- [ ] La contraseña de la cuenta demo está pegada en el formulario (no en git)
- [ ] `qa.simulador@example.com` borrado
- [ ] El paywall de RevenueCat tiene los enlaces a Términos y Privacidad
- [ ] Decidido qué se hace con la moderación de §4.1
- [ ] El build subido es **posterior** al arreglo de los textos de permiso del 2026-08-24:
      esos textos van en el `Info.plist` y viajan dentro del binario
