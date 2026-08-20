# Estado del proyecto

Documento vivo. La fuente de verdad de **producto** es `spec-app-seguridad-sismos.md`;
este archivo registra **decisiones de implementación**, qué está construido, qué falta
y qué está bloqueado.

- **Proyecto Supabase:** `gfutgfmiwzgjtcrinqwo` — `https://gfutgfmiwzgjtcrinqwo.supabase.co`
- **Expo SDK:** 57 · React Native 0.86 · expo-router 57 (typed routes + React Compiler)
- **Bundle ID iOS:** `com.renzoarroyo.todos-bien` · Apple Team `3S8A8U48YR`

---

## 1. Decisiones de implementación tomadas

### 1.1 Autenticación — correo y contraseña

> **Cambiado el 2026-08-20.** Antes era código OTP al correo, sin contraseñas. Ver
> §1.1.1 para por qué se cambió y qué implicó.

**Decisión:** **Supabase Auth con correo + contraseña**. Apple Sign In y Google Sign In se
agregan más adelante para ampliar los métodos de acceso.

**Por qué así:** no requiere proveedor de SMS (costo variable por mensaje, que la spec
§12 descarta para el MVP). Supabase Auth ya soporta vincular varios proveedores a la misma
cuenta, así que agregar Apple/Google después no obliga a migrar usuarios.

**Consecuencia que hay que tener presente:** el teléfono se captura en el onboarding
pero **no queda verificado**. El match de contactos (spec §3) se apoya en el hash del
número, así que en teoría alguien podría registrar el número de otra persona y aparecer
en los matches de sus contactos. Mitigaciones ya aplicadas:

- `user_settings.phone_hash` tiene índice **único**: un número no puede quedar
  registrado por dos cuentas a la vez.
- Un match **nunca crea la conexión sola**: solo habilita mandar una solicitud, que la
  otra persona tiene que aceptar explícitamente.

Cuando se agregue Apple/Google, evaluar verificar el teléfono por OTP SMS para cerrar
del todo este hueco.

### 1.1.1 De código OTP a contraseña: por qué, y qué se ganó de paso

**El motivo directo es la revisión de Apple.** App Review necesita entrar a la app con una
cuenta de demostración que el equipo de Apple pueda usar. Con acceso por código al correo
eso no funciona: el código llega a una casilla que Apple no tiene, y una cuenta que no se
puede abrir es un rechazo garantizado.

**El motivo de fondo es que el correo dejaba de ser un lujo y pasaba a ser un punto único
de falla.** Con OTP, *cada* ingreso dependía de que un correo llegara. Cualquier problema
del proveedor —y hubo uno, §1.1.2— no degradaba la app: la cerraba entera. Con contraseña,
el correo solo hace falta para confirmar la cuenta una vez y para recuperarla si se olvida.

**Lo que cambió en el cliente:**

| Antes | Ahora |
|---|---|
| `sign-in` (correo) → `verify` (código) | `sign-in` (correo + contraseña) |
| — | `sign-up` (correo + contraseña + repetir) |
| — | `confirm-email` (código, solo si *Confirm email* está prendido) |
| — | `forgot-password` → `reset-password` (código + contraseña nueva) |

**Cuatro decisiones que no son obvias:**

- **Los errores se traducen por `code`, no por el texto.** `src/lib/auth-errors.ts`. El
  mensaje de Supabase cambia entre versiones; el código es contrato estable. Y el fallo del
  proveedor de correo tiene copy propio, porque **no es culpa de quien usa la app y no se
  arregla reintentando**: decirle "revisa tu conexión" la manda a perseguir un problema que
  no tiene.
- **El registro maneja los tres resultados posibles**, no dos. Con *Confirm email*
  prendido, Supabase **no delata** que un correo ya tiene cuenta —sería una forma de
  averiguar quién usa la app— y responde 200 con `identities: []` en vez de un error. Sin
  ese caso, alguien que ya tenía cuenta vería un "listo" y nunca recibiría nada.
- **Recuperar la contraseña usa código, no link.** Un link abre el navegador del teléfono y
  obliga a resolver el deep link de vuelta. Con `{{ .Token }}` todo pasa dentro de la app.
- **El código de recuperación abre sesión antes de que la contraseña esté escrita.** Es
  cómo funciona `verifyOtp({ type: 'recovery' })`, y el efecto es que el guardia de
  navegación saca la pantalla de encima entre las dos llamadas. Por eso la contraseña se
  valida **antes** de mandar nada, un fallo del `updateUser` **cierra la sesión**, y el
  aviso va por `Alert` —lo único que sobrevive a la navegación—. Quedar adentro con la
  contraseña vieja, creyendo que se cambió, es peor que no entrar.
- **Al entrar no se valida el largo de la contraseña**, solo que no esté vacía. Quien la
  creó cuando el mínimo era otro tiene que poder seguir entrando.

### 1.1.2 El bug del correo: verificar el dominio no cambia el remitente

**Síntoma reportado:** pedir el código con un correo cualquiera mostraba *"Error sending
confirmation email"* bajo el campo. Con el correo del dueño funcionaba.

**Causa, leída en los logs de Auth y no adivinada:**

```
POST /otp → 500   user_confirmation_requested
"550 You can only send testing emails to your own email address
 (renzoarroyo09@gmail.com). To send emails to other recipients,
 please verify a domain at resend.com/domains..."
```

Resend estaba mandando desde `onboarding@resend.dev`, su remitente de pruebas, que **solo
entrega a la casilla de la propia cuenta de Resend**. Estaba anotado como pendiente en
§1.6.2 desde el 18/08; lo que faltaba era conectar que ese pendiente **era** este bug.

**El detalle que hace perder tiempo:** el dominio `todosbien.app` ya estaba verificado en
Resend, con DKIM, SPF y MX puestos. No alcanzaba. Verificar el dominio en Resend y elegir
el remitente en Supabase son **dos ajustes en dos paneles distintos**, y el que manda es el
segundo. Hasta cambiar *Sender email* a `hola@todosbien.app`, Resend siguió tratando cada
envío como correo de prueba.

**Verificado contra el proyecto real:** un registro con una dirección que no es la del
dueño pasó de `500 unexpected_failure` a `200`, sin error en los logs. La cuenta de prueba
se borró después; el `on delete cascade` limpió `profiles`, `user_settings` y
`notification_preferences` sin dejar huérfanos.

**La lección:** el mensaje del proveedor estaba completo en los logs de Auth desde el
primer intento fallido. Mirar ahí antes de tocar el cliente habría evitado sospechar del
código de la app, que no tenía nada que ver.

### 1.1.3 Cambiar la contraseña y borrar la cuenta

Las dos son consecuencia directa de §1.1.1: existen porque ahora hay contraseñas y porque
el registro pasó a ser un alta explícita. Viven en **Mi cuenta → SEGURIDAD**.

**Cambiar contraseña** (`src/app/change-password.tsx`). Pide la actual antes de cambiarla.
No es un chequeo cosmético del cliente: se reautentica con `signInWithPassword`, que es una
llamada real que el servidor rechaza si la contraseña no es la correcta. Sin eso, cualquiera
con el teléfono desbloqueado se queda con la cuenta, porque `updateUser` no pregunta nada.
Al terminar corre `signOut({ scope: 'others' })`: cambiar la contraseña sin echar al que ya
entró en otro teléfono no lo saca de ningún lado, que es la mitad del sentido de cambiarla.

**Borrar la cuenta** (`src/app/delete-account.tsx` + migración 0013). Requisito **5.1.1(v)**
de App Store Review: si la app deja crear una cuenta, tiene que dejar borrarla desde adentro
—no por correo de soporte ni por una web—, y esconderlo es causal de rechazo tanto como no
tenerlo.

Cuatro decisiones que no son obvias:

- **La contraseña se valida en Postgres, no en la app.** `delete_my_account(password_attempt)`
  la compara con `extensions.crypt()` contra `auth.users.encrypted_password`. Validarla solo
  en el cliente protege del teléfono desbloqueado pero no de alguien que ya tenga el token de
  sesión y llame al RPC directo; eso únicamente lo cierra el servidor.
- **Una cuenta sin contraseña se borra sin pedirla.** No es un agujero: son las que van a
  entrar por Apple o Google, donde el proveedor ya autenticó y no hay nada que comparar.
- **El borrado es un solo `delete` sobre `auth.users`.** Las 13 tablas cuelgan de `profiles`
  con `on delete cascade` y `profiles` de `auth.users` con la misma regla. Verificado contra
  el esquema real con `pg_constraint`, no asumido.
- **`revenuecat_events` NO se borra.** Es la bitácora de facturación y tiene que sobrevivir
  para resolver un reembolso o un reclamo posterior. Solo la lee `service_role`.

**Verificado contra la base real**, 3/3 aserciones: sin sesión rechaza (`28000`); con sesión
y contraseña incorrecta rechaza (`28P01`) **y el usuario sigue vivo**; con la correcta borra y
arrastra las 6 tablas donde había datos sembrados.

**Y verificado a mano sobre una cuenta real**, que es donde apareció lo que no se veía en las
aserciones: **borrar la cuenta pierde el Premium.** El derecho quedó atado al `app_user_id`
viejo, así que la cuenta nueva arranca en Plan gratuito aunque la suscripción siga cobrándose.
La salida es **«Restaurar compras»**, que dispara un `TRANSFER` en RevenueCat y el webhook
vuelve a marcar `is_premium`. La pantalla ahora lo dice; nadie lo iba a adivinar.

### 1.2 Ubicación — background, pero capturada SOLO cuando ocurre un sismo

**Decisión:** se pide permiso de ubicación **"Siempre" / "Todo el tiempo"**, pero la app
**nunca registra actualizaciones continuas de ubicación**. Se toma **una sola posición**
cuando el backend confirma un sismo relevante para el usuario.

**Por qué:** el escenario real es que el sismo ocurre con la app cerrada. Si la ubicación
solo se pudiera capturar en primer plano, "última ubicación registrada al momento del
sismo" sería casi siempre una ubicación vieja. Al mismo tiempo, capturar la posición de
forma permanente convertiría la app en una app de tracking, que es exactamente lo que
**no** queremos.

**Cómo funciona técnicamente:**

1. La edge function de ingesta detecta el sismo (IGP / USGS) y calcula a quién le aplica.
2. Manda un push con `_contentAvailable: true` (silencioso) + el aviso visible.
3. `expo-notifications` despierta la tarea de background registrada con
   `Notifications.registerTaskAsync`.
4. Esa tarea llama **una vez** a `Location.getCurrentPositionAsync()` y sube el resultado
   con el RPC `report_status`.
5. No se llama nunca a `Location.startLocationUpdatesAsync()`, ni geofencing, ni
   significant-change monitoring.

**Texto de justificación para App Store y Google Play** (guardar para el formulario de
revisión, traducir al inglés al enviar):

> La app solicita acceso a la ubicación en segundo plano para capturar **una única
> posición** en el momento en que un evento sísmico afecta la zona del usuario. La
> captura la dispara una notificación del servidor asociada a un sismo verificado por el
> Instituto Geofísico del Perú o el USGS. La app **no** registra actualizaciones
> continuas de ubicación, no usa geofencing ni monitoreo de cambios significativos, y
> guarda únicamente la posición más reciente, visible exclusivamente para los contactos
> que el usuario aceptó de forma explícita. El propósito es que los familiares puedan
> saber dónde estaba la persona cuando ocurrió el sismo.

**Configuración nativa asociada:**

| Plataforma | Ajuste | Estado |
|---|---|---|
| iOS | `NSLocationAlwaysAndWhenInUseUsageDescription` | configurado |
| iOS | `UIBackgroundModes: remote-notification` (`enableBackgroundRemoteNotifications`) | configurado |
| iOS | `UIBackgroundModes: location` (`isIosBackgroundLocationEnabled`) | **desactivado a propósito** — validar en dispositivo real si hace falta para el fix desde el push |
| Android | `ACCESS_BACKGROUND_LOCATION` (`isAndroidBackgroundLocationEnabled`) | configurado |

**Limitaciones conocidas, a validar en dispositivo real:** iOS limita la frecuencia de
los push silenciosos y no garantiza su entrega, y da ~30 s de ejecución en background.
Por eso la captura usa `Accuracy.Balanced` con timeout y cae a
`getLastKnownPositionAsync()` si no alcanza a obtener un fix nuevo. Además la app
refresca la ubicación al abrirse tras una alerta, como red de seguridad.

### 1.3 Estilos — StyleSheet + tokens de tema

Sin NativeWind ni librerías de UI. `src/theme/tokens.ts` centraliza colores, spacing,
tipografía y radios. Razón: convive limpio con los Native Tabs *liquid glass* de iOS 26
y con `expo-glass-effect`, y no agrega un build step de Metro que se rompe en cada
upgrade de SDK.

### 1.4 Tab bar nativa con efecto glass

Se usa `NativeTabs` de `expo-router/unstable-native-tabs`. En iOS 26 la barra toma el
aspecto *liquid glass* por defecto y **deriva su fondo del contenido detrás**, así que
no se le fija `backgroundColor` (no tendría efecto). Íconos vía SF Symbols (`sf`) en iOS
y Material Symbols (`md`) en Android.

> ⚠️ `NativeTabs` está marcada como **alpha** en SDK 57: los tabs deben definirse
> estáticamente y la API puede cambiar entre SDKs.

**Cómo reservar espacio bajo la tab bar (medido, no estimado).** El contenido se dibuja
*por debajo* de la barra glass, así que cada pantalla tiene que reservar el hueco a mano.
Medido con una sonda en el simulador (iPhone 17 / iOS 26.3):

| Dónde | `insets.top` | `insets.bottom` |
|---|---|---|
| Pantalla dentro de `NativeTabs` | 62 | **83** |
| Pantalla fuera de los tabs (`drill`) | 62 | **34** |

O sea que en iOS **el inset inferior que reporta la pantalla ya incluye la tab bar** (83 =
34 del home indicator + 49 de la barra), y es **por pantalla**, no global. Por eso alcanza
con `insets.bottom` y no hace falta ninguna constante: la que había (`TabBarInset = 60`)
se quedaba 23pt corta y dejaba el contenido pegado a la barra.

En Android no aplica lo mismo: las window insets solo traen la barra de navegación del
sistema, así que la altura de la `BottomNavigationView` va aparte. Eso es lo único que
queda en `TabBarExtraInset` (`ios: 0`, `android: 80`).

**Fórmula:** `paddingBottom: insets.bottom + TabBarExtraInset + Spacing.xl`.

### 1.4.1 Azul de marca propio, no el de Apple

`#0D6BC9` (H 210°, S 88%, L 42%), también aplicado al `tintColor` de la tab bar nativa
para que la barra no use el tint del sistema.

Se eligió más oscuro que el `#007AFF` de iOS para que la app no se lea como una app de
sistema, pero **el motivo de fondo es de accesibilidad**: el accent se usa como color de
texto en enlaces por toda la app, y ni el azul anterior de la app (`#208AEF`, 3.53:1
contra blanco) ni el de Apple (4.02:1) llegan al 4.5:1 que exige WCAG AA. El actual da
5.30:1.

Los contrastes medidos están en la tabla de `src/theme/tokens.ts`. Dos cosas aprendidas
al elegirlo, anotadas ahí también:

- Un primer intento usó H 216.5° y **se leía morado**. Al oscurecer un azul hay que bajar
  la luminosidad sin correr el matiz hacia el índigo.
- `accentSoft` y el accent del tema oscuro se derivan del mismo H/S moviendo solo la
  luminosidad. Mezclar con blanco o negro desatura y ensucia el tono.

### 1.4.2 🔴 El spinner de pull-to-refresh se quedaba trabado al volver del segundo plano

**Lo que se veía (reportado el 2026-08-20, con capturas):** abrir la app después de un
rato dejaba el spinner de tirar-para-refrescar colgado arriba, con todo el contenido
corrido hacia abajo, sin que nadie hubiera tirado de nada. Pasaba en **todas** las
pantallas con pull-to-refresh. Cambiar de pestaña y volver lo enderezaba, porque eso
fuerza un layout nuevo — el arreglo por accidente que confirma dónde estaba el problema.

**La causa no era de estilos.** `RefreshControl.refreshing` no es un indicador de "hay una
sincronización en curso": es la respuesta visual a un gesto. La Home y Círculo lo ataban a
`syncing`, una bandera global de `AppDataProvider`, y Sismos lo prendía dentro de `load()`.
Con eso, **cualquier** refresco automático lo encendía: arrancar la app, volver del segundo
plano (`AppState` → `active`), recuperar la red, o incluso aceptar una solicitud en Círculo.

Prenderlo por código hace que iOS empuje el contenido hacia abajo con una animación. Si eso
ocurre mientras la vista no está en pantalla —la app volviendo del segundo plano, o una
pestaña que `react-native-screens` tiene desmontada— la animación nunca corre hasta el
final, y al apagarse `refreshing` el scroll se queda corrido con el spinner a la vista.

**Qué se cambió.** El estado del spinner vive ahora en `usePullToRefresh`
(`src/hooks/use-pull-to-refresh.ts`) y **solo lo enciende el gesto**; se apaga cuando la
promesa de la acción termina, falle o no. Los refrescos automáticos pasaron a ser
silenciosos: la lista se reemplaza sola cuando llegan los datos, que es exactamente lo que
se espera de una caché que se revalida sola (§1.6.4.1). Lo usan las cuatro pantallas —
Home, Círculo, Chats y Sismos.

De paso se **borró `syncing` del contexto**, que quedaba sin un solo consumidor. No es
limpieza cosmética: era la trampa a la vista para que el próximo `RefreshControl` la
volviera a atar, y además hacía re-renderizar todo el árbol bajo `AppDataProvider` dos
veces por sincronización de fondo. Quien necesite saber cuándo terminó un refresco tiene
la promesa que devuelve `refresh()`.

> Lo que **no** se tocó: los disparadores. Volver del segundo plano sigue refrescando —eso
> existe por una razón real, ver §1.6.3.1 y §1.6.4—; lo único que cambió es que ya no
> dibuja un spinner que nadie pidió.

### 1.5 Sin toggle de tema claro/oscuro

El mockup de Figma Make incluye un botón para alternar tema. **No se implementa**: la app
respeta el tema del sistema (`userInterfaceStyle: automatic`). Queda para después.

### 1.6 Escala — sin tabla de "alerta por usuario"

Un sismo que afecta a 200k personas generaría 200k filas por evento. En su lugar
`user_status.quake_event_id` guarda a qué sismo corresponde el último reporte, y
"sin confirmar" se **deriva** en el cliente: si ese id no es el del sismo activo, la
persona todavía no confirmó. Así una alerta nueva no reescribe ninguna fila.

### 1.6.1 Correo: SMTP propio con Resend (obligatorio, no opcional)

> **Actualizado el 2026-08-20.** El acceso ya no es por código (§1.1.1), así que el correo
> dejó de ser la puerta de entrada. Sigue haciendo falta para **confirmar la cuenta** y
> para **recuperar la contraseña**, y todo lo de abajo sobre el SMTP sigue vigente.

**Por qué hizo falta SMTP propio.** Desde el **3 de junio de 2026**, los proyectos free
*nuevos* de Supabase no pueden editar las plantillas de correo si usan el SMTP incluido.
Este proyecto es del 17 de agosto, así que está alcanzado. La excepción oficial del
changelog: *"Free-tier projects that configure their own SMTP provider can continue to
customize templates freely."*

Y además el SMTP por defecto son **2 correos por hora**, confirmado en la práctica: al
pedir un código la API respondió `over_email_send_rate_limit`. Supabase aclara que ese
servicio *"no está pensado para producción"*.

Con `{{ .Token }}` en la plantilla el correo **no lleva ningún link**, así que el
problema del redirect a `localhost` en móvil desaparece sin tocar código.

Guía paso a paso: **`docs/GUIA-CORREO-RESEND.md`**.

> ⚠️ **Las plantillas que importan cambiaron con el paso a contraseña.** Ahora son
> *Confirm signup* (cuenta nueva) y ***Reset Password*** (recuperar contraseña). La de
> *Magic Link* ya no se usa. Las dos vigentes tienen que mandar `{{ .Token }}`; la de
> *Reset Password* viene de fábrica con `{{ .ConfirmationURL }}`, así que si se olvida, la
> app pide un código de 8 dígitos y a la persona le llega un link.

### 1.6.2 Dominio propio: resuelto para el correo, pendiente para las invitaciones

El dominio `todosbien.app` está verificado en Resend y el remitente de Supabase es
`hola@todosbien.app`. Eso cierra el bloqueo del correo (ver §1.1.2, que documenta el bug
que causó tenerlo a medias).

Queda pendiente el otro uso del dominio, que **no está relacionado con el correo**:

| Dónde | Qué falta |
|---|---|
| `src/lib/config.ts` → `INVITE_BASE_URL` | Apunta a `https://todosbien.app/i`, que **todavía no existe**. Es el link de invitación de la spec §3 y necesita una landing page con botones a las tiendas |

### 1.6.3 La ubicación se captura sola, no solo al tocar un botón

Había un hueco entre lo que la app promete y lo que hacía. **Conceder el permiso de
ubicación no guarda ninguna posición**: es solo el derecho a leer el GPS. El onboarding
pedía el permiso y anotaba el nivel concedido, pero nunca tomaba una lectura, y la
ubicación solo se capturaba dentro del handler de "Mi estado".

Dos consecuencias reales:

- Quien abría la app después de un sismo y no tocaba nada **no dejaba ningún rastro de
  dónde estaba**, que es justamente lo que la app promete hacer.
- Un usuario recién registrado tenía `user_status.latitude` en NULL, y la regla del radio
  de `get_active_alert()` exige `my_lat is not null`. O sea que **solo recibía alertas
  por la regla nacional** (magnitud ≥ 6.0), nunca por cercanía.

`src/lib/alert-response.ts` lo resuelve con tres funciones:

| Función | Cuándo corre |
|---|---|
| `ensureInitialLocation()` | Al conceder el permiso en el onboarding, al terminarlo, y en cada refresco vía `syncLocationPermission()`. Idempotente. |
| `syncLocationPermission()` | En cada refresco de `app-data`. Relee el permiso del SO y siembra la primera posición. Ver §1.6.3.1. |
| `captureLocationForActiveAlert()` | Al detectar una alerta activa, sin esperar a que la persona toque nada. |

Detalles que importan:

- Se guarda con estado `unconfirmed` a propósito. El contador "X/Y confirmados" exige
  `status <> 'unconfirmed'`, así que la persona sigue figurando como no confirmada, pero
  su círculo ya ve dónde estaba.
- Aplica el **jitter** de la spec §6 (`ALERT_WRITE_JITTER_MS`), que hasta ahora estaba
  declarado pero sin usar en ningún lado.
- Vuelve a chequear el estado **justo antes de escribir**. Entre el jitter y el fix del
  GPS pueden pasar más de 20 s, y si la persona tocó "estoy bien" en ese rato la
  escritura automática lo pisaría: `enqueue('status')` borra el estado anterior del
  outbox, así que el reporte manual se perdería antes de subir.
- **No** se *refresca* una ubicación ya guardada fuera de un sismo. Eso sería tracking de
  bajo grado y contradice lo que le prometemos al usuario en la pantalla de permisos. El
  costo es que la posición puede quedar vieja si la persona se muda de ciudad; lo cubre la
  regla nacional, que no depende de la ubicación.
- La distinción fina, que es la que permite llamar a `ensureInitialLocation()` seguido:
  **sembrar** la primera posición (una vez en toda la vida de la instalación) no es lo
  mismo que **refrescarla**. La función corta al instante si ya hay una guardada, así que
  llamarla en cada refresco no enciende el GPS ni una sola vez de más.

### 1.6.3.1 🔴 El hueco NO estaba cerrado: el callejón sin salida de la ubicación

Lo de arriba se dio por resuelto el 2026-08-18. **Estaba resuelto a medias**, y un sismo
real lo destapó.

**Qué pasó.** El 2026-08-19 a las 05:28:02 (Lima) el IGP reportó un **M4,8 a 42 km al SO
de Lurín** (`2026-565`), a **49,1 km** del centro de Lima. El usuario tenía radio 150 km y
umbral 4,5. Debía alertar. **No alertó nada**, ni siquiera al abrir la app.

**Por qué.** `user_status.latitude` estaba en NULL y `location_permission_level` en
`'none'`. Las tres ramas de `get_active_alert()` fallaron: mundial (no premium), nacional
(4,8 < 6,0) y radio (**exige `my_lat is not null`**, así que ni se evalúa). Devolvió cero
filas. La regla estaba bien; faltaba el dato.

**El bug de verdad, que es de diseño.** `ensureInitialLocation()` solo se llamaba desde el
onboarding. Quien lo saltaba —o denegaba el permiso y lo activaba después desde los
Ajustes del sistema— quedaba sin coordenadas **para siempre**:

```
sin ubicación → la regla del radio no se evalúa → nunca hay alerta activa
    → captureLocationForActiveAlert() nunca corre → sin ubicación
```

Cerrado sobre sí mismo. La **única** salida era reinstalar la app. Y en Ajustes el bloque
de permisos era un texto informativo con un enlace a los Ajustes del SO: aunque la persona
concediera el permiso ahí, nadie lo releía ni tomaba una lectura.

Peor todavía: era **silencioso**. La app no se ve rota, solo deja de alertar de los sismos
cercanos —justo los que se sienten— sin decir nada.

**Cómo se cerró.**

| Dónde | Qué cambió |
|---|---|
| `src/lib/alert-response.ts` | Nueva `syncLocationPermission()`: relee el permiso del SO, lo escribe si cambió y siembra la primera posición. |
| `src/context/app-data.tsx` | Se llama en cada `refresh()`, en su propio `try`: si la sincronización falla por red, el permiso igual se revisa. |
| `src/app/(tabs)/settings.tsx` | El bloque de permisos muestra el estado real y **advierte lo que se pierde**. Distingue si el SO todavía puede preguntar (botón) o ya no (ir a Ajustes). |
| `src/app/(tabs)/index.tsx` | El recordatorio discreto de la Home toma la ubicación como prioridad máxima. Se calla en cuanto hay posición. |
| `src/lib/location.ts` | `getPermissionState()` agrega `canAskAgain`. Un botón "Permitir ubicación" que no abre ningún diálogo deja a la persona sin saber qué hacer. |

**La lección, que vale más que el fix:** la advertencia de Ajustes se dispara por **falta
de posición**, no por falta de permiso. Son cosas distintas y la que rompe las alertas es
la primera — conceder el permiso no guarda ninguna coordenada. Ese mismo error conceptual
es el que generó el hueco original y el que hizo creer que estaba cerrado.

### 1.6.4 Noticias Sísmicas (pestaña informativa)

Sección tipo feed, **separada del flujo de alertas**: no dispara nada ni pide confirmar
estado. Toggle Nacional / Global.

| | Fuente | Ventana | Piso de magnitud | Acceso |
|---|---|---|---|---|
| Nacional | IGP | 7 días | **ninguno** | Gratis |
| Global | USGS | 7 días | ≥ 4.5 | **Premium** |

**Tres cosas que salieron de medir los datos reales antes de construir:**

1. **El feed del USGS no cubría 7 días.** La ingesta usaba solo `2.5_day` (ventana de
   24 h), así que la lista Global se habría llenado de a un día por vez y habría estado
   casi vacía la primera semana. Se agregó `4.5_week`, **manteniendo** `2.5_day`: el
   umbral de alerta mínimo configurable es 4.0 y el feed semanal arranca en 4.5, así que
   sin el diario se perderían los M4.0–4.4 cercanos.
2. **El volumen real es 3× lo estimado.** Con piso 4.5 no son ~45 eventos/semana sino
   **143** (~20/día), medido contra el feed. Se decidió mantener 4.5 igual. Para
   referencia: ≥5.0 daría 60/semana, ≥5.5 daría 20.
3. **Escribir todo en cada corrida habría sido caro.** El feed semanal devuelve ~143
   eventos y el cron corre cada 2 minutos: eso son cientos de miles de tuplas muertas por
   día sin cambiar nada. La ingesta ahora compara contra lo ya guardado y solo escribe lo
   nuevo o lo que cambió de magnitud (el USGS revisa magnitudes ya publicadas). Verificado:
   en régimen, el IGP escribe **0** filas por corrida.

**Reutilización:** el detalle de un sismo usa el MISMO componente que el banner de alerta
de la Home (`src/components/quake-card.tsx`), con un prop `tone`. En modo `alert` es rojo
y urgente; en `neutral` el color lo da la magnitud. La distinción importa: pintar de rojo
un sismo de hace cinco días haría parecer que hay una alerta activa cuando no la hay.

**Bloqueo premium:** la pestaña Global **nunca se esconde**. Sin premium muestra la lista
ofuscada con candado y el paywall encima. El corte es del lado del servidor
(`get_quake_feed` valida `is_premium`), no solo de la UI.

> Nota honesta: los datos del USGS son públicos, así que esto no es un secreto
> criptográfico — es la puerta por la que entra la app, y respetarla en el servidor evita
> que baste con tocar una variable del cliente.

**Bug encontrado el 2026-08-19: la lista se congelaba.** El feed se cargaba solo con
`useFocusEffect`, que dispara **únicamente al enfocar la pantalla por navegación**. Si la
app se manda a segundo plano con esta pestaña ya abierta y se vuelve horas después, el
foco nunca cambia y la lista queda igual que como se dejó. Y era la única lista de la app
**sin pull-to-refresh**, así que tampoco había forma de forzarla.

Se vio con el M4,8 de Lurín (§1.6.3.1): el sismo estaba en la página del IGP y en nuestra
base a los 6 minutos, y la pestaña Nacional seguía mostrando la lista vieja.

Corregido con un listener de `AppState` que recarga al volver del segundo plano, y
`RefreshControl` en la lista **y también en los estados de error y de lista vacía** — un
error sin pull-to-refresh obligaba a cambiar de pestaña y volver para reintentar. Detalle:
en `contentContainerStyle` el centrado va con `flexGrow: 1`, porque `flex: 1` fija la
altura al viewport y mata el gesto de arrastre.

### 1.6.4.1 Cuándo se pide el feed: la pestaña recargaba en cada foco

**Lo que se veía:** entrar a Noticias Sísmicas recargaba la lista entera y la dejaba en
blanco con un spinner, cada vez, aunque se volviera a los cinco segundos.

**Medido antes de tocar nada**, contando las llamadas a `get_quake_feed` en los logs de un
solo usuario:

| | |
|---|---|
| Llamadas en 24 h | **179** |
| Mediana entre una y la siguiente | **5 segundos** |
| Llamadas a menos de 2 min de la anterior | **153 (85,5 %)** |

Una mediana de 5 segundos contra una ingesta que corre **cada 2 minutos**: el 85 % de las
llamadas no podía traer absolutamente nada nuevo. Con un usuario da igual; con un padrón
real es tráfico y cuota de Supabase quemados en devolver lo mismo.

**Y había un bug de paso:** cambiar Nacional/Global pedía **dos veces**. Una desde el
handler y otra porque al cambiar `scope` cambiaba la identidad del callback de
`useFocusEffect`, que se volvía a ejecutar.

**Qué se cambió.** No se quitó ningún disparador —foco y volver del segundo plano siguen
ahí, y el de §1.6.4 existe por una razón real— sino que ahora **pasan por un chequeo de
frescura de 2 minutos**, que es el intervalo del cron: pedir más seguido que la fuente que
alimenta la tabla es tirar el viaje. Además cada scope guarda lo suyo, así que ir y volver
entre Nacional y Global es instantáneo y sin red.

Tres detalles que no son obvios:

- **La caché va en un `useRef`, no en estado.** Si `load` dependiera de un estado que él
  mismo escribe, cambiaría de identidad en cada fetch y volvería a disparar el efecto de
  foco: exactamente el ciclo que se estaba arreglando.
- **El pull-to-refresh fuerza siempre.** Si la persona tira de la lista a mano, contestarle
  con una caché —por más fresca que esté— es no hacerle caso.
- **Un refresco que falla ya no borra la lista.** Antes el error reemplazaba los datos;
  ahora la lista se queda y el fallo se avisa en una línea bajo el encabezado. Mostrar datos
  un poco viejos es mejor que no mostrar nada, pero callarse el fallo no.

**Lo que NO se hizo, a propósito: un temporizador que recargue solo mientras la pantalla
está abierta.** Esta pestaña no es el canal de alertas —eso es la Home, y a futuro el push
(§3)— y un sismo tarda 4 a 6 minutos en publicarse (§1.11), así que quien esté esperando uno
recién ocurrido va a tirar de la lista igual. Un poller sería un segundo mecanismo de
refresco, paralelo al de `app-data`, con su propia forma de quedar desincronizado.

### 1.6.4.2 Leyenda de magnitud y procedencia en el feed global

Dos agregados a Noticias Sísmicas que salieron de la misma pregunta: **la lista mostraba
datos sin explicarlos.**

**La leyenda de color** (`src/components/magnitude-legend.tsx`). El cuadro de magnitud usa
tres colores y en ninguna parte se decía qué significan. Peor: la escala **reutiliza la
paleta de estados de personas**, donde el rojo es "necesito ayuda", así que sin contexto un
sismo rojo se puede leer como una alerta activa. Los tres tramos —leve hasta 4,5, moderado
4,5 a 5,9, fuerte 6,0 o más— van con el rango escrito, no solo con el color, por la misma
razón de daltonismo que el resto de la app.

Los cortes están **duplicados** respecto de `magnitudeSeverity()` a propósito: esa función
mapea un número a un color y la leyenda necesita el camino inverso, el rango que produce
cada color, que no se saca de ella sin invertirla. Si se mueve un corte hay que moverlo en
los dos lados.

**País y continente en el feed global** (`src/lib/geo.ts`). Antes cada fila decía solo la
localidad. Ahora, en Global, agrega una línea con *Indonesia · Asia*.

**Lo que hizo falta descubrir para poder hacerlo:**

- **`region` y `country_code` están en NULL para todo el USGS.** El único dato geográfico es
  `place`, una cadena en inglés (`"63 km NNE of Ruteng, Indonesia"`). O sea que país y
  continente hay que **interpretarlos de un texto**, no leerlos de una columna; por eso el
  mapa vive en el cliente y no en la base.
- **`shortPlace()` estaba roto para el USGS y nadie lo había notado.** Solo entendía el
  `" de "` del IGP, así que con el formato en inglés devolvía **"63 km NNE of Ruteng"**:
  dejaba el prefijo en inglés en pantalla y tiraba el país. Ahora hay un solo parser.
- **Para Estados Unidos el USGS no dice el país**: pone el estado (`", Alaska"`) y a veces
  la sigla (`", CA"`). Sin la lista de los 50 estados más sus siglas, todos esos eventos
  quedaban sin resolver.
- **El feed global incluye sismos del IGP.** `get_quake_feed('global')` devuelve todo lo
  canónico sobre 4,5, no solo lo del USGS, así que ahí caen los sismos peruanos con su
  formato en español, donde lo que sigue a la última coma es un departamento y no un país.
  Para esos la procedencia no se deduce del texto: la dice `source`.
- **Un tercio largo de los eventos no tiene país** porque ocurren en el mar (`"Banda Sea"`,
  `"Pacific-Antarctic Ridge"`). A esos **no se les inventa continente**: se muestran con el
  nombre traducido y nada más.

**El mapa se construyó midiendo, no de memoria:** se agruparon los `place` ya ingeridos por
lo que va después de la última coma, y de ahí salieron las cuatro formas de arriba.
**Verificado contra los 297 `place` distintos de la base: 0 sin resolver** —288 con país y
continente, 9 regiones marítimas—. Un territorio desconocido se muestra crudo antes que
perderse: mejor una palabra en inglés que no saber de qué parte del mundo se habla.

En Nacional la línea no se pinta: todos los sismos son de Perú y repetirlo en cada fila
ocuparía con ruido la línea donde debería ir información.

### 1.6.5 🔴 Fuga premium encontrada y cerrada

Al implementar lo anterior se descubrió que **el beneficio premium no existía como tal**:

- `get_active_alert()` **no validaba `is_premium`** en ninguna parte.
- `authenticated` tenía permiso de `UPDATE` sobre `alert_worldwide_enabled`.

O sea que cualquier usuario gratis podía activarse las alertas mundiales por su cuenta,
contra lo que define la spec §12. Se cerró en la migración `0009`: se revocó el permiso
de escritura sobre esa columna y la condición mundial ahora exige
`is_premium and alert_worldwide_enabled`.

### 1.6.6 🔴 La detección de contactos se rompía con una agenda de verdad

**Síntoma:** «Procesando N contactos…» y después *«No pudimos revisar tu agenda. Intenta de
nuevo»*, siempre, con el permiso concedido. Reintentar no servía nunca.

**Causa.** `match-contacts` buscaba los hashes con
`.in('phone_hash', clean)`. **PostgREST no manda la lista de un `.in()` en el cuerpo: la
mete entera en el query string**, y cada hash son 64 caracteres hex más la coma. Con una
agenda real eso arma una URL de decenas de KB y la petición **ni siquiera sale**: el cliente
HTTP de Deno corta con `TypeError: error sending request` y la función devuelve 500.

Medido contra el proyecto real, llamando la función con lotes de tamaño creciente:

| Hashes | URL aprox. | Resultado |
|---|---|---|
| 200 | ~13 KB | 200 ✅ |
| 240 | ~15,6 KB | 500 ❌ |
| 400 · 800 | 26–52 KB | 500 ❌ |

O sea que el techo está en los ~16 KB de cabecera, y **el bug se disparaba a partir de unos
230 números**: prácticamente cualquier agenda real. Con la agenda chica de un simulador no se
reproduce nunca, que es por lo que sobrevivió hasta ahora.

**Arreglo:** la consulta se parte en lotes de 100 hashes (~6,5 KB, con margen deliberado
porque es un límite de infraestructura que nadie garantiza por escrito) que corren en
paralelo y se unen. Verificado con 240, 400, 800 y 2000 hashes: todos 200, y 2000 tarda 1,5 s.
La aserción que más importa no es que no falle sino que **encuentre**: con el hash real
sembrado en la posición 1500 de 2000 —o sea en el lote 16 de 20— la función lo devuelve con
su perfil.

**El medio bug que lo hizo difícil de ver.** El cliente tenía un `catch` mudo y
`functions.invoke` devuelve siempre el mismo error genérico, dejando el detalle dentro de
`context`, que es una `Response` sin leer. Resultado: un fallo con causa exacta y conocida
llegaba a la pantalla como "intenta de nuevo" —consejo falso, porque reintentar no lo
arreglaba— y hubo que ir a los logs del servidor para verlo. Ahora `withFunctionDetail()`
(`src/lib/api.ts`) lee ese cuerpo y el `catch` deja rastro en consola.

> **Sigue en pie:** `MAX_HASHES = 2000` recorta en silencio. Con lotes ya no hay razón
> técnica para ese techo; se deja como freno contra un cliente que mande cualquier cosa.
> Una agenda de más de 2000 números perdería los últimos sin avisar.

### 1.7 Un sismo, un solo evento: `canonical_id`

La spec §6 pide consultar IGP **y** USGS y disparar si cualquiera reporta el evento. El
efecto secundario es que un mismo temblor entra como **dos filas**, una por fuente, con
epicentro y hora levemente distintos.

Eso rompía dos cosas: el contador "X/Y confirmados" (que compara el
`user_status.quake_event_id` de cada contacto contra el sismo activo, así que un contacto
que reportó contra la fila del USGS aparecería como "sin confirmar" para alguien cuya app
eligió la del IGP), y habría generado dos alertas por un mismo temblor.

**Solución:** al insertar, un evento que caiga a menos de 120 s y 250 km de otro ya
conocido de **otra fuente** apunta a él con `canonical_id`. `get_active_alert()` devuelve
siempre la fila canónica, así que todos los clientes convergen en un único id por sismo
físico. Verificado con las dos fuentes simulando el mismo evento: se unifican, y un sismo
en Tokio casi simultáneo **no** se agrupa.

### 1.8 La regla de disparo vive en el servidor, no en el cliente

`get_active_alert()` (Postgres) evalúa la regla de la spec §6 contra los umbrales y la
última ubicación del propio usuario, y devuelve una sola fila.

Antes el cliente bajaba los N sismos más recientes y filtraba localmente. Con el feed
global del USGS eso se rompe: los 50+ sismos diarios del mundo empujan fuera de la
ventana al que sí le importa a alguien en Perú. Además, tener la regla en un solo lugar
evita que la versión del cliente y la del servidor se separen con el tiempo y terminen
alertando a gente distinta.

### 1.9 Referencia de diseño

Mockups de Figma Make:
`https://www.figma.com/make/hZ0jKXtXFNq9ZCqbq8sbCB/Mobile-app-design-details`
Son **solo referencia visual**. Ante cualquier discrepancia manda
`spec-app-seguridad-sismos.md` (spec §17).

### 1.9.1 La app NO tiene pantalla de venta propia

Existió una (`src/app/premium.tsx`) con los planes y precios de la spec §13. **Se
eliminó.** La venta la hace el paywall de RevenueCat, que ya trae beneficios, planes y
—lo importante— los precios **localizados** que vienen de App Store Connect y Google
Play. Mantener una copia en la app garantizaba que tarde o temprano mostrara un precio y
la tienda cobrara otro.

Por eso también se borraron `PREMIUM_PLANS` y `PREMIUM_BENEFITS` de `src/lib/config.ts`.
La referencia de producto sigue estando en la spec §12 y §13.

**Punto de enganche único: `src/components/premium-cta.tsx`.** Es el botón "Obtener
Premium", que abre `RevenueCatUI.presentPaywall()`. Se usa en tres lugares (la pestaña
Global de Sismos, el simulacro sin cupo y Mi cuenta) y ninguno sabe nada de RevenueCat.

> Si `EXPO_PUBLIC_REVENUECAT_IOS_KEY` está vacía, el botón queda deshabilitado con el
> aviso "las suscripciones todavía no están habilitadas" —no "RevenueCat": el nombre del
> proveedor no le significa nada a quien usa la app—. Es deliberado: el núcleo de
> seguridad es gratis, así que una integración de cobro a medio configurar no puede
> impedir que alguien use la app.

### 1.9.1.1 Quién decide quién es Premium

**La app no.** `is_premium` está fuera del grant de UPDATE de `authenticated` desde 0001
y `alert_worldwide_enabled` desde 0009. Los escribe la edge function
`revenuecat-webhook` con service role, cuando RevenueCat confirma que la tienda cobró.
El `customerInfo` del SDK se usa solo para elegir qué pantalla mostrar; si fuera la
fuente de verdad, las alertas mundiales —que se resuelven en Postgres— no llegarían
igual.

El puente entre ambos mundos es `Purchases.logIn(userId)` con el UUID de Supabase
(`src/lib/purchases.ts`, montado en `_layout.tsx`). Ese valor es el `app_user_id` que
llega en el webhook; sin él llegaría un `$RCAnonymousID:...` imposible de mapear.

**El hueco de los segundos.** La tienda confirma el cobro al instante, pero el permiso lo
otorga el webhook después. `waitForPremiumFlag()` consulta la fila unas cuantas veces
tras la compra para que la pantalla no siga diciendo "Plan gratuito" justo después de
pagar; si se agota, la compra igual está hecha y se aplica en el próximo refresco.

**Restaurar compras no es opcional.** El plan de por vida es una compra no consumible y
Apple rechaza las apps que no ofrecen forma de recuperarla en un teléfono nuevo. Vive en
`subscription-manager.tsx`, que además muestra el **Customer Center** de RevenueCat
—cancelar, cambiar de plan, pedir reembolso— a quien ya es Premium.

### 1.9.2 Mi cuenta: editar los propios datos

Hasta ahora el nombre y el teléfono se pedían una sola vez en el onboarding y
después no había forma de cambiarlos; Ajustes solo enlazaba al plan de acción.

`src/app/account.tsx` (modal "Mi cuenta") permite editarlos y muestra el plan: **Plan
gratuito** con el botón de Premium, o **Todos Bien Premium** sin botón cuando ya está
activo. Se entra tocando el bloque de perfil en Ajustes o el avatar de la Home.

Dos decisiones del formulario:

- **Vaciar el teléfono lo borra de verdad** (`phone_e164` y `phone_hash` a NULL). Tiene
  consecuencia real —dejan de encontrarte por número— así que el campo lo advierte.
- **El hash solo se recalcula si el número cambió.** Reescribirlo sin necesidad
  invalidaría invitaciones pendientes que dependen de ese hash.

### 1.9.2.1 No hay foto de perfil: el avatar es de iniciales

**Decisión del 2026-08-20: se eliminó el selector de foto** del onboarding y de Mi cuenta.
Todos los avatares de la app son las iniciales sobre el azul de marca.

**Por qué.** Lo que había nunca funcionó como parecía: `avatarUrl` guardaba el **URI local
del teléfono**, así que la foto se veía en el propio dispositivo y en ningún otro. Para que
funcionara de verdad hacía falta Supabase Storage, o sea almacenamiento y ancho de banda
pagos, por una función que no aporta nada al núcleo —saber que tu gente está bien— en un
círculo de personas que ya se conocen por su nombre.

De paso se van dos cosas que sí tenían costo real:

- El permiso de fotos de iOS (`NSPhotoLibraryUsageDescription`), que App Review pregunta
  para qué se usa. Un permiso menos que justificar.
- Las dependencias `expo-image-picker` y `expo-image`, que ya no las usaba nadie.

**Qué se dejó en pie a propósito:** la columna `avatar_url` sigue existiendo en `profiles`
y en la caché de SQLite. Borrarla del cliente obligaría a subir `PRAGMA user_version` y
migrar la caché de cada teléfono para eliminar una columna que ya queda siempre en NULL. No
se lee ni se escribe desde ningún lado.

### 1.9.3 Los simulacros se completan a los 3, no al primero

En el checklist de la Home (`preparedness-checklist.tsx`) el ítem **Simulacros** se marca
listo recién con los `FREE_DRILL_LIMIT` (3) hechos. Antes bastaba uno, así que la fila
mostraba el check verde de "listo" al lado del texto "1 de 3 completados", que se
contradecía solo. Con un simulacro la persona vio el flujo una vez; eso no es tenerlo
practicado.

El efecto secundario buscado es que el checklist empuja a completar los 3, que es
exactamente el cupo del plan gratuito. Al agotarlo, la pantalla de simulacro deja de
mostrar un botón deshabilitado sin salida y pasa a explicar la situación y ofrecer
Premium con `PremiumCta` (§1.9.1), ocultando además el selector de modo, que no tiene
sentido cuando no se puede empezar nada.

El corte se evalúa contra dos fuentes: el conteo local (`drills_completed`) y el rechazo
del servidor (`limite_simulacros_free` de la migración 0005). Si la copia local viene
atrasada, el servidor corta igual y la pantalla muestra la misma oferta.

### 1.10 Español latino neutro, nunca voseo

Toda la copy de la app va en **tuteo latinoamericano neutro**: *tú*, no *vos*. El público
es peruano, y el voseo rioplatense (*revisá*, *podés*, *tenés*, *elegí*) suena importado.

La primera versión de la UI había salido en voseo, mientras que los 12 tips sembrados en
la base ya estaban en tuteo (*«Agáchate, cúbrete y agárrate»*), así que la app se
contradecía a sí misma según la pantalla. Corregido en 19 archivos.

Reglas al escribir copy nueva:

| Voseo | Latino neutro |
|---|---|
| revisá · intentá · elegí · seguí · compartí | revisa · intenta · elige · sigue · comparte |
| podés · tenés · necesitás · usás | puedes · tienes · necesitas · usas |
| revisalo · dejalo · apagalo | revísalo · déjalo · apágalo (el clítico mueve la tilde) |
| Vos + 3 personas | Tú + 3 personas |
| Solo para vos | Solo para **ti** (tras preposición es *ti*, no *tú*) |

Los dos últimos casos son los que más se escapan: los imperativos con pronombre pegado no
se detectan buscando `vos`, y *para vos* no se traduce como *para tú*.

### 1.11 Latencia: de dónde salen los minutos, y por qué la app NO hace alerta temprana

Pregunta que surgió al ver que un sismo tardó 6 minutos en llegar a Supabase: *¿se puede
hacer que dispare al instante?* La respuesta obliga a separar dos cosas que se confunden.

**De quién son los minutos.** Medido sobre el M4,8 de Lurín, con el reloj exacto que dejan
las corridas del cron (cada una guarda cuántos eventos traía el feed):

| Hora (Lima) | Qué pasó |
|---|---|
| 05:28:02 | El sismo |
| 05:32:01 | El feed del IGP todavía traía **16** eventos |
| 05:34:01 | El feed traía **17** — ahí apareció |
| 05:34:01 | Quedó en nuestra base, el mismo segundo |

O sea: **el IGP tardó entre 4 y 6 minutos en publicarlo** y el cron lo trajo en la primera
corrida disponible. **No es un bug nuestro.** Publicar un sismo exige recibir las trazas de
las estaciones, localizar el hipocentro y calcular la magnitud; eso toma minutos siempre.

Total medido sobre los 4 sismos peruanos ocurridos con el sistema ya corriendo: **3,5 ·
6,0 · 6,9 · 8,3 minutos**. Nuestro aporte máximo son 2 minutos, por el intervalo del cron.

**Lo que sí se puede acelerar, y lo que no.**

| | ¿Se puede? |
|---|---|
| Que suene apenas el sismo entra a nuestra base | **Sí, y es lo que falta.** Hoy ese tramo no tarda minutos: tarda *hasta que la persona abre la app*. En el caso real fueron 4 horas. Con push son segundos. Ver §3. |
| Avisar **antes o durante** el temblor | **No.** Ni con esta arquitectura ni con ninguna basada en catálogos. |

**Por qué no, en física.** El epicentro estaba a 49 km de Lima. Las ondas S —las que se
sienten— viajan a ~3,5 km/s, así que la sacudida llegó a Lima **unos 14 segundos** después
de la ruptura. Cuando el IGP publica, el temblor terminó hace rato.

La alerta temprana es otra tecnología: detectar la onda P (más rápida y casi
imperceptible) cerca del epicentro y ganarle a la onda S por señal electrónica.
**Perú ya la tiene: el SASPe**, del IGP con INDECI, operativo, 111 acelerómetros en la
costa, para sismos de magnitud 6 o más.

Y el dato que cierra la discusión: **el SASPe alerta por 114 sirenas, deliberadamente no
por celular**, porque los segundos que tarda un push son todo el presupuesto que hay. La
integración con SISMATE (el mensaje del Estado a celulares) es una etapa posterior, y no
hay API pública. El sistema de Google que hace alerta temprana con los acelerómetros de
los Android tiene una API anunciada pero todavía no abierta.

**Decisión:** la app **no promete ni intentará** avisar antes del temblor. Ese trabajo es
del Estado y ya está construido. El core de la app es otro —*dónde estabas* y *estoy
bien*— y a esa escala los minutos alcanzan: nadie tranquiliza a su familia en 10 segundos,
y una posición tomada 6 minutos después sigue diciendo bien dónde estaba la persona.

> Si alguna vez se quiere acortar nuestro tramo: `pg_cron` 1.6.4 admite intervalos
> sub-minuto, así que el job puede pasar de `*/2 * * * *` a 30 s (hay que bajar también
> `MIN_SECONDS_BETWEEN_RUNS = 45` en la edge function). Ganancia real: **~45 segundos**
> sobre ~6 minutos, a cambio de 4× invocaciones (~86k/mes contra las 500k del plan free) y
> 2 consultas por minuto al servidor del IGP en vez de 0,5. Hacerlo **después** del push,
> que es donde está el 99% de la mejora. Sin decidir.

### 1.12 Fan-out de alertas: una sola regla, en un solo lugar

La regla de disparo existía en una sola dirección: `get_active_alert()` contesta "¿hay un
sismo activo **para mí**?" cuando el cliente pregunta. Notificar necesita la contraria:
"¿a **quiénes** les aplica este sismo?", calculada sin que nadie pregunte.

**La decisión importante fue no escribir la regla dos veces.** Dos copias del mismo
criterio —una para consultar, otra para notificar— se separan con el tiempo, y el
resultado sería una app que muestra una alerta que nunca notificó, o al revés. Por eso el
predicado se extrajo a `private.quake_applies()` y `get_active_alert()` se reescribió para
llamarlo. Es el mismo razonamiento por el que la regla se movió del cliente al servidor
(§1.8).

**Cómo funciona**

1. `pg_cron` corre `private.fan_out_pending_quakes()` **cada minuto** (la mitad del
   intervalo de la ingesta, para que un sismo recién ingerido no espere un ciclo entero).
2. Por cada sismo **canónico** de los últimos 30 min se calcula a qué usuarios les aplica
   y se insertan filas en `alert_deliveries`.
3. El sender reserva lotes con `claim_alert_deliveries()` y cierra con
   `mark_alert_deliveries()`. **Todavía no existe** (§4).

**Decisiones que no son obvias**

- **Solo eventos canónicos.** El mismo temblor entra dos veces (IGP y USGS); sin este
  filtro cada sismo generaría dos avisos a la misma persona.
- **Se reevalúa incondicionalmente, no solo lo nuevo.** Tres cosas cambian el resultado
  después del primer cálculo: el USGS **corrige magnitudes** (un 4.2 que pasa a 4.8 tiene
  que alcanzar a quien tiene umbral 4.5), la **ubicación del usuario puede llegar tarde**
  (si reporta su estado dos minutos después del sismo, recién ahí matchea por radio), y el
  usuario puede cambiar sus umbrales. El índice único `(quake_event_id, user_id)` hace que
  repetir sea inofensivo.
- **Los avisos viejos se expiran, no se acumulan.** Si el sistema estuvo caído, un aviso
  de hace tres horas no se manda: la persona ya no está donde estaba, y el push dispararía
  una captura de ubicación que se guardaría como "dónde estaba durante el sismo" siendo
  falso. Ventana: 2 horas.
- **Reintentos acotados.** Un fallo vuelve a `pending`, pero a partir del tercer intento
  queda `failed`: un token revocado fallaría para siempre.
- **Jitter de hasta 30 s** en `send_after` (spec §6), complementario al del cliente
  (`ALERT_WRITE_JITTER_MS`, 8 s): el del servidor reparte los **envíos**, el del cliente
  reparte las **escrituras** que esos envíos provocan.

**Un bug que encontró la verificación.** El barrido filtraba por
`fanned_out_at < updated_at` para ahorrar trabajo. Nunca se cumplía: `now()` devuelve el
instante de la **transacción**, no del reloj, así que el `fanned_out_at` que escribe el
fan-out y el `updated_at` que escribe `moddatetime` quedan idénticos. Un sismo corregido
de 4.2 a 4.8 no volvía a evaluarse. Se quitó el filtro.

**Escala.** El costo es (sismos de los últimos 30 min) × (usuarios) por minuto. En Perú lo
normal es 0 o 1 sismo en esa ventana. Con un padrón grande conviene medirlo y, si hace
falta, indexar por ubicación en vez de recorrer `user_settings` entera.

---

## 2. Construido

### Backend (Supabase) — migraciones en `supabase/migrations/`

| Migración | Contenido |
|---|---|
| `0001_foundation` | `profiles`, `user_settings`, `notification_preferences`, `push_tokens`, trigger de alta de usuario |
| `0002_connections` | `connections` (par canónico `user_a < user_b`), `invitations`, RPCs de solicitud/respuesta/invitación, auto-vinculación por `phone_hash` |
| `0003_status_and_quakes` | `quake_events`, `ingest_runs`, `user_status`, `get_circle()`, `report_status()`, `distance_km()` |
| `0004_chat` | `conversations`, `conversation_members`, `messages` (con `client_id` para idempotencia del outbox) |
| `0005_drills_and_tips` | `drills` con límite free validado en servidor, `tips` + 12 tips sembrados |
| `0006_harden_rls_and_grants` | Correcciones de los advisors: revocar EXECUTE a `anon`, consolidar políticas permisivas |
| `0007_quake_ingest` | `pg_net` + `pg_cron`, secreto compartido en Vault, `get_ingest_secret()`, job cada 2 min |
| `0008_canonical_events_and_alert` | `quake_events.canonical_id` + trigger de unificación, `get_active_alert()`, retención de `ingest_runs` |
| `0009_quake_feed_and_premium` | `get_quake_feed(scope)` para Noticias Sísmicas, cierre de la fuga premium en alertas mundiales, índices del feed |
| `0010_alert_fanout` | Predicado compartido `private.quake_applies()`, fan-out sismo → usuarios, cola `alert_deliveries`, `claim/mark_alert_deliveries`, cron cada minuto |
| `0011_alert_fanout_fixes` | Las dos correcciones que encontró la verificación de 0010 (ver §1.12). Ya están dentro de 0010; existe para que el historial remoto sea honesto |
| `0012_revenuecat_webhook` | Secreto del webhook en Vault + `get_revenuecat_secret()`, bitácora `revenuecat_events` (su PK es el candado de idempotencia contra los reintentos de RevenueCat), poda anual |
| `0013_delete_account` | `delete_my_account(password_attempt)`: borra la propia cuenta validando la contraseña **en el servidor** con `extensions.crypt()`. Todo lo demás cae por cascada desde `profiles`. Requisito 5.1.1(v) de Apple (§1.1.3) |

**Separación de privacidad clave:** `profiles` guarda lo compartible (nombre, avatar,
plan de acción) y es legible por las conexiones. `user_settings` guarda lo privado
(teléfono, hash, umbrales de alerta, premium) y **solo lo lee su dueño**.

**Advisors:** sin hallazgos de `anon`. Quedan 6 warnings de
`authenticated_security_definer_function_executable`, que son **esperados**: esos RPC
están hechos para ser llamados por usuarios autenticados y cada uno valida `auth.uid()`
en su cuerpo. El sexto, `delete_my_account`, además valida la contraseña (§1.1.3).

> 🟡 **Advisor nuevo desde el paso a contraseña: `auth_leaked_password_protection`.**
> Supabase puede contrastar cada contraseña contra HaveIBeenPwned y rechazar las que ya
> aparecieron en filtraciones. Está apagado. Antes daba igual —no había contraseñas—;
> ahora es un interruptor en Authentication → Providers → Email que conviene prender.

Además hay un INFO `rls_enabled_no_policy` sobre `alert_deliveries` que **también es
intencional**: es una tabla interna de la cola de avisos, con RLS activa, cero políticas
y los grants de `anon`/`authenticated` revocados. Nadie más que `service_role` la toca, y
esa es exactamente la intención.

**Edge Functions desplegadas**

| Función | Qué hace | Auth |
|---|---|---|
| `match-contacts` | Compara hashes de teléfono contra los números registrados. Recibe solo hashes SHA-256; la agenda en texto plano nunca llega al servidor. **v2:** consulta por lotes de 100, si no se rompe con cualquier agenda real (§1.6.6). | JWT del usuario |
| `ingest-quakes` | Consulta IGP y USGS y escribe en `quake_events`. La dispara `pg_cron` cada 2 min. | Secreto compartido en Vault |

**Ingesta de sismos — funcionando en producción.** Verificada de punta a punta: el cron
corre solo, y en las corridas observadas trajo 17 eventos del IGP y 52 del USGS **sin un
solo error**.

Tres cosas que salieron de mirar los datos reales antes de escribir el código:

- **La capa del IGP trae filas de utilería.** Hay registros con `magnitud` cargada (7.0 y
  8.0) pero sin coordenadas ni fecha. Ingerir una de esas habría disparado una **alerta
  falsa de magnitud 8** a todos los usuarios. Cada fila se valida entera antes de
  aceptarse: sin `code`, sin coordenadas válidas, sin fecha creíble o con magnitud fuera
  de rango, se descarta. Confirmado sobre los datos reales: la magnitud máxima ingerida
  del IGP es 4.9, no 8.0.
- **El feed del USGS incluye voladuras de cantera y explosiones**, que se filtran por
  `type === 'earthquake'`.
- **`int_` del IGP mezcla intensidad y lugar** (`'II-III San Marcos'`), así que se extrae
  solo el número romano de Mercalli.

Además: las dos fuentes se resuelven por separado (que el IGP se caiga no impide que
entre el USGS), la función se auto-limita a una consulta cada 45 s por si la llaman de
más, y el endpoint rechaza con 401 cualquier llamada sin el secreto correcto (probado).

**Verificación de RLS ejecutada** contra la base real, con tres usuarios de prueba
(creados y borrados dentro de la misma corrida). 17/17 aserciones en verde:

- el trigger de alta crea `profiles` + `user_settings` + `notification_preferences`;
- A solicita conexión con B y **no puede autoaceptarse**;
- B acepta y el vínculo queda bidireccional de una sola vez;
- A ve el estado y la ubicación que reportó B;
- un tercero sin conexión ve **0** perfiles, **0** estados, **0** `user_settings`,
  **0** conexiones y **0** mensajes ajenos;
- ese tercero no puede abrir un chat con alguien que no lo aceptó;
- los 12 tips sí son legibles por cualquier usuario autenticado.

### Cliente (Expo SDK 57)

**Infraestructura**

- `src/lib/supabase.ts` — cliente con AsyncStorage + auto-refresh atado a `AppState`.
- `src/lib/db/` — caché local en SQLite (`circle`, `outbox`, `messages_cache`,
  `tips_cache`, `kv`) con migración por `PRAGMA user_version`. Singleton a nivel de
  módulo, no solo contexto de React, para que la tarea de background del push también
  pueda escribir.
- `src/lib/sync.ts` — sincronización y **outbox**: reportar tu estado sin conexión se
  guarda local y sube solo al recuperar red. El outbox colapsa estados intermedios
  (solo importa el último) y los mensajes llevan `client_id` para que un reintento no
  duplique nada.
- `src/lib/phone.ts` — normalización a E.164 y hash SHA-256 **en el dispositivo**.
- `src/lib/location.ts` — captura de una única posición, con timeout y caída a la
  última conocida. No expone ninguna API de tracking continuo, a propósito.
- `src/theme/` — tokens de color, spacing y tipografía.

**Pantallas**

| Zona | Pantallas |
|---|---|
| Acceso | intro de valor (3 slides), entrar, crear cuenta, confirmar correo, olvidé mi contraseña, contraseña nueva |
| Onboarding | perfil + teléfono, permisos con contexto, contactos, plan de acción, listo |
| Tabs | Inicio, Círculo, Chats, Ajustes |
| Modales | detalle de contacto, chat, plan de acción, agregar contactos, invitar, simulacro, Mi cuenta, cambiar contraseña, borrar cuenta |

**Home en sus dos modos** (spec §5): con alerta activa muestra banner de magnitud/zona/
tiempo, selector de estado, grilla del círculo con anillos de color y contador
`X/Y confirmados`. Sin alerta muestra barra tranquila, checklist de preparación (sin
gamificación), recordatorio discreto y el tip con más desarrollo.

**Accesibilidad:** cada estado se distingue por color **y** por ícono propio, nunca solo
por color (daltonismo rojo-verde).

**Verificado:** `npm run typecheck` y `npm run lint` en verde, y el bundle de iOS exporta
sin errores (1842 módulos).

### Ejecutada de verdad en el simulador

No alcanza con que compile. Se corrió en un iPhone 17 simulado (`expo prebuild --clean` +
`expo run:ios`) con un sismo sembrado, y se confirmó **en pantalla**:

- El modo alerta renderiza completo: banner con magnitud 6,2, zona, tiempo transcurrido e
  intensidad Mercalli; selector "Mi estado" con los 3 estados; tip rotado a "Durante el
  sismo"; tab bar nativa con efecto glass.
- **La ubicación se guardó sola**, sin tocar ningún botón: `user_status` quedó con
  `lat -12.0464 / lon -77.0428` (exactamente la posición simulada de Lima), estado
  `unconfirmed` y `quake_event_id` apuntando al sismo sembrado.
- El onboarding completo y el reporte manual de estado funcionan con una persona real
  manejando la app.

**Dos bugs encontrados al ejecutarla** (ninguno se veía compilando):

1. **Layout roto en toda fila dentro de `<Link asChild>`.** El `Slot` de Radix que usa
   expo-router fusiona estilos con spread de objeto (`{...slotProps.style,
   ...childProps.style}`). Un `Pressable` con `style` como **función**
   (`({pressed}) => [...]`) se pierde entero al hacerle spread, porque una función no
   tiene propiedades enumerables. Resultado: `flexDirection: 'row'` desaparecía y las
   filas se apilaban en vertical. Afectaba 5 archivos. Se reemplazó `Link asChild` por
   `router.push()` con `Pressable` normal, que no pasa por `Slot`.
2. **La ubicación no se guardaba al llegar la alerta** (ver §1.6.3).

> Andamio de QA: para entrar al simulador sin depender del correo se creó el usuario
> `qa.simulador@example.com` con contraseña temporal. **La contraseña ya se quitó.** La
> cuenta sigue viva solo para poder seguir probando; **borrarla antes de lanzar.**
>
> Con el acceso por contraseña (§1.1.1) este andamio dejó de ser un caso especial: probar
> ya no depende de interceptar un correo. La cuenta de demostración de App Review va a
> ocupar este lugar, y esta se puede borrar.

---

## 3. Push notifications: cerrado en iOS, pendiente en Android

> **Cambio de estado (2026-08-20).** Esta sección se llamaba *"el hueco más importante que
> queda"* desde el arranque del proyecto. Ya no lo es: la cadena completa funciona en iOS y
> está verificada con datos reales. Se conserva el diagnóstico original porque explica
> **por qué** el diseño es así, no solo qué hace.

### 3.1 El problema que resolvía (histórico)

Antes, lo único que disparaba la sincronización de la alerta era `AppState → 'active'`, es
decir **abrir o volver a la app**.

Escenario real — no hipotético, **pasó el 2026-08-19** (§1.6.3.1):

| Hora | Qué pasa |
|---|---|
| 03:14 | Tiembla en Lima |
| 03:15 | El cron ingiere el sismo en Supabase ✅ |
| 03:15 | El teléfono no hace nada: pantalla apagada |
| 08:00 | La persona se despierta y abre la app |
| 08:00 | *Recién ahí* aparece la alerta y se guarda su ubicación |

> Dimensión del problema, medida: del sismo a nuestra base pasaron **6 minutos**, de los
> cuales 4 a 6 son del IGP y son inevitables (§1.11). De nuestra base al teléfono pasaron
> **4 horas**, que es exactamente lo que el push elimina. Ahí está la mejora, no en la
> frecuencia del cron.

El problema no es solo enterarse tarde. Es que la ubicación que se guarda es **dónde está
a las 8 de la mañana, no dónde estaba a las 3:14**, y "última ubicación registrada al
momento del sismo" es la promesa central de la app.

Lo mismo aplica a todo lo demás de la spec §7: si un contacto marca "necesito ayuda",
nadie se entera hasta que abra la app por su cuenta.

**Por qué no hay alternativa a push:** el teléfono no puede consultar Supabase
periódicamente en segundo plano — iOS mata esos procesos y consumiría batería. La única
forma de que un servidor despierte un teléfono es una notificación push.

### 3.2 Los dos trabajos distintos del push

1. **Aviso visible** — "Sismo de magnitud 5,6". Es lo que ve la persona.
2. **Push silencioso** (`contentAvailable`) — despierta la app unos segundos en background
   y ahí corre `captureLocationForActiveAlert()`, guardando dónde estaba **en ese
   momento**, con la app cerrada.

Los dos viajan en **un solo mensaje**, no en dos: iOS entrega una notificación con
contenido visible y `content-available` a la vez, así que no hay motivo para gastar dos
envíos ni para arriesgar que llegue uno y no el otro.

### 3.3 La cadena, y dónde vive cada pieza

```
sismo → ingest-quakes → quake_events → fan_out_pending_quakes → alert_deliveries
                                                                       ↓
   user_status ← tarea de fondo ← APNs ← Expo Push ← send-alerts ←──────┘
```

| Pieza | Dónde | Migración |
|---|---|---|
| Ingesta cada 2 min | `supabase/functions/ingest-quakes` | 0007 |
| Fan-out sismo → usuarios, cada 1 min | `private.fan_out_pending_quakes()` | 0010 / 0011 |
| Cola con jitter y expiración | `alert_deliveries` | 0010 |
| **Envío**, cada 1 min | `supabase/functions/send-alerts` | 0014 |
| Registro del token | `syncPushToken()` en `src/lib/notifications.ts` | 0001 |
| **Captura en segundo plano** | `src/lib/background-alert.ts` | — |

**Verificado de punta a punta el 2026-08-20** con un sismo sintético cerca de Lima: del
push a la ubicación subida pasaron **2 segundos**, con la app en segundo plano y sin
tocarla. El discriminador de la prueba fue `status = 'unconfirmed'`, un valor que solo
puede escribir la tarea de fondo porque no existe como botón.

**Lo que NO está verificado:** el caso **app terminada del todo**. No se puede probar con
un dev client, porque iOS levanta el bundle desde Metro y necesita la Mac accesible.
Requiere un build standalone.

> ⚠️ **El push no se puede probar en el simulador de iOS**: no entrega tokens de APNs.
> Hace falta un dispositivo físico. El emulador de Android sí sirve, siempre que tenga
> Google Play services.

Ver también §1.2 sobre el límite de iOS: los push silenciosos están limitados en
frecuencia y **no se garantiza su entrega**, por eso el diseño mantiene la red de
seguridad de capturar también al abrir la app. La tarea de fondo es idempotente
justamente para que las dos rutas puedan convivir sin duplicar nada.

### 3.4 Dos lecciones que costaron tiempo

**`TopicDisallowed`.** La primera alerta real salió con `status = 'sent'` en la base y
nunca llegó al teléfono. Causa: la APNs Key que EAS tenía cargada era de **un año antes**,
heredada de otro proyecto, y Apple no la autorizaba para este bundle ID. La pista estaba a
la vista en `eas credentials`: *Push Key — Updated 1 year ago*, al lado de certificados de
*1 day ago*. Se resolvió generando una clave nueva desde EAS; **no hizo falta rebuildear**,
porque la clave vive en los servidores de Expo y no en el binario.

**`sent` no significa "entregado".** Expo devuelve `ok` cuando **acepta** el mensaje, no
cuando Apple lo entrega. Durante todo el episodio anterior la base decía "enviado" mientras
el teléfono no sonaba. El veredicto real está en los *receipts*
(`/--/api/v2/push/getReceipts`), que hoy **no se consultan**: ver Deudas.

### 3.5 Android: lo que falta

Solo está hecho el proyecto de Firebase y el `google-services.json` en la raíz del repo.
Falta la service account de FCM en EAS y todo Play Console. Ver
`docs/QUE-FALTA.md`, que es el índice único de trabajo pendiente.

---

## 4. Pendiente (no bloqueado)

👉 **El trabajo pendiente vive en `docs/QUE-FALTA.md`**, que es el índice único: código,
iOS y Android en un solo lugar.

Estaba repartido entre este documento y el checklist de la guía de despliegue, y dos listas
de lo mismo en archivos distintos se separan siempre. Acá quedan las **deudas conocidas**,
que son otra cosa: problemas de lo que ya está construido, no trabajo nuevo.

Lo que se cerró del plan original: el fan-out (0010), el sender (0014), `eas init` y la
tarea de fondo. El bloque de push está completo en iOS (§3).

> **Cómo ver el modo alerta hoy.** La regla funciona y ya hubo un sismo real que la cumplía
> —el M4,8 de Lurín del 2026-08-19, a 49,1 km de Lima (§1.6.3.1)—, así que la afirmación
> anterior de que "la semana estuvo tranquila y lejos" quedó vieja. Aun así, los sismos que
> disparan alerta son poco frecuentes: para recorrer el flujo cuando se quiera, está el
> **simulacro**, que es justamente uno de los propósitos que le da la spec §9.

### Deudas conocidas

- **🟡 El fix del callejón sin salida de ubicación no está verificado en pantalla.**
  Compila, pasa lint y la app arranca en el simulador, pero las tres pantallas que cambian
  (§1.6.3.1) están detrás del login. Falta recorrerlo a mano: conceder el permiso desde
  Ajustes y confirmar que `user_status` queda con coordenadas y que los dos avisos
  desaparecen.
  > Con el paso a contraseña (§1.1.1) esto **se destrabó**: antes una sesión de agente no
  > podía autenticarse porque el código OTP llegaba a la casilla del dueño. Ahora alcanza
  > con darle contraseña a una cuenta de prueba.
- **🟡 Las cinco pantallas de acceso nuevas no están verificadas en pantalla.** Typecheck,
  lint y el bundle de iOS en verde, y el registro contra el proyecto real devuelve 200 con
  el correo saliendo (§1.1.2). Falta recorrer a mano el circuito completo: crear cuenta,
  confirmar con el código, cerrar sesión, entrar, y recuperar la contraseña.
- ~~**No hay forma de borrar la cuenta desde la app.**~~ y ~~**No se puede cambiar la
  contraseña estando adentro.**~~ Las dos hechas el 2026-08-20 (§1.1.3), y el borrado
  probado de punta a punta sobre una cuenta real.
- **🔴 Falta la cuenta de demostración para App Review.** Es el motivo por el que se pasó a
  contraseña (§1.1.1) y todavía no está hecha: hay que crear una cuenta con el onboarding
  ya completo y contactos de ejemplo, y cargar sus credenciales en App Store Connect →
  *App Review Information*. Una cuenta vacía deja al revisor mirando una pantalla sin nada
  y es motivo de rechazo tanto como una que no abre.
- **Frecuencia del cron sin decidir.** Ver el recuadro de §1.11: 2 min → 30 s gana ~45 s
  sobre ~6 min. Va después del push.
- **Fortaleza del hash de teléfono.** Se hashea con SHA-256 más una sal fija que vive en
  el bundle (`src/lib/phone.ts`). Eso frena una tabla rainbow genérica, pero no a alguien
  que descompile la app: el espacio de móviles peruanos es forzable por fuerza bruta.
  Aceptable para el MVP; si el volumen crece, evaluar un esquema de intersección privada
  de conjuntos del lado del servidor.
- ~~**Avatar sin subir.**~~ Resuelto por eliminación el 2026-08-20: **no hay foto de
  perfil** (§1.9.2.1). El avatar es de iniciales y no hay nada que subir.
- **Chat grupal.** El backend ya lo soporta (`create_group_conversation`, con validación
  de que cada integrante sea contacto aceptado); falta la UI para crearlo.
- **Simulacro en modo "avisar al círculo".** La opción existe en la UI y queda guardada
  en `drills.mode`, pero el aviso real a los contactos depende de push.
- **🟡 `alert_deliveries.status = 'sent'` significa "Expo lo aceptó", no "llegó".** El
  veredicto real de Apple está en los *receipts*, que hay que pedir aparte unos minutos
  después con el `ticket_id` que devuelve el envío. Hoy ese id **no se guarda**, así que no
  hay forma de saber si una alerta se entregó. Con un usuario el problema se nota enseguida
  —pasó, con `TopicDisallowed` (§3.4)—; con diez mil, una credencial rota se vería como
  "todo enviado" mientras nadie recibe nada. No bloquea lanzar, pero es de las cosas que uno
  quiere tener **antes** de necesitarlas.
- **🔴 La Home mostró "todo en calma" habiendo una alerta activa, y no se reprodujo.**
  Al abrir la app tras un push había que tirar de la lista para ver el sismo. El dato que
  más pesa: el refresco automático y el pull-to-refresh **llaman a la misma función**, así
  que no es un bug de lógica sino un fallo silencioso del primero — el `catch` de
  `refresh()` se comía el error y dejaba la caché vieja en pantalla. Se agregó un reintento
  que primero renueva la sesión, por la sospecha de que el token vence mientras la app está
  en segundo plano (`supabase.auth` congela su timer ahí). **La sospecha NO se confirmó:**
  en la verificación posterior el bug no se reprodujo y el reintento nunca llegó a
  dispararse, así que el arreglo es una red de seguridad, no una causa identificada. Queda
  abierto y es intermitente. Si vuelve a pasar, la línea `[sync] primer intento falló` en
  la consola dice si la causa es esa.
- **🟡 El texto del aviso usa el `place` crudo del USGS, que viene en inglés.** Un sismo
  peruano llega bien —el IGP da la referencia en español— pero uno global se anuncia como
  "170 km NE of Lorengau, Papua New Guinea" dentro de una app en español. `src/lib/geo.ts`
  ya resuelve país y continente para el feed; el sender debería usar lo mismo. Solo afecta
  a las alertas mundiales, que son premium.
- **El permiso de notificaciones solo se pide en el onboarding.** Quien lo rechaza ahí no
  tiene ninguna forma dentro de la app de volver a activarlo: hay que ir a Ajustes de iOS.
  El registro del token sí quedó cubierto (`syncPushToken()` corre en cada refresco), pero
  el permiso en sí no se vuelve a ofrecer nunca. En una app de alertas, quedarse sin
  notificaciones por un toque apurado durante el onboarding es caro.
- **Notificaciones del feed Global.** La spec de la funcionalidad las incluye como parte
  del beneficio premium. El corte de acceso ya está (`get_quake_feed` + la condición
  mundial de `get_active_alert`) y el envío ya existe (§3), pero **nadie encola** esos
  avisos: el fan-out solo cubre la alerta de sismo cercano, no el feed mundial.
- **`TabBarExtraInset` de Android sin verificar.** Los 80dp son el alto nominal de la
  `BottomNavigationView` de Material 3, tomado de la documentación, no medido en un
  dispositivo. Los valores de iOS sí están medidos (§1.4). Al probar en Android hay que
  repetir la sonda de insets y ajustar; si Android resultara reportar la barra dentro de
  `insets.bottom` como iOS, el valor correcto pasa a ser 0.

---

## 5. Fuera de alcance del MVP (documentado en la spec)

Respaldo por SMS · historial extendido de ubicaciones · exportar PDF de preparación ·
tier B2B · punto de encuentro en mapa (es premium, requiere `react-native-maps`) ·
donaciones.

---

## 6. Bitácora

| Fecha | Qué pasó |
|---|---|
| 2026-08-20 | **El spinner de pull-to-refresh se quedaba trabado** (§1.4.2). Abrir la app después de un rato dejaba el spinner colgado arriba y el contenido corrido hacia abajo, en las cuatro pantallas que tienen el gesto, sin que nadie hubiera tirado de nada. No era de estilos: `RefreshControl.refreshing` estaba atado a la bandera global `syncing` (Home y Círculo) y se prendía dentro de `load()` (Sismos), así que **cualquier** refresco automático lo encendía — arrancar, volver del segundo plano, recuperar la red, hasta aceptar una solicitud. Prenderlo por código hace que iOS empuje el contenido con una animación; si la vista no está en pantalla en ese momento, la animación no termina y el scroll se queda corrido. Que se arreglara solo al cambiar de pestaña y volver era la pista: eso fuerza un layout nuevo. Ahora el estado vive en `usePullToRefresh` y **solo lo enciende el gesto**; los refrescos automáticos revalidan en silencio, que es lo que ya se esperaba de la caché de §1.6.4.1. Se borró `syncing` del contexto: no le quedaba un solo consumidor y era la trampa a la vista para volver a atarlo. |
| 2026-08-20 | **Leyenda de magnitud y procedencia en el feed global** (§1.6.4.2). La lista pintaba tres colores sin decir nunca qué significan, y encima la escala reutiliza la paleta de estados de personas —donde el rojo es "necesito ayuda"—, así que un sismo rojo se podía leer como alerta activa. Para el país y el continente hubo que descubrir que **`region` y `country_code` están en NULL para todo el USGS**: el único dato es el `place` en inglés, o sea que la procedencia se interpreta de un texto. Al hacerlo apareció que **`shortPlace()` estaba roto para el USGS** y nadie lo había visto: solo entendía el `" de "` del IGP, así que mostraba "63 km NNE of Ruteng" —prefijo en inglés y sin país—. Otras dos cosas que no se veían venir: para EE. UU. el USGS manda el estado y no el país (a veces la sigla, `", CA"`), y el feed global **incluye sismos del IGP**, con formato en español, donde tras la última coma va un departamento. El mapa se armó agrupando los `place` ya ingeridos, no de memoria; **verificado contra los 297 distintos de la base: 0 sin resolver**. A los eventos en el mar no se les inventa continente. |
| 2026-08-20 | **Noticias Sísmicas pedía el feed en cada foco** (§1.6.4.1). Medido en los logs antes de tocar nada: 179 llamadas a `get_quake_feed` en 24 h de **un** usuario, con **mediana de 5 segundos** entre una y la siguiente, contra una ingesta que corre cada 2 minutos — el **85,5 %** no podía traer nada nuevo. Además cambiar Nacional/Global pedía dos veces, porque al cambiar `scope` cambiaba la identidad del callback de `useFocusEffect` y se sumaba a la llamada del handler. Se conservaron los disparadores (foco y volver del segundo plano, que existen por el congelamiento de §1.6.4) pero ahora pasan por un umbral de frescura igual al intervalo del cron, y cada scope guarda lo suyo. Decidido **no** poner un temporizador: esta pestaña no es el canal de alertas y sería un segundo mecanismo de refresco en paralelo al de `app-data`. De paso, un refresco fallido ya no borra la lista buena. |
| 2026-08-20 | **La detección de contactos no funcionaba con ninguna agenda real** (§1.6.6). «No pudimos revisar tu agenda» con el permiso concedido, siempre. No era el permiso: `.in('phone_hash', …)` mete los 64 caracteres de **cada** hash en el query string, así que a partir de ~230 números la URL pasa los 16 KB y la petición ni sale (`TypeError: error sending request`). Medido lote por lote contra el proyecto real: 200 pasa, 240 falla. Arreglado consultando de a 100 en paralelo; verificado con 2000 hashes y —la aserción que importa— con el hash real sembrado en el lote 16 de 20, que sí aparece. **Sobrevivió tanto porque una agenda de simulador tiene 5 contactos.** De paso se arregló lo que lo hizo difícil de diagnosticar: `functions.invoke` devuelve un error genérico y deja el motivo en un `Response` sin leer, y el cliente además lo tragaba con un `catch` mudo — la pantalla aconsejaba "intenta de nuevo" ante un fallo que reintentar no arreglaba nunca. |
| 2026-08-20 | **Cambiar contraseña y borrar la cuenta** (§1.1.3, migración 0013). Las dos salen de haber pasado a contraseña: la segunda es requisito **5.1.1(v)** de Apple y sin ella el envío se rechaza. Lo que no era obvio: la contraseña se valida **en Postgres** con `extensions.crypt()`, porque hacerlo solo en la app no frena a quien ya tenga el token de sesión y llame al RPC directo. 3/3 aserciones contra la base real, incluida la que confirma que un intento con contraseña incorrecta **no borra nada**. Probado además a mano sobre una cuenta real, y ahí apareció lo que las aserciones no muestran: **borrar la cuenta pierde el Premium**, porque el derecho queda atado al `app_user_id` viejo; se recupera con «Restaurar compras» y la pantalla ahora lo dice. De paso, un advisor nuevo que antes no aplicaba: `auth_leaked_password_protection` está apagado. |
| 2026-08-20 | **Acceso por contraseña y adiós a la foto de perfil.** (1) El bug de *"Error sending confirmation email"* con correos ajenos resultó no ser de la app: Resend seguía mandando desde `onboarding@resend.dev`, que solo entrega a la casilla del dueño de la cuenta. El dominio `todosbien.app` ya estaba verificado con DKIM, SPF y MX —lo que faltaba era cambiar el *Sender email* en Supabase, que es **otro panel** (§1.1.2). Verificado contra el proyecto real: el registro con una dirección ajena pasó de 500 a 200, sin error en los logs. (2) El acceso pasó de código OTP a **correo + contraseña**, que es lo que exige App Review para poder entrar con una cuenta de demostración; de paso el correo deja de ser punto único de falla en cada ingreso (§1.1.1). Cinco pantallas donde había dos, con recuperación de contraseña por código en vez de link. Se descubrió al implementarlo que `verifyOtp({type:'recovery'})` **abre sesión antes** de que la contraseña nueva esté escrita, así que el guardia de navegación saca la pantalla de encima entre las dos llamadas: se resolvió validando antes, cerrando sesión si falla la escritura y avisando por `Alert`, lo único que sobrevive a la navegación. (3) **Eliminada la foto de perfil** (§1.9.2.1): guardaba el URI local del teléfono, o sea que solo se veía en el propio dispositivo, y hacerla real pedía Supabase Storage pago. Se fueron con ella el permiso de fotos de iOS y las dependencias `expo-image-picker` y `expo-image`. Typecheck, lint y bundle de iOS en verde; **las pantallas nuevas quedan sin verificar a mano** (ver Deudas). |
| 2026-08-17 | Arranque. Decisiones 1.1 a 1.9 tomadas. Schema completo con RLS aplicado en Supabase, advisors corregidos, 12 tips sembrados, edge function `match-contacts` desplegada, RLS verificada con 17 aserciones contra la base real. Cliente Expo: infraestructura offline-first, acceso, onboarding de 4 pasos, tabs con barra nativa glass, Home en sus dos modos, círculo, chat, simulacro y ajustes. |
| 2026-08-19 | **Un sismo real destapó que la ubicación nunca se sembraba.** Un M4,8 a 42 km de Lurín (49,1 km de Lima) no disparó alerta pese a estar dentro del radio y sobre el umbral. Diagnosticado contra la base: `user_status` sin coordenadas, así que la regla del radio de `get_active_alert()` ni se evaluaba. El fondo era un **callejón sin salida** de diseño —sin ubicación nunca hay alerta activa, y sin alerta activa nunca se captura ubicación— del que solo se salía reinstalando. Se descartaron las tres sospechas iniciales con datos: la ingesta funcionó (6 min del sismo a la base), el IGP no llegó tarde y el build del cliente es irrelevante porque la regla vive en el servidor (§1.6.3.1). Corregido con `syncLocationPermission()` en cada refresco, más aviso en Ajustes y en la Home. **De paso**: la pestaña Nacional se congelaba al volver del segundo plano, porque `useFocusEffect` no dispara si la pantalla ya estaba enfocada, y era la única lista sin pull-to-refresh (§1.6.4). Documentada también la **latencia real** y la decisión de **no hacer alerta temprana**: son 14 segundos hasta que llega la onda S, el SASPe ya existe y alerta por sirenas justamente porque un push no llega a tiempo (§1.11). Typecheck, lint y build de iOS en verde; **las pantallas nuevas quedan sin verificar a mano** (ver Deudas). |
| 2026-08-19 | **Noticias Sísmicas** (§1.6.4): pestaña informativa con toggle Nacional/Global, detalle reutilizando el componente del banner de alerta, y bloqueo premium con vista previa ofuscada + pantalla de venta con los precios de la spec §13 (sin cobro: falta RevenueCat). Se agregó el feed `4.5_week` del USGS, sin el cual la lista Global habría estado casi vacía. **Cerrada una fuga premium** que venía de antes: las alertas mundiales no validaban `is_premium` y el usuario podía activárselas solo (§1.6.5). Verificado en simulador; se corrigió que el botón del paywall quedaba tapado por la tab bar. |
| 2026-08-19 | **Guía de despliegue** (`docs/GUIA-DESPLIEGUE.md`), lo que pedía la spec §20: orden completo entre Apple Developer, App Store Connect, Firebase/FCM, EAS, TestFlight y RevenueCat, con las dependencias reales entre consolas. Verificado contra la documentación de Expo y RevenueCat, no de memoria. El hallazgo que cambia el orden: **el primer `eas build -p ios` crea solo el App ID, el certificado, el perfil y la APNs Key**, así que conviene correrlo antes de crear la ficha en App Store Connect; `eas submit`, en cambio, **no** crea la ficha. De paso: el splash seguía con el azul viejo `#208AEF` (corregido a `#0D6BC9`) y el `.gitignore` no cubría el service account de Firebase, que sí es secreto. |
| 2026-08-19 | **Fan-out de alertas** (§1.12, migración 0010). La regla de disparo se extrajo a `private.quake_applies()` y `get_active_alert()` se reescribió sobre ella, para que la versión "usuario → sismo" y la "sismo → usuarios" no puedan separarse. Cola `alert_deliveries` con jitter, expiración de avisos viejos y reintentos acotados; cron cada minuto. **15/15 aserciones en verde** contra la base real, y una de ellas destapó un bug: el barrido filtraba por `fanned_out_at < updated_at`, comparación que nunca se cumple porque `now()` es el instante de la transacción, así que un sismo corregido de 4.2 a 4.8 no se reevaluaba. Encontrado también que la tabla nueva heredaba grants completos de `anon`/`authenticated` por el default de Supabase: revocados. |
| 2026-08-19 | **Cuentas de Apple y Expo activas.** Se levanta el bloqueo que arrastraba §3.3: push iOS, build en dispositivo físico, Sign in with Apple y RevenueCat dejan de estar trabados. Reescritas §3.3 y §3.4 con lo que ya está hecho del lado del cliente y lo que falta de verdad. Anotado el cambio de circuito de verificación: **el push no se puede probar en el simulador de iOS**, hace falta dev build en dispositivo físico. |
| 2026-08-19 | **Simulacros: el checklist se completa a los 3.** El ítem de la Home mostraba el check verde con un solo simulacro hecho, al lado del texto "1 de 3 completados". Ahora se marca listo recién con los 3, y al agotar el cupo gratuito la pantalla de simulacro ofrece Premium en vez de dejar un botón deshabilitado sin salida (§1.9.3). |
| 2026-08-20 | **Documentación reorganizada.** El trabajo pendiente estaba repartido entre la sección "Pendiente" de este documento y el checklist de la guía de despliegue: dos listas de lo mismo que ya habían empezado a discrepar. Ahora hay un índice único, `docs/QUE-FALTA.md`, con código, iOS y Android; los otros documentos quedan para el **cómo** y el **por qué**. De paso se reescribió §3, que seguía titulada *"el hueco más importante que queda"* describiendo un push que ya funciona, y se documentó el proceso de Android completo —que estaba solo como una línea suelta— separando Firebase de Play Console, que son cuentas distintas y es el error clásico de esa plataforma. |
| 2026-08-20 | **La captura en segundo plano funciona: 2 segundos del push a la ubicación subida.** Con la app cerrada y sin tocarla, el iPhone se despertó, consultó si había alerta activa, tomó la posición y la subió. La prueba se diseñó para ser concluyente: `status = 'unconfirmed'` es una firma que **solo** puede dejar la tarea de fondo, porque no existe como botón. Hicieron falta tres intentos: el primero quedó ambiguo porque un toque manual pisó la escritura, y el segundo se invalidó solo —recargar Metro trajo la app al primer plano, que capturó de inmediato, y para cuando llegó el push la tarea no tenía nada que hacer—; eso, de paso, demostró la idempotencia. iOS devolvió un fix de ubicación cacheado en vez de encender el GPS, que es lo ideal dentro de los ~30 s que da el sistema. **Dos bugs encontrados en el camino**, ambos en la ruta crítica: el contador de "cambios por enviar" se congelaba porque nadie volvía a contar cuando el envío asíncrono terminaba (la escritura sí salía; mentía el cartel, para el lado del miedo), resuelto con un aviso del outbox que también arregla el chat; y la Home mostró "todo en calma" con una alerta activa, que quedó **sin reproducir** (ver Deudas). |
| 2026-08-20 | **El sender: la cadena del push quedó cerrada** (`send-alerts`, migración 0014). La cola de 0010 ya no muere en el vacío: se reserva un lote, se arma el mensaje, se manda a la Expo Push API y se cierra con `mark_alert_deliveries()`. Verificado con un aviso **real entregado a un iPhone**, no con datos inventados. El push lleva contenido visible y `contentAvailable` en el mismo mensaje, para que cuando exista la tarea de background capture la ubicación sin tocar el servidor. **Agujero encontrado al escribirlo:** `claim_alert_deliveries` marcaba el lote como `sending` y, si la edge function se caía antes de cerrarlo, esas filas quedaban ahí **para siempre** —ningún claim posterior las mira, porque solo busca `pending`—; era el modo de falla más probable de todo el circuito, porque depende de un hop HTTP a un tercero. Se agregó el rescate dentro del propio claim (a los 5 min vuelven a la fila) en vez de un cron aparte, para que no exista la posibilidad de olvidarse de agendarlo. También se borran los tokens que Expo reporta como `DeviceNotRegistered`. |
| 2026-08-20 | **El token de push nunca se registraba después del onboarding.** `push_tokens` estaba vacía pese a que la app corría en un iPhone físico. La causa: el registro vivía solo en el último paso del onboarding, que no se repite, y todas las cuentas existentes lo habían completado cuando aún no existía el `projectId` de EAS. Es el mismo callejón sin salida de §1.6.3.1 con otro permiso, y la solución es la misma: `syncPushToken()` corre también en cada refresco, escribiendo solo cuando el token cambió. Se agregaron logs de diagnóstico porque los cinco motivos de "no se registró" son silenciosos y producen el mismo síntoma. |
| 2026-08-19 | **Primera compra real en sandbox, circuito cerrado.** `INITIAL_PURCHASE` de App Store → webhook → `is_premium = true` y `alert_worldwide_enabled = true` sobre la cuenta real, verificado en `revenuecat_events`. Antes de eso hubo un `STORE_PROBLEM` / `StoreKitError.unknown` que **no era del código**: el log ya nombraba el producto, así que clave, Offering, productos y StoreKit estaban bien y solo faltaba que el sandbox de Apple respondiera. Queda anotado porque es el error que más tiempo hace perder: RevenueCat lo documenta como más frecuente en sandbox que en producción, y la salida es tester nuevo o reintentar. De paso se confirmó que el cliente anónimo que aparece junto al identificado en el dashboard es normal —el SDK crea uno antes de que `getSession()` resuelva— y no significa que `logIn()` falle. |
| 2026-08-19 | **RevenueCat integrado de punta a punta** (§1.9.1.1). El botón deja de estar inerte: abre el paywall del dashboard, y `subscription-manager.tsx` agrega **Customer Center** para quien ya paga y **restaurar compras** para quien no —esto último no es opcional, Apple rechaza las apps con compras no consumibles que no ofrecen recuperarlas—. El permiso lo otorga la edge function `revenuecat-webhook` (migración 0012) y nunca la app: `is_premium` sigue fuera del grant de UPDATE. Dos decisiones que no son obvias: **`CANCELLATION` no quita el acceso** (cancelar es "no se renueva", no "se terminó ahora"; quitarlo sería cobrar un mes y no darlo), y el reembolso —que sí corta al instante— se distingue por la fecha de vencimiento ya pasada. Verificado contra la base real: 401 sin secreto, `grant` y `revoke` aplicados sobre el usuario de QA, y un reintento del mismo `event_id` descartado como duplicado. Queda pendiente la compra de sandbox real y cambiar la clave `test_...` por la `appl_...`. |
| 2026-08-19 | **Cuenta, paywall y color.** (1) Eliminada la pantalla de venta propia: la venta pasa al paywall de RevenueCat y el botón queda inerte en un único punto de enganche, `premium-cta.tsx` (§1.9.1). (2) Nueva pantalla **Mi cuenta** para editar nombre, foto y teléfono —que solo se podían fijar en el onboarding— y ver el plan (§1.9.2). (3) Azul de marca `#0D6BC9`, también en la tab bar: además de diferenciarse del azul de iOS, **arregla un problema de accesibilidad**, porque el azul anterior daba 3.53:1 contra blanco y se usa como color de texto (§1.4.1). Un primer intento a H 216.5° se veía morado y se corrigió. (4) Dos bugs encontrados de paso: `formatE164ForDisplay` adivinaba el código de país con una regex greedy y mostraba `+519 991 227 84` en vez de `+51 999 122 784`; y el avatar sobrescribía el `fontSize` de las iniciales pero no el `lineHeight` del variant, así que a partir de cierto tamaño la letra se cortaba por abajo (se veía en Mi cuenta y en el onboarding, ambos con avatar de 92). |
| 2026-08-19 | **Tanda de bugs de idioma y safe area.** (1) Toda la copy pasó de voseo a español latino neutro en 19 archivos (§1.10); los tips de la base ya estaban en tuteo, así que la app se contradecía según la pantalla. (2) Los tips quedaban pegados a la tab bar: la constante `TabBarInset = 60` estaba 23pt corta. Se midieron los insets reales con una sonda en el simulador y se descubrió que en iOS `insets.bottom` **ya incluye** la barra glass (83pt dentro de los tabs contra 34 fuera), así que la constante sobraba (§1.4). (3) Safe area: el banner de SIMULACRO se dibujaba debajo del reloj y la isla dinámica, y el spinner del pull-to-refresh también. Corregido con un `topInset` opcional en `DrillBanner` (opcional porque en el chat va bajo un header nativo y ahí sumarlo pintaría de más) y con `progressViewOffset` en los tres `RefreshControl`. Verificado en simulador pantalla por pantalla. |
| 2026-08-18 | Reescrita la sección de push (§3). Antes decía "Bloqueado — esperando cuenta de Apple", lo que daba a entender que **todo** el push estaba trabado. Falso: **Android no depende de Apple** y se puede construir y probar entero ahora. Documentado también qué significa hoy no tener push (la ubicación se guarda cuando la persona abre la app, no cuando ocurrió el sismo). |
| 2026-08-18 | Correo: diagnosticado el bloqueo de plantillas del free tier y escrita `docs/GUIA-CORREO-RESEND.md`. Cerrada la brecha de ubicación (`src/lib/alert-response.ts`): ahora se captura al conceder el permiso y al llegar una alerta, con el jitter de la spec §6 que estaba sin usar. App **ejecutada en simulador** con sismo sembrado: modo alerta verificado en pantalla y ubicación guardada sola. Encontrado y corregido un bug de layout en 5 archivos por `Link asChild` + estilos-función. **Pendiente: dominio propio** (ver §1.6.2). |
| 2026-08-17 | Ingesta de sismos en producción: edge function `ingest-quakes` + `pg_cron` cada 2 min, autenticada con secreto en Vault. Se descubrió que la capa del IGP trae filas de utilería con magnitud 7.0/8.0 sin coordenadas, que habrían disparado una alerta falsa; se agregó validación fila por fila. Unificación IGP/USGS por `canonical_id` para que un sismo no cuente como dos y no rompa el contador de confirmados. La regla de disparo se movió del cliente a `get_active_alert()`. |
