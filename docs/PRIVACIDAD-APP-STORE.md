# App Privacy (Nutrition Labels) — hoja de respuestas

Lo que hay que responder en App Store Connect → **App Privacy**, dato por dato, con el
motivo de cada respuesta. Escrito el **2026-08-24**.

**Por qué existe este documento y no se contesta el formulario a ojo:** la declaración tiene
que coincidir con tres cosas a la vez — lo que el código hace, lo que dice
`../todos-bien-website/privacidad/index.html` y lo que dicen los textos de permiso de la app.
Si una de las tres se mueve, las otras dos mienten. Ya pasó una vez, con la lectura inicial
de ubicación que la pantalla de permisos omitía (ESTADO, bitácora del 2026-08-21).

---

## 1 · Las tres respuestas que definen todo el formulario

Antes de la tabla de datos, Apple hace tres preguntas por cada uno. Para esta app las
respuestas son siempre las mismas y conviene tenerlas claras:

| Pregunta | Respuesta | Por qué |
|---|---|---|
| ¿Se usa para **rastreo** (*Tracking*)? | **NO**, en todos los datos sin excepción | «Tracking» en el vocabulario de Apple es cruzar los datos con los de otras apps o con datos de un *data broker* para publicidad o medición. La app no tiene SDK de publicidad, no comparte con brokers y no usa el IDFA. Un solo «sí» acá dispara App Tracking Transparency y el diálogo del sistema |
| ¿Está **vinculado a la identidad** (*Linked to You*)? | **SÍ**, en todos los datos que se guardan en el servidor | Todo cuelga de una cuenta con correo. No hay nada anónimo salvo lo que nunca sale del teléfono |
| ¿Cuál es el **propósito**? | **App Functionality** en todo | No hay analítica, ni personalización, ni publicidad. Si algún día entra Sentry, aparece *Analytics* / *App Functionality* para diagnósticos y **hay que volver acá** |

---

## 2 · Datos que SÍ se recolectan

| Categoría de Apple | Tipo | Qué es en esta app | Vinculado | Rastreo | Propósito |
|---|---|---|---|---|---|
| Contact Info | Email Address | El correo de la cuenta | Sí | No | App Functionality |
| Contact Info | Name | El nombre para mostrar que elige la persona | Sí | No | App Functionality |
| Contact Info | Phone Number | Opcional. Se guarda en E.164 y sirve para que te encuentren | Sí | No | App Functionality |
| Location | Precise Location | Latitud y longitud. **Una** lectura al conceder el permiso y **una** por cada sismo que aplica | Sí | No | App Functionality |
| User Content | Other User Content | El estado reportado y su mensaje opcional; los mensajes de chat; el plan de acción | Sí | No | App Functionality |
| Identifiers | User ID | El UUID de la cuenta, y el token de push del dispositivo | Sí | No | App Functionality |
| Purchases | Purchase History | Lo maneja RevenueCat para saber si la suscripción está activa | Sí | No | App Functionality |

### Los dos casos que se responden mal

**Contactos (la agenda).** Se declara **Contacts → Contacts**: **NO se recolecta.**

Es la respuesta correcta y hay que poder sostenerla: la app lee la agenda **en el
dispositivo**, calcula un hash SHA-256 de cada número y envía **solo los hashes** a una edge
function que responde con las coincidencias. Ningún nombre, ningún número y ninguna lista
sale del teléfono, y no se guarda nada de la agenda en el servidor.

> Matiz que conviene tener anotado por si App Review pregunta: el `phone_hash` **propio** sí
> se guarda, y eso ya está declarado arriba como Phone Number, que es la respuesta
> conservadora y correcta. Lo que no se guarda es la agenda de terceros.

**Ubicación.** Se declara **Precise Location**, no *Coarse*. Aunque la captura use
`Accuracy.Balanced`, lo que se guarda son coordenadas reales y el permiso pedido es el de
ubicación precisa. Declarar *Coarse* para que se vea mejor sería falso.

---

## 3 · Datos que NO se recolectan — y hay que dejar sin marcar

Health · Fitness · Financial Info (los cobros los procesa Apple; nosotros nunca vemos una
tarjeta) · Browsing History · Search History · Sensitive Info · Contacts · Photos or Videos ·
Audio Data · Gameplay Content · Customer Support · Emails or Text Messages (los mensajes del
chat van en *User Content*, no acá: esta categoría es sobre correo y SMS del dispositivo) ·
Advertising Data · Product Interaction · Crash Data · Performance Data · Other Diagnostic
Data.

> **Crash Data y Performance Data están en NO porque hoy no hay Sentry.** Es de lo primero
> que cambia cuando se integre: se marcan como recolectados, vinculados o no según cómo se
> configure, con propósito *App Functionality*. Está anotado en `QUE-FALTA.md`.

---

## 4 · Justificación de ubicación en segundo plano — texto en inglés

Apple pide explicar por qué la app declara `UIBackgroundModes` y pide *Always*. Va en **App
Review Information → Notes**, y también sirve si piden aclaración después. Es la traducción
del texto de ESTADO §1.2:

```
Todos Bien requests background location access in order to capture a SINGLE position at the
moment a seismic event affects the user's area.

The capture is triggered by a server-sent silent push notification tied to an earthquake
verified by the Geophysical Institute of Peru (IGP) or the USGS. When that notification
arrives, a background task calls the location API exactly once and uploads the result.

The app does NOT register continuous location updates: it never calls
startLocationUpdatesAsync(), and it does not use geofencing or significant-change location
monitoring. It stores only the most recent position, which is visible exclusively to the
contacts the user has explicitly accepted.

The purpose is to let family members know where a person was in the minutes following an
earthquake, when phone networks are typically saturated and calls do not go through.

The app also takes one initial reading when the user grants the permission, so that the
alert radius rule has a position to evaluate. This is disclosed in the permission screen
before the system prompt is shown.
```

> El último párrafo es el que casi se omite y es el que más importa: es la lectura inicial
> que dispara la propia pantalla de permisos. Omitirlo acá repetiría, frente al revisor, el
> error que ya se corrigió dentro de la app.

---

## 5 · Coherencia: las cuatro superficies que tienen que decir lo mismo

Si se cambia una, se revisan las cuatro. Es la lista de verificación de cada auditoría:

| Superficie | Dónde vive |
|---|---|
| Los textos del diálogo del sistema | `app.json` → plugin `expo-location` y `expo-contacts` |
| La pantalla de permisos y la de Ajustes | `src/app/(onboarding)/permissions.tsx`, `src/app/(tabs)/settings.tsx` |
| La política de privacidad publicada | `../todos-bien-website/privacidad/index.html` |
| Esta declaración | App Store Connect → App Privacy |

**Verificado el 2026-08-24:** las cuatro dicen lo mismo — una lectura al conceder el permiso,
una por cada sismo que aplica, capturas manuales solo durante una alerta activa, y nada más.

---

## 6 · Eliminación de cuenta

Apple pregunta si la app permite crear cuenta y, si la respuesta es sí, exige poder borrarla
desde dentro (guía **5.1.1(v)**).

| Pregunta | Respuesta |
|---|---|
| ¿Se pueden crear cuentas? | Sí |
| ¿Se puede borrar la cuenta desde la app? | Sí |
| ¿Dónde? | **Ajustes → tocar el perfil → SEGURIDAD → Borrar mi cuenta** |
| ¿Qué se borra? | Todo lo que cuelga de la cuenta, por `on delete cascade`, verificado contra el esquema real (ESTADO §1.1.3) |
| ¿Qué NO se borra, y por qué? | `revenuecat_events`, la bitácora de facturación, que tiene que sobrevivir para resolver un reembolso o un reclamo. Solo la lee `service_role`. **Está dicho así en la política de privacidad** |

También existe la página pública `https://todosbien.app/eliminar-cuenta`, que Google Play
exige y Apple no. No estorba tenerla.
