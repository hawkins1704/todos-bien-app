# Estado del proyecto

Documento vivo. La fuente de verdad de **producto** es `spec-app-seguridad-sismos.md`;
este archivo registra **decisiones de implementación**, qué está construido, qué falta
y qué está bloqueado.

- **Proyecto Supabase:** `gfutgfmiwzgjtcrinqwo` — `https://gfutgfmiwzgjtcrinqwo.supabase.co`
- **Expo SDK:** 57 · React Native 0.86 · expo-router 57 (typed routes + React Compiler)
- **Bundle ID iOS:** `com.renzoarroyo.todos-bien` · Apple Team `3S8A8U48YR`

---

## 1. Decisiones de implementación tomadas

### 1.1 Autenticación — email ahora, Apple/Google después

**Decisión:** v1 arranca con **Supabase Auth por código OTP al correo**. Apple Sign In y
Google Sign In se agregan más adelante para ampliar los métodos de acceso.

**Por qué así:** no requiere proveedor de SMS (costo variable por mensaje, que la spec
§12 descarta para el MVP) ni cuenta de Apple Developer activa. Supabase Auth ya soporta
vincular varios proveedores a la misma cuenta, así que agregar Apple/Google después no
obliga a migrar usuarios.

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

### 1.5 Sin toggle de tema claro/oscuro

El mockup de Figma Make incluye un botón para alternar tema. **No se implementa**: la app
respeta el tema del sistema (`userInterfaceStyle: automatic`). Queda para después.

### 1.6 Escala — sin tabla de "alerta por usuario"

Un sismo que afecta a 200k personas generaría 200k filas por evento. En su lugar
`user_status.quake_event_id` guarda a qué sismo corresponde el último reporte, y
"sin confirmar" se **deriva** en el cliente: si ese id no es el del sismo activo, la
persona todavía no confirmó. Así una alerta nueva no reescribe ninguna fila.

### 1.6.1 Correo: SMTP propio con Resend (obligatorio, no opcional)

**Decisión de acceso confirmada:** solo **código OTP por correo**. Apple y Google se
suman más adelante para ampliar métodos, no para reemplazarlo. Sin contraseñas.

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

> ⚠️ **Hay que editar DOS plantillas, no una.** Con `shouldCreateUser: true`, un usuario
> **nuevo** recibe la plantilla *Confirm signup* y uno **existente** la de *Magic Link*.
> Si se edita solo una, la mitad de los usuarios sigue recibiendo un link.

### 1.6.2 🔴 PENDIENTE: dominio propio (bloquea dos cosas distintas)

Hoy se usa el dominio de pruebas de Resend (`onboarding@resend.dev`), que
**solo puede enviar correos a la casilla de la propia cuenta de Resend**. Alcanza para
desarrollar, no para tener usuarios.

Cuando haya dominio verificado hay que tocarlo en **dos lugares que no están
relacionados entre sí**:

| Dónde | Qué cambia |
|---|---|
| Resend + Supabase SMTP | El remitente pasa de `onboarding@resend.dev` a algo tipo `hola@tudominio.com` |
| `src/lib/config.ts` → `INVITE_BASE_URL` | Hoy apunta a `https://todosbien.app/i`, que **no existe**. Es el link de invitación de la spec §3 y necesita además una landing page con botones a las tiendas |

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

### 1.6.5 🔴 Fuga premium encontrada y cerrada

Al implementar lo anterior se descubrió que **el beneficio premium no existía como tal**:

- `get_active_alert()` **no validaba `is_premium`** en ninguna parte.
- `authenticated` tenía permiso de `UPDATE` sobre `alert_worldwide_enabled`.

O sea que cualquier usuario gratis podía activarse las alertas mundiales por su cuenta,
contra lo que define la spec §12. Se cerró en la migración `0009`: se revocó el permiso
de escritura sobre esa columna y la condición mundial ahora exige
`is_premium and alert_worldwide_enabled`.

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
Premium", hoy deshabilitado a propósito y con un aviso en pantalla de que las
suscripciones no están habilitadas. Se usa en dos lugares (la pestaña Global de Sismos y
Mi cuenta), así que al integrar RevenueCat se toca **un solo archivo**: cambiar el
`onPress` por `presentPaywall()` y quitar el `disabled`. El resto de la app ya lee
`mySettings.isPremium`, que es lo que escribirá el webhook.

> El aviso al usuario dice "las suscripciones todavía no están habilitadas", no
> "RevenueCat": el nombre del proveedor no le significa nada a quien usa la app. La
> referencia a RevenueCat vive en el comentario del código.

### 1.9.2 Mi cuenta: editar los propios datos

Hasta ahora el nombre, la foto y el teléfono se pedían una sola vez en el onboarding y
después no había forma de cambiarlos; Ajustes solo enlazaba al plan de acción.

`src/app/account.tsx` (modal "Mi cuenta") permite editarlos y muestra el plan: **Plan
gratuito** con el botón de Premium, o **Todos Bien Premium** sin botón cuando ya está
activo. Se entra tocando el bloque de perfil en Ajustes o el avatar de la Home.

Dos decisiones del formulario:

- **Vaciar el teléfono lo borra de verdad** (`phone_e164` y `phone_hash` a NULL). Tiene
  consecuencia real —dejan de encontrarte por número— así que el campo lo advierte.
- **El hash solo se recalcula si el número cambió.** Reescribirlo sin necesidad
  invalidaría invitaciones pendientes que dependen de ese hash.

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

**Separación de privacidad clave:** `profiles` guarda lo compartible (nombre, avatar,
plan de acción) y es legible por las conexiones. `user_settings` guarda lo privado
(teléfono, hash, umbrales de alerta, premium) y **solo lo lee su dueño**.

**Advisors:** sin hallazgos de `anon`. Quedan 5 warnings de
`authenticated_security_definer_function_executable`, que son **esperados**: esos RPC
están hechos para ser llamados por usuarios autenticados y cada uno valida `auth.uid()`
en su cuerpo.

**Edge Functions desplegadas**

| Función | Qué hace | Auth |
|---|---|---|
| `match-contacts` | Compara hashes de teléfono contra los números registrados. Recibe solo hashes SHA-256; la agenda en texto plano nunca llega al servidor. | JWT del usuario |
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
| Acceso | intro de valor (3 slides), correo, código OTP |
| Onboarding | perfil + teléfono, permisos con contexto, contactos, plan de acción, listo |
| Tabs | Inicio, Círculo, Chats, Ajustes |
| Modales | detalle de contacto, chat, plan de acción, agregar contactos, invitar, simulacro |

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

---

## 3. Push notifications: el hueco más importante que queda

### 3.1 Qué significa hoy NO tener push

Hoy lo único que dispara la sincronización de la alerta es `AppState → 'active'`
(`src/context/app-data.tsx`), es decir **abrir o volver a la app**. No hay ninguna tarea
de background registrada (`registerTaskAsync` no se llama en ningún lado todavía).

Escenario real:

| Hora | Qué pasa |
|---|---|
| 03:14 | Tiembla en Lima |
| 03:15 | El cron ingiere el sismo en Supabase ✅ |
| 03:15 | El teléfono no hace nada: pantalla apagada |
| 08:00 | La persona se despierta y abre la app |
| 08:00 | *Recién ahí* aparece la alerta y se guarda su ubicación |

El problema no es solo enterarse tarde. Es que la ubicación que se guarda es **dónde está
a las 8 de la mañana, no dónde estaba a las 3:14**, y "última ubicación registrada al
momento del sismo" es la promesa central de la app.

Lo mismo aplica a todo lo demás de la spec §7: si un contacto marca "necesito ayuda",
nadie se entera hasta que abra la app por su cuenta.

**Por qué no hay alternativa a push:** el teléfono no puede consultar Supabase
periódicamente en segundo plano — iOS mata esos procesos y consumiría batería. La única
forma de que un servidor despierte un teléfono es una notificación push.

### 3.2 Los dos trabajos distintos del push

1. **Aviso visible** — "Sismo de magnitud 6,2 cerca tuyo". Es lo que ve la persona.
2. **Push silencioso** (`_contentAvailable: true`) — no muestra nada, despierta la app
   unos segundos en background y ahí corre `captureLocationForActiveAlert()`
   (`src/lib/alert-response.ts`), guardando dónde estaba **en ese momento**, con la app
   cerrada.

El código de captura **ya existe y está probado**. Lo que falta es el gatillo.

### 3.3 iOS está bloqueado, Android NO

Esta distinción importa y es fácil de pasar por alto:

| Plataforma | Qué necesita | Estado |
|---|---|---|
| **iOS** | **APNs Key**, que se genera en el portal de Apple Developer | 🔴 **Bloqueado**: requiere la cuenta activa, hoy suspendida. No hay forma de saltearlo |
| **Android** | Proyecto de **Firebase** (gratis) + service account de **FCM** subida a EAS | 🟢 **No bloqueado**: Apple no participa en nada de esto |
| Ambas | `projectId` de EAS (`eas init`, gratis) | 🟢 No bloqueado |

**Consecuencia práctica:** se puede construir y probar el pipeline **completo** contra
Android ahora mismo — fan-out, registro de tokens, tarea de background, y los avisos de
la spec §7. Cuando se reactive la cuenta de Apple, sumar iOS es agregar la APNs Key: el
resto ya estaría hecho y probado.

Ver también §1.2 sobre el límite de iOS: los push silenciosos están limitados en
frecuencia y **no se garantiza su entrega**, por eso el diseño mantiene la red de
seguridad de capturar también al abrir la app.

### 3.4 Otras cosas bloqueadas por la cuenta de Apple

| Tema | Qué falta |
|---|---|
| Sign in with Apple | Requiere cuenta activa; también hay que habilitar el provider en Supabase Auth |
| RevenueCat | Requiere productos creados en App Store Connect y Google Play Console |
| Planes familiares | Depende de RevenueCat (spec §13 y §15) |
| Build en dispositivo iOS físico | Requiere perfil de aprovisionamiento (el **simulador** no lo necesita, y ya se usó para verificar la app) |

Cuando la cuenta esté activa, la spec §20 pide **guía paso a paso** para push,
RevenueCat y creación de productos en ambas tiendas.

---

## 4. Pendiente (no bloqueado)

Siguiente bloque natural de trabajo, en orden:

1. **Fan-out de la alerta**: cuando entra un sismo, calcular a qué usuarios les aplica y
   encolar los avisos, con el jitter de pocos segundos que pide la spec §6 para que 200k+
   dispositivos no escriban en el mismo instante. La regla ya está resuelta y probada en
   `get_active_alert()`; falta la versión "por evento → muchos usuarios" y el disparo.
   El cálculo y el encolado no dependen de ninguna tienda.
2. **Push completo por Android** (ver §3.3: **no está bloqueado**). Incluye `eas init`,
   credenciales FCM, registro de tokens, la tarea de background que responde al push
   silencioso, y los avisos de la spec §7. El código de captura de ubicación ya existe;
   falta registrar la tarea. Hacerlo por Android deja el pipeline entero probado, y sumar
   iOS después es solo agregar la APNs Key.
3. **Landing page de invitación** con botones a las tiendas. `INVITE_BASE_URL` en
   `src/lib/config.ts` apunta hoy a un dominio que todavía no existe.
4. Pruebas de carga con k6 o Artillery (spec §16.2).
5. Sentry para errores de cliente.
6. Revisión legal de términos y limitación de responsabilidad (spec §18).

> **Cómo ver el modo alerta hoy.** La regla funciona, pero la semana observada estuvo
> tranquila (máximo 4.9 en Perú, y lejos), así que la Home aparece en modo tranquilo con
> datos reales. Para recorrer el flujo de alerta hay que usar el **simulacro**, que es
> justamente uno de los propósitos que le da la spec §9.

### Deudas conocidas

- **Fortaleza del hash de teléfono.** Se hashea con SHA-256 más una sal fija que vive en
  el bundle (`src/lib/phone.ts`). Eso frena una tabla rainbow genérica, pero no a alguien
  que descompile la app: el espacio de móviles peruanos es forzable por fuerza bruta.
  Aceptable para el MVP; si el volumen crece, evaluar un esquema de intersección privada
  de conjuntos del lado del servidor.
- **Avatar sin subir.** `avatarUrl` guarda hoy el URI local del dispositivo, así que la
  foto se ve solo en el propio teléfono. Falta wirear Supabase Storage.
- **Chat grupal.** El backend ya lo soporta (`create_group_conversation`, con validación
  de que cada integrante sea contacto aceptado); falta la UI para crearlo.
- **Simulacro en modo "avisar al círculo".** La opción existe en la UI y queda guardada
  en `drills.mode`, pero el aviso real a los contactos depende de push.
- **Premium no se puede comprar.** El botón "Obtener Premium" está inerte a propósito
  porque RevenueCat no está integrado; hoy `is_premium` solo se activa a mano por SQL. El
  único archivo a tocar es `src/components/premium-cta.tsx` (ver §1.9.1).
- **Notificaciones del feed Global.** La spec de la funcionalidad las incluye como parte
  del beneficio premium. El corte de acceso ya está (`get_quake_feed` + la condición
  mundial de `get_active_alert`), pero el envío depende de push (§3).
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
| 2026-08-17 | Arranque. Decisiones 1.1 a 1.9 tomadas. Schema completo con RLS aplicado en Supabase, advisors corregidos, 12 tips sembrados, edge function `match-contacts` desplegada, RLS verificada con 17 aserciones contra la base real. Cliente Expo: infraestructura offline-first, acceso, onboarding de 4 pasos, tabs con barra nativa glass, Home en sus dos modos, círculo, chat, simulacro y ajustes. |
| 2026-08-19 | **Noticias Sísmicas** (§1.6.4): pestaña informativa con toggle Nacional/Global, detalle reutilizando el componente del banner de alerta, y bloqueo premium con vista previa ofuscada + pantalla de venta con los precios de la spec §13 (sin cobro: falta RevenueCat). Se agregó el feed `4.5_week` del USGS, sin el cual la lista Global habría estado casi vacía. **Cerrada una fuga premium** que venía de antes: las alertas mundiales no validaban `is_premium` y el usuario podía activárselas solo (§1.6.5). Verificado en simulador; se corrigió que el botón del paywall quedaba tapado por la tab bar. |
| 2026-08-19 | **Simulacros: el checklist se completa a los 3.** El ítem de la Home mostraba el check verde con un solo simulacro hecho, al lado del texto "1 de 3 completados". Ahora se marca listo recién con los 3, y al agotar el cupo gratuito la pantalla de simulacro ofrece Premium en vez de dejar un botón deshabilitado sin salida (§1.9.3). |
| 2026-08-19 | **Cuenta, paywall y color.** (1) Eliminada la pantalla de venta propia: la venta pasa al paywall de RevenueCat y el botón queda inerte en un único punto de enganche, `premium-cta.tsx` (§1.9.1). (2) Nueva pantalla **Mi cuenta** para editar nombre, foto y teléfono —que solo se podían fijar en el onboarding— y ver el plan (§1.9.2). (3) Azul de marca `#0D6BC9`, también en la tab bar: además de diferenciarse del azul de iOS, **arregla un problema de accesibilidad**, porque el azul anterior daba 3.53:1 contra blanco y se usa como color de texto (§1.4.1). Un primer intento a H 216.5° se veía morado y se corrigió. (4) Dos bugs encontrados de paso: `formatE164ForDisplay` adivinaba el código de país con una regex greedy y mostraba `+519 991 227 84` en vez de `+51 999 122 784`; y el avatar sobrescribía el `fontSize` de las iniciales pero no el `lineHeight` del variant, así que a partir de cierto tamaño la letra se cortaba por abajo (se veía en Mi cuenta y en el onboarding, ambos con avatar de 92). |
| 2026-08-19 | **Tanda de bugs de idioma y safe area.** (1) Toda la copy pasó de voseo a español latino neutro en 19 archivos (§1.10); los tips de la base ya estaban en tuteo, así que la app se contradecía según la pantalla. (2) Los tips quedaban pegados a la tab bar: la constante `TabBarInset = 60` estaba 23pt corta. Se midieron los insets reales con una sonda en el simulador y se descubrió que en iOS `insets.bottom` **ya incluye** la barra glass (83pt dentro de los tabs contra 34 fuera), así que la constante sobraba (§1.4). (3) Safe area: el banner de SIMULACRO se dibujaba debajo del reloj y la isla dinámica, y el spinner del pull-to-refresh también. Corregido con un `topInset` opcional en `DrillBanner` (opcional porque en el chat va bajo un header nativo y ahí sumarlo pintaría de más) y con `progressViewOffset` en los tres `RefreshControl`. Verificado en simulador pantalla por pantalla. |
| 2026-08-18 | Reescrita la sección de push (§3). Antes decía "Bloqueado — esperando cuenta de Apple", lo que daba a entender que **todo** el push estaba trabado. Falso: **Android no depende de Apple** y se puede construir y probar entero ahora. Documentado también qué significa hoy no tener push (la ubicación se guarda cuando la persona abre la app, no cuando ocurrió el sismo). |
| 2026-08-18 | Correo: diagnosticado el bloqueo de plantillas del free tier y escrita `docs/GUIA-CORREO-RESEND.md`. Cerrada la brecha de ubicación (`src/lib/alert-response.ts`): ahora se captura al conceder el permiso y al llegar una alerta, con el jitter de la spec §6 que estaba sin usar. App **ejecutada en simulador** con sismo sembrado: modo alerta verificado en pantalla y ubicación guardada sola. Encontrado y corregido un bug de layout en 5 archivos por `Link asChild` + estilos-función. **Pendiente: dominio propio** (ver §1.6.2). |
| 2026-08-17 | Ingesta de sismos en producción: edge function `ingest-quakes` + `pg_cron` cada 2 min, autenticada con secreto en Vault. Se descubrió que la capa del IGP trae filas de utilería con magnitud 7.0/8.0 sin coordenadas, que habrían disparado una alerta falsa; se agregó validación fila por fila. Unificación IGP/USGS por `canonical_id` para que un sismo no cuente como dos y no rompa el contador de confirmados. La regla de disparo se movió del cliente a `get_active_alert()`. |
