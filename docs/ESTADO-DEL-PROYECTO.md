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

### 1.2.1 Mapas embebidos — `react-native-maps`, y por qué no cuesta nada

**Decisión:** mini mapa estático en el detalle del sismo y en el detalle del contacto, con
`react-native-maps` **1.27.2** (la versión que fija `npx expo install` para SDK 57).
Componente único: `src/components/location-map.tsx`.

**Esto revierte la decisión anterior**, que era no renderizar ningún mapa embebido en el
MVP y dejar todo en un deep link. El motivo de aquella decisión era evitar el costo y la
API key de Google. Al verificarlo contra la documentación de precios, el costo resultó no
existir.

**Cómo factura Google el mapa nativo.** Están partidos en dos SKUs, y la diferencia no es
la plataforma sino el **Map ID**:

| SKU | Qué lo dispara | Precio |
|---|---|---|
| `Maps SDK` (Essentials) | Mapa nativo Android/iOS **sin Map ID** | Tope "Unlimited", precio "—" |
| `Dynamic Maps` (Essentials) | Maps JavaScript API (web) **y** nativo **con Map ID** | 10.000/mes gratis, luego $7 por millar |

Este caso cae entero en el primero: marcador clásico, estilo por defecto, sin Map ID. Lo
que pediría un Map ID —y movería el cobro al segundo— es el *cloud-based map styling*, los
*Advanced Markers* y el *data-driven styling*. **Por eso el componente resuelve el tema
oscuro con `userInterfaceStyle` y no con `customMapStyle`:** el segundo obliga a Map ID.
Si alguien toca eso, la app empieza a facturar.

**Lo que sí cuesta y no se usa:** buscar un lugar por nombre es **Places API** y convertir
coordenadas en dirección es **Geocoding API**, las dos de pago. Ninguna hace falta acá
porque las coordenadas ya las tenemos: los dos mapas son de **solo lectura** y no hay
ninguna pantalla donde la persona elija un punto. Mientras eso siga así, el costo es cero
por construcción y no por cuidado — y sigue así, porque el selector de punto de encuentro
en mapa quedó descartado el 2026-08-20 (§1.2.2).

**Se descartó MapLibre Native**, que era la alternativa realmente open source y sin Google.
Para dos pines de solo lectura obliga a elegir y mantener un tile server (OpenFreeMap,
MapTiler o self-host de Protomaps) a cambio de nada que aquí se note. Sigue siendo la
salida si Google alguna vez mueve ese SKU de $0 — ya cambió el modelo una vez, cuando
reemplazó el crédito de $200/mes por topes por SKU en marzo de 2025.

**Se descartó `expo-maps`** pese a ser de Expo: su propia documentación de SDK 57 lo declara
en **alpha**, con "frequent breaking changes", y además obliga a ramificar el código en
`AppleMaps.View` / `GoogleMaps.View` según plataforma.

**Por plataforma:**

- **iOS:** Apple Maps. Sin API key, sin cuenta de Google, sin configuración. Funciona hoy.
- **Android:** Google Maps, y **necesita una API key** que todavía no existe. Sin ella el
  mapa se dibuja como un rectángulo gris con el logo encima, que es peor que no mostrarlo.
  Por eso `LocationMap` **no renderiza nada en Android** mientras no haya key en el config
  plugin de `app.json`, y las dos pantallas quedan exactamente como estaban. Va junto con
  el resto del trabajo de Android (ver §4).

**El mapa no es interactivo, a propósito.** Vive dentro de un `ScrollView`, y un mapa que
acepta arrastre le pelea el gesto al scroll: la persona intenta bajar y mueve el mapa. Con
`cacheEnabled` se renderiza una vez y se muestra como imagen; el toque completo abre la app
de mapas, que es donde de verdad se explora.

**De paso, `mapsUrl()` dejó de forzar Google.** Devolvía siempre una URL de
`google.com/maps`, así que en un iPhone sin Google Maps instalada terminaba en el
navegador. Ahora usa el esquema nativo: `https://maps.apple.com/?ll=` en iOS y `geo:` en
Android, que respeta la app de mapas que la persona haya elegido por defecto.

### 1.2.2 El punto de encuentro NO se marca en mapa — descartado, no pospuesto

**Decisión (2026-08-20):** el plan de acción es texto, siempre. No va a existir un
selector de punto de encuentro en mapa, ni en el tier gratuito ni en Premium.

Estaba en la spec en dos lugares: §8 como "fase futura" y §13 como beneficio Premium
("múltiples planes de acción con punto de encuentro marcado en mapa"). **Los dos se
reescribieron**, no se marcaron como pendientes. Lo que sí queda de ese beneficio Premium
son los **múltiples planes de acción** —uno para la casa, otro para el trabajo, otro para
el colegio—, cada uno en texto.

**Por qué.** Un punto de encuentro tiene que poder decirse en voz alta y recordarse de
memoria, incluidos los niños, que son a quienes más les sirve. "El parque de la esquina"
cumple; `-12.0464, -77.0428` no. Un pin en un mapa se ve bien en una captura de pantalla y
falla justo en el escenario para el que existe: sin batería, sin señal, o con alguien que
no es el dueño del teléfono tratando de acordarse de dónde había que ir.

**Lo que NO cambia:** el tip *"Acuerda un punto de encuentro"* (migración 0005, fuente Cruz
Roja Peruana) sigue igual y sigue recomendando la práctica. Descartamos mapearla en la app,
no la práctica en la vida real — el tip incluso dice que se anote en el plan de acción, que
es exactamente el campo de texto que ya existe.

**Consecuencia técnica que conviene tener presente:** era la única funcionalidad del
proyecto que iba a necesitar un mapa **interactivo**. Sin ella, los dos mapas de §1.2.1 son
de solo lectura y no hay ninguna pantalla donde alguien elija un punto, así que la app
nunca va a necesitar **Places API** ni **Geocoding API** —las dos de pago—. El costo de
mapas queda en cero por diseño y no por vigilancia.

### 1.2.3 "Mi ubicación" en modo alerta, y cuánto dura el modo alerta

Dos cosas que salieron juntas el 2026-08-20.

**1. La ubicación se puede actualizar a mano durante la alerta.**
`src/components/my-location-card.tsx`, montada en la Home **después del círculo**.

El hueco que cierra: la captura automática ocurre **una sola vez**, al dispararse la
alerta, y responde "dónde estaba cuando ocurrió". Pero un sismo no termina en el instante
del sismo — la persona evacúa, va al punto de encuentro, sale a buscar a alguien— y hasta
ahora su círculo se quedaba hasta 6 horas mirando una posición que había dejado de ser
cierta a los diez minutos, **sin ninguna señal de que estaba vieja**.

Card aparte y no dentro de "Mi estado" porque son dos acciones distintas: cómo estoy y
dónde estoy, y una se actualiza sin tocar la otra.

**Dónde va, y el error que costó descubrirlo.** El primer intento la puso entre "Mi
estado" y el círculo, agrupando lo que la persona reporta sobre sí misma. Se lee ordenado
y estaba mal. Medido bloque por bloque en un iPhone de 852 pt: la tarjeta ocupa ~326 pt
(mapa 150 + botón + nota + padding) y empujaba el arranque del círculo de y≈535 a **y≈877,
o sea completamente fuera de pantalla**. Ver cómo está tu gente es el propósito de la app;
que exija scroll durante un sismo no es un detalle de estética.

**Comprimir no alcanzaba, y eso se midió antes de decidir:** borrar el mapa entero —lo más
agresivo posible sin eliminar la funcionalidad— dejaba el círculo arrancando en y≈711,
todavía pegado al borde inferior. El problema no era el tamaño de nada sino el **orden**.
Movida detrás del círculo, este vuelve a y≈535 y entra completo, y la ubicación **asoma**
abajo — que es exactamente lo que se quiere de una acción de seguimiento: se hace minutos
después de mirar cómo está tu gente, no antes. Eso último es explícito en la UI
("Tu estado no cambia") y en el código: el estado que se reescribe es
`effectiveStatus ?? 'unconfirmed'`, no `myStatus.status`. **La diferencia importa**: si
alguien reportó "estoy bien" en el sismo de la semana pasada y hoy solo actualiza su
ubicación, copiar ese estado lo daría por confirmado en un evento en el que todavía no
dijo nada, y el contador "X/Y confirmados" mentiría.

**Esto NO es tracking, y la distinción es la que sostiene la promesa del producto.** La
captura la dispara la persona tocando un botón; no hay `startLocationUpdatesAsync()` ni
nada en segundo plano. Sigue valiendo la regla de oro de §1.2 —una captura automática, y
solo cuando ocurre un sismo—; esto suma capturas **manuales** mientras la alerta está
activa, que es exactamente cuando compartir dónde estás es el propósito de la app. Por eso
la tarjeta **solo se monta en la rama de alerta** de la Home: fuera de una alerta no hay
nada que avisar, y un botón para refrescar la posición sería el seguimiento que
prometemos no hacer.

**2. El modo alerta dura 6 horas, y ahora está escrito.**

Ya duraba 6 horas —el valor existía en el código desde el principio— pero **no estaba en
la spec**: solo vivía en `ACTIVE_ALERT_WINDOW_MS` y en el `interval '6 hours'` de
`get_active_alert()`. Peor: el comentario de la constante decía "(spec §5.2)" y esa
sección nunca dijo nada del plazo, así que la referencia mandaba a un lugar vacío. Ahora
está en la spec como **§5.3**, con el razonamiento de por qué 6 y no menos ni más.

El modo se **deriva** de `occurred_at`: no hay nada que cerrar ni ningún estado que
expirar, el paso a tranquilo ocurre por el avance del reloj, sin escribir en la base y sin
que importe si la app estaba abierta.

⚠️ **Duplicación real que no se puede evitar:** el 6 vive en TypeScript y en SQL, y no hay
forma de compartir una constante entre los dos. Si se separan, se rompe en las dos
direcciones: con el cliente más largo, la Home entra en modo alerta con un sismo que el
servidor ya no devuelve y la pantalla queda sin datos; con el cliente más corto, el
servidor manda un sismo que la app no muestra. Quedó advertido en el JSDoc de la constante
y en la spec §5.3. La migración 0010 **no se tocó**: ya está aplicada y reescribir una
migración aplicada es peor que la duplicación.

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

### 1.6.2 Dominio propio: resuelto, y el sitio ya está desplegado

El dominio `todosbien.app` está verificado en Resend y el remitente de Supabase es
`hola@todosbien.app`. Eso cierra el bloqueo del correo (ver §1.1.2, que documenta el bug
que causó tenerlo a medias).

El **sitio también está en producción** (Hostinger, verificado el 2026-08-24): `/privacidad`,
`/terminos`, `/soporte` y `/eliminar-cuenta` responden 200. Eso levanta el bloqueo que
impedía mandar la app a revisión, porque las tiendas exigen una URL de política de privacidad
que cargue de verdad.

> ⚠️ **Ni `vercel.json` ni `_redirects` se aplican en Hostinger.** Los dos siguen en el repo
> del sitio para no atarlo a un host, pero hoy no hacen nada: una regla de reescritura nueva
> hay que ponerla en el panel o en un `.htaccess`. Se descubrió porque `/i/CODIGO` devolvía
> 404 en producción mientras las dos configuraciones decían que no debía.

Lo que quedaba pendiente acá era el link de invitación, y **dejó de existir**: los códigos
salieron del MVP el 2026-08-24 (§1.15).

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

**Ampliación del 2026-08-20: la provincia y el departamento en la tarjeta de alerta.** La
Home decía «Sismo en Coracora» y nada más. Para quien no ubica el distrito, eso no dice si
tembló al lado o a 600 km — que es justo lo que se pregunta cuando suena una alerta.

El dato estaba y se tiraba: el IGP manda `"35 km al N de Coracora, Parinacochas - Ayacucho"`
y el parser se quedaba solo con `Coracora`. Ahora `describePlace` devuelve también `area`
(`"Parinacochas, Ayacucho"`), que es lo contrario de `label`: `label` ubica el sismo **entre
países** y sirve en el feed global; `area` ubica **dónde dentro del país** y sirve cuando
el sismo es acá. Para los eventos del USGS no hay equivalente, así que ahí la tarjeta cae
en `label`.

Se descartan las partes repetidas, porque en el Perú hay provincias que se llaman igual que
su departamento: `"Lurín, Lima - Lima"` se muestra como **Lima**, no «Lima, Lima», y
`"Sechura, Sechura - Piura"` como **Piura**, no repitiendo el lugar. **Verificado contra los
24 `place` del IGP de la base: 24 resueltos, 0 con repeticiones.**

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

### 1.13 🔴 Los avisos entre personas: cinco interruptores que no mandaban nada

**Lo que se veía (2026-08-20, tras un sismo real de verdad).** Un amigo mandó solicitud de
conexión y no llegó ningún aviso. Escribió por chat: tampoco. La única forma de enterarse
de cualquiera de las dos era abrir la app y mirar.

**La causa no era un bug.** Nunca hubo nada que lo mandara. El único push que existía era
el de sismo (§1.12), y todo lo demás estaba a medio construir de una forma
particularmente engañosa: la pantalla de Ajustes **ya ofrecía cuatro interruptores** —
«Alguien necesita ayuda», «Mensajes», «Solicitudes aceptadas», «Contacto sin responder»—
guardándolos prolijamente en `notification_preferences`, tabla que existía desde la
migración 0001. Prender o apagar cualquiera de ellos cambiaba un booleano que **nadie
leía nunca**.

Eso es peor que no tener la función: alguien que apaga «Mensajes» cree que tomó una
decisión, y alguien que lo deja prendido cree que va a recibir avisos.

Faltaba además un quinto, que es el que el usuario notó primero: **que alguien te mande
solicitud**. Sin él una conexión nueva solo se descubre por casualidad.

#### 1.13.1 Cómo está armado

Se copió la forma de §1.12 a propósito, en vez de inventar un mecanismo nuevo:

```
disparador de Postgres → notification_deliveries → send-notifications → Expo → APNs/FCM
```

| Aviso | Lo dispara | Canal |
|---|---|---|
| Te mandaron solicitud | `INSERT` en `connections` | social |
| Aceptaron tu solicitud | `UPDATE` de `connections` a `accepted` | social |
| Alguien necesita ayuda | `user_status` pasa a `needs_help` | alerts |
| Te escribieron | `INSERT` en `messages` | messages |
| Contacto sin responder | cron cada 5 min (no nace de un INSERT) | alerts |

Cuatro decisiones que no son obvias:

- **El texto se congela al encolar, no al enviar.** El aviso de sismo se arma en el
  momento del envío porque `quake_events` sigue igual; el de una persona depende de un
  nombre y del cuerpo de un mensaje, y esos **cambian o se borran**. Si se resolviera al
  enviar, un mensaje borrado un segundo después llegaría vacío, y alguien recién sacado
  del círculo seguiría nombrado en un push.
- **Las preferencias se comprueban en un solo lugar**, `private.enqueue_notifications()`.
  Cualquier disparador nuevo pasa por ahí, así que no se puede olvidar el chequeo — que es
  exactamente el error que dejó los interruptores inertes.
- **Sin jitter.** El aviso de sismo se dispersa 30 s porque despierta a miles de teléfonos
  a capturar ubicación a la vez. Un mensaje de chat va a una sola persona.
- **Sin `contentAvailable`.** El push silencioso existe para capturar dónde estaba alguien
  durante un sismo. Un «te escribieron» no tiene nada que capturar; despertar la app por
  eso sería gastar batería a cambio de nada.

**Y llega en menos de un segundo.** Un disparador toca la edge function apenas hay algo
encolado, en vez de esperar al cron. Medido en producción: **0,6 s** entre encolar y
enviar. El cron queda de red de seguridad cada 5 minutos.

> Detalle que importa para la cuenta de Supabase: el disparador es **por sentencia**, no
> por fila, y encolar hace un solo `INSERT ... SELECT`. Avisar a un círculo de diez
> personas dispara un HTTP, no diez. Y como el camino rápido es el disparador, el cron
> puede ir cada 5 minutos en vez de cada minuto: 288 invocaciones al día en vez de 1.440.

#### 1.13.2 El simulacro silencioso tenía que seguir siendo silencioso

La pantalla de simulacro promete dos cosas por escrito: *«Modo silencioso — nadie de tu
círculo se entera ni recibe nada»* y *«Avisar a mi círculo — les llega un aviso que dice
claramente que es un simulacro, nunca el texto de una alerta real»*. Las dos frases
estaban en la app desde antes de que existiera nada que las cumpliera.

Ahora el disparador de «necesita ayuda» busca el simulacro que respalda ese reporte y
**se calla si es silencioso**. Ante la duda también se calla: sin un simulacro que lo
respalde no manda nada, porque el daño de un falso «necesita ayuda» es mayor que el de un
simulacro que no avisa.

La prueba de esto encontró un bug propio, corregido en 0016: el simulacro se elegía solo
por `started_at desc`, y **dentro de una transacción `now()` devuelve la hora de la
transacción**, así que dos simulacros insertados en el mismo bloque empataban al
microsegundo y ganaba cualquiera. En producción es improbable, pero "improbable" acá
significa mandarle a todo un círculo un «necesita ayuda» que la persona pidió que fuera
silencioso. Ahora gana el que está en curso.

#### 1.13.3 Verificación

Nueve aserciones contra la base real, **todo dentro de una transacción revertida** para
que ninguna notificación de prueba le llegara a nadie:

| | |
|---|---|
| Solicitud recibida / aceptada | 1 y 1 ✅ |
| Preferencia apagada → no encola | 0 ✅ |
| Necesita ayuda → «Renzo Arroyo necesita ayuda» | 1 ✅ |
| Simulacro silencioso → no avisa | 0 ✅ |
| Simulacro con aviso → «Simulacro · Renzo Arroyo» | 1 ✅ |
| Mensaje de chat, con el cuerpo real | 1 ✅ |
| Dedupe del segundo intento | 0 ✅ |
| Fan-out al ingerir un sismo | 3 avisos, marcado ✅ |

Más un push real de punta a punta al teléfono del autor (0,6 s), y `401` en la edge
function sin secreto y con secreto falso.

**Y una verificación que no se buscó:** el cron de «contacto sin responder» se disparó
solo, en producción, mientras se escribía esto. Detectó que a Renzo le había llegado una
alerta y no había reportado, y encoló el aviso para su círculo con la clave de
deduplicación correcta — una sola vez, pese a correr cada 5 minutos.

#### 1.13.4 Latencia del aviso de sismo: qué se recortó y qué no

Medido con el M7,2 de Coracora del 2026-08-20:

| Tramo | Antes | Ahora |
|---|---|---|
| Ocurre → entra a nuestra base | 7 m 45 s | *igual* (del IGP) |
| Entra → se encola el aviso | 59 s | **0 s** |
| Jitter de la spec §6 | 27 s | *igual* |
| Vence el jitter → sale el push | 33 s | *igual* |
| **Nuestro tramo** | **1 m 59 s** | **~1 m** |

El minuto del fan-out era puro tiempo de espera: el sismo ya estaba en la tabla y el cron
todavía no había pasado. Ahora un disparador lo encola en la **misma transacción** que lo
inserta. Es SQL dentro de la transacción de la ingesta: no agrega ni una invocación de
edge function.

Los otros dos tramos se quedan a propósito. El jitter dispersa el despertar de los
teléfonos y el cron de envío acota la espera del jitter a un minuto; quitarlos cambia el
comportamiento a escala a cambio de segundos.

**El número honesto:** de los ~9 m 45 s totales, **7 m 45 s son del IGP** — el 79 %. La
app sigue mostrando el sismo antes que el push, porque lo lee de la base apenas está ahí.
Esa diferencia se achicó a la mitad, pero no puede llegar a cero: el push depende de un
cron y la pantalla no.

**El cron de fan-out se queda igual.** No es redundante: es el que reevalúa un sismo
**corregido** de 4.2 a 4.8, que el disparador nuevo no ve.

#### 1.13.5 🔴 Un M6,7 en la Antártida destapó dos fallos (migración 0020)

El 2026-08-22, 08:22 UTC, un sismo en el **mar de Scotia** —a 5.887 km de Lima— le llegó
**dos veces** al único usuario premium con avisos mundiales. Sus dos contactos, que no
recibieron ningún aviso, recibieron en cambio *«Renzo Arroyo no responde. No reportó cómo
está desde el sismo»*, también dos veces.

**Lo primero que hubo que descartar: el disparo del aviso NO era un bug.** La regla mundial
de premium es magnitud ≥ 6,0 y el sismo era 6,7. Los contactos no son premium, por eso no les
llegó. `quake_applies` hizo exactamente lo que dice.

**Fallo 1 · La deduplicación solo miraba entre fuentes distintas.**

`link_canonical_quake()` (0008) exigía `q.source <> new.source`, escrito cuando el único
duplicado imaginado era «el mismo sismo según el IGP y según el USGS». Pero **el USGS publica
un mismo sismo bajo varios ids propios**: una solución automática de una red contribuyente y
la revisada de su catálogo.

| id | magnitud | hora | epicentro |
|---|---|---|---|
| `attk5wls` | 6,7 | 08:22:40 | −60,500 · −47,200 |
| `us6000tmrw` | 6,2 | 08:22:37,74 | −60,379 · −47,605 |

2,3 segundos y 26 km: el mismo temblor. Con `source = 'usgs'` en ambos, la condición los dejó
pasar como sismos distintos, cada uno con su fan-out y su aviso. Se eliminó la condición —
agrupar dos filas de la misma fuente dentro de 120 s y 250 km es igual de correcto, y el
comentario original ya decía el criterio: **«queremos una alerta por sacudida, no una por
catálogo»**.

**Fallo 2 · «Contacto no responde» se mandaba a gente que no sabía del sismo.**

`notify_silent_contacts()` avisaba a **todo** el círculo de quien no había reportado, sin
comprobar que ese sismo también les aplicara. Con un premium con avisos mundiales eso filtra:
él recibe el aviso de un sismo en la Antártida, no reporta —razonablemente, no le pasó nada—
y sus contactos reciben «no responde… desde el sismo» sin haber recibido ningún aviso. **La
frase no tiene antecedente: “el sismo” no existe para quien la lee.**

Y no es solo ruido: viaja por el canal `alerts`, el mismo del aviso de sismo, que es
justamente el que no puede acostumbrar a nadie a ignorarlo. Ahora se manda solo a quienes
tienen una entrega para **ese mismo** sismo.

Lo que quedaba abierto —el umbral mundial reutilizando `alert_countrywide_magnitude`— se
resolvió con una distinción más profunda que un número: §1.13.6.

#### 1.13.6 La ALERTA y la NOTICIA eran la misma tubería (migración 0021)

Al decidir qué hacer con el umbral mundial apareció que el problema no era el umbral. Eran
**dos cosas distintas metidas en un solo canal**:

| | Alerta | Noticia |
|---|---|---|
| Qué dice | «tembló cerca tuyo» | «hubo un sismo» |
| Pone la app en modo emergencia | ✅ | ❌ |
| Dispara el push silencioso y la captura de ubicación | ✅ | ❌ |
| Activa el contador «X/Y confirmados» | ✅ | ❌ |
| Si no reportás, avisa a tu círculo | ✅ | ❌ |
| Se puede apagar | ❌ | ✅ |

Un sismo a 5.887 km entraba por la vía de la alerta y **arrastraba las cuatro consecuencias**.
Subir el umbral mundial habría hecho que pasara menos seguido; no habría arreglado que
pasara.

**El modelo nuevo:**

- **La alerta deja de mirar si sos premium.** `quake_applies()` perdió su primera rama, la
  que decía `p_is_premium and p_worldwide_enabled`. Ahora dispara por cercanía o por magnitud
  nacional, **idéntico para gratis y para premium**. Los dos parámetros siguen en la firma
  para no tocar a los seis llamadores, pero ya no se leen.
- **Lo mundial pasa a ser noticia**, con `private.notify_quake_news()` colgada de
  `fan_out_quake()` — misma transacción de la ingesta, cero invocaciones nuevas.
- **Dos interruptores**, `quake_national` (todos) y `quake_worldwide` (solo surte efecto con
  premium), en canal `quakes` propio. En Android eso es una categoría silenciable desde los
  ajustes del sistema **sin tocar las alertas**, que es justo la distinción que esto persigue.
- **Sin doble aviso:** ambas ramas excluyen a quien ya tiene una entrega de alerta para ese
  sismo. A quien le tembló cerca no se le cuenta como noticia lo que ya vivió.

Umbrales medidos sobre esta base a 7 días: **nacional ≥ 4,5** → 3 por semana (≥ 4,0 habría
dado 10), **mundial ≥ 6,0** → 3 por semana.

> **Un `NULL` que casi pasa.** La primera versión de la regla devolvía **NULL**, no `false`,
> para un sismo en mar abierto: `country_code` viene NULL y `NULL = 'PE'` es NULL. En un
> `WHERE` se comporta como falso y no habría roto nada hoy, pero cualquier llamador futuro que
> escribiera `not quake_applies(...)` habría recibido NULL y perdido el filtro **en silencio**.
> Se blindó con `coalesce(..., false)`.

**Verificado** con la función real dentro de una transacción revertida: el M6,7 del mar de
Scotia le llega **solo al premium**, como `quake_worldwide` por el canal `quakes`; un M7,2 en
Perú no le llega como noticia a quien ya recibió la alerta.

### 1.14 Permisos: una lista de tareas, no tres tarjetas

**El problema era de arquitectura de producto, no de UI.** Los tres permisos —ubicación,
notificaciones, contactos— se pedían **solo en el onboarding**. Un toque apurado en «No
permitir» dejaba a la persona sin esa capacidad *para siempre*, sin ninguna pista dentro
de la app de que faltaba algo ni forma de arreglarlo. Ajustes mostraba una tarjeta para
ubicación y nada para los otros dos.

Y no era teórico. De las tres cuentas del proyecto, **solo una tenía token de push
registrado**. La del amigo que probó las conexiones el 2026-08-20 tenía cero, y por eso no
le llegó nada — ni le habría llegado aunque los avisos de §1.13 hubieran existido antes.

> Es la deuda que hacía invisibles a todas las demás: se puede construir el mejor sistema
> de avisos del mundo y no cambia nada si el teléfono nunca pidió permiso para mostrarlos.

**La forma elegida.** Una sola tarjeta con los tres, con la **misma forma que el checklist
de preparación de la Home**: círculo de estado, nombre, y una línea que dice cómo está.
La pregunta que responde es la misma —«¿qué me falta?»— y contestarla dos veces con dos
diseños distintos obligaría a aprender dos cosas.

| Estado | Color | Ícono |
|---|---|---|
| Concedido | verde (`status.safe`) | `check-circle` |
| Parcial | ámbar (`status.helping`) | `error-outline` |
| Sin conceder | plomo (`status.unconfirmed`) | `radio-button-unchecked` |

Cuatro decisiones que no son obvias:

- **Tres grados, no dos.** La ubicación tiene un estado intermedio real: «solo con la app
  abierta» no es lo mismo que nada —sirve para reportar a mano— pero tampoco alcanza para
  lo que la app promete. Pintarlo verde mentiría; pintarlo plomo desanimaría a quien ya
  concedió algo.
- **El que falta va en plomo, no en rojo.** El rojo de la paleta significa «necesito
  ayuda» en toda la app (§1.4.1). Un permiso sin conceder no es una emergencia, y teñirlo
  igual le gastaría el significado al que sí lo es. En su lugar cada fila que falta dice
  **qué se pierde** — «No te llega nada: ni sismos, ni mensajes, ni si alguien de tu
  círculo necesita ayuda»—, que informa mucho más que un color.
- **Conceder notificaciones registra el token en el acto.** Sin ese paso, conceder el
  permiso no sirve de nada: el token es lo que el servidor necesita para poder mandar
  algo. Es exactamente lo que faltaba cuando el permiso solo se pedía en el onboarding.
- **La fila ya concedida también se toca**, y abre los Ajustes del sistema. Es donde uno
  va a revocar, y una fila muerta invitaría a pensar que no hay nada que hacer ahí.

**Se relee al volver a la app**, no solo al montar. El camino más común para conceder algo
ya rechazado es salir a los Ajustes del sistema y volver, y en ese viaje la pantalla nunca
se desmonta ni pierde el foco. Sin eso, la persona concede el permiso, vuelve, y la app le
sigue diciendo que falta. Esa lógica vive en `usePermissions()`, no en la pantalla.

**Lo que NO entró en la lista, a propósito:** el aviso de «no tenemos ninguna posición tuya
guardada». No es un permiso — puede seguir siendo cierto con los tres en verde, porque
conceder el permiso no guarda ninguna coordenada (§1.6.3.1). Meterlo entre los permisos
volvería a mezclar las dos cosas que ese bug ya demostró que son distintas.

#### 1.14.1 Los permisos que Android pedía de más

Al construir la lista apareció que `app.json` declaraba dos permisos que **nada en `src/`
usa**: `RECORD_AUDIO` y `WRITE_CONTACTS`. De la agenda solo se lee —el hash se hace en el
dispositivo (§1.6.6)— y no hay una sola función de audio en la app. No afectan a iOS, pero
en Play Console cada permiso declarado hay que justificarlo, y **pedir el micrófono en una
app de sismos** es exactamente lo que un revisor marca.

**Quitar `WRITE_CONTACTS` del array no alcanzaba.** El config plugin de `expo-contacts` lo
agrega él mismo, incondicionalmente:

```js
// node_modules/expo-contacts/plugin/build/withContacts.js
return AndroidConfig.Permissions.withPermissions(config, [
  'android.permission.READ_CONTACTS',
  'android.permission.WRITE_CONTACTS',   // ← siempre, se use o no
]);
```

Por eso va en `android.blockedPermissions`, que es el campo hecho justamente para esto:
inyecta `tools:node="remove"` para que el *manifest merger* lo saque del manifiesto final.
`RECORD_AUDIO`, en cambio, solo estaba en nuestro array y alcanzó con borrarlo.

**Verificado contra el manifiesto generado, no contra el `app.json`** —que es la única
forma de saberlo, porque los plugins escriben ahí—: se corrió `expo prebuild` y se leyó
`android/app/src/main/AndroidManifest.xml`. `RECORD_AUDIO` desapareció y `WRITE_CONTACTS`
quedó marcado con `tools:node="remove"`. La carpeta `android/` se borró después: está en
`.gitignore` y la regenera EAS, y una copia vieja es de las cosas que después hacen creer
que un cambio de `app.json` "no se aplicó".

**Tres permisos más que no pusimos nosotros**, encontrados en la misma revisión. Se dejan,
pero anotados:

| Permiso | De dónde sale | Por qué se deja |
|---|---|---|
| `SYSTEM_ALERT_WINDOW` | plantilla de Expo | Lo usa el menú de desarrollo de React Native. Bloquearlo lo rompe en los dev builds |
| `READ/WRITE_EXTERNAL_STORAGE` | `expo-file-system` | Ya vienen acotados con `maxSdkVersion="32"`: en Android 13+ son inertes. Es el patrón estándar |
| `INTERNET`, `VIBRATE` | plantilla | Obvios y necesarios |

### 1.15 🔴 El chat duplicaba cada mensaje propio en la caché local

Reportado así: *«cuando envío un mensaje me sale un relojito, y cuando salgo del chat y
regreso ya no está el reloj pero el mensaje se envió doble»*. Las dos mitades de esa frase
son dos fallos distintos con la misma raíz.

**Lo primero fue descartar lo peor:** que el duplicado estuviera en el servidor, en cuyo caso
el contacto también habría visto dos mensajes. **No lo estaba** — cero duplicados en
`public.messages`, y el índice único `(conversation_id, sender_id, client_id)` existe y
funciona, así que la idempotencia del reintento nunca estuvo comprometida. El problema vivía
entero en el teléfono de quien enviaba.

**La raíz.** El envío optimista guarda la fila local con `id = client_id`, porque en ese
momento el id del servidor todavía no existe. Al subirla, Postgres le asigna el suyo
(`gen_random_uuid()`), y `syncMessages()` insertaba esa copia **como si fuera un mensaje
nuevo**: dos filas, mismo texto, distinta clave primaria, y la lista pintaba las dos.

| Fila | `id` | `pending` |
|---|---|---|
| Provisional, del envío optimista | `client_id` | 0 (la apagaba el outbox) |
| Copia del servidor, vía `syncMessages` | id del servidor | 0 |

Eso explica también por qué el reloj **desaparecía**: el outbox apagaba `pending` en la
provisional, y la copia del servidor entraba directamente sin reloj. Ninguna de las dos
quedaba marcada, y quedaban las dos.

**El arreglo** es traer `client_id` del servidor y borrar la provisional antes de insertar la
definitiva. Tiene un efecto secundario que importa: **limpia los duplicados ya guardados**,
porque cada sincronización reintenta el borrado. Los teléfonos que arrastran el problema se
arreglan solos al abrir la conversación, sin reinstalar ni migrar la base local.

**El reloj, que era el otro fallo.** `sendMessage()` disparaba `void flushOutbox()` por
dentro, así que nadie sabía cuándo terminaba la subida: el reloj se quedaba puesto hasta que
algo ajeno provocara una relectura, normalmente el eco de Realtime. **Con el socket caído, el
mensaje ya estaba entregado y la burbuja seguía diciendo que no.** Ahora la subida la dispara
la pantalla, que es la única que puede refrescar al terminar: aparece con reloj, y se apaga
en cuanto el servidor acepta. Si de verdad no hay red, el reloj se queda — que es la verdad.

### 1.15 Los códigos de invitación salen del MVP

**Decisión (2026-08-24):** la única forma de conectarse es el **match de agenda** de la spec
§3 —hash del teléfono, más una solicitud que la otra persona acepta—. No hay códigos, no hay
link con código y no hay pantalla de invitación.

**Qué se sacó, y de los dos lados:** la pantalla `src/app/invite.tsx` y su ruta, las funciones
`createInvitation` / `redeemInvitation` del cliente, `INVITE_BASE_URL` y `inviteMessage`, la
clave `KV.pendingInviteCode`, la página `/i/` del sitio y las reglas de reescritura de
`_redirects` y `vercel.json`. Lo que queda en su lugar es **compartir la app**: la hoja de
compartir del sistema con `https://todosbien.app` y ninguna llamada al servidor, así que
ahora es una acción que no puede fallar.

**Lo que se descubrió al sacarlo, que es lo que hay que recordar.** El «auto-vínculo por
teléfono» que se citaba en `QUE-FALTA.md` como red de seguridad —*«no bloquea lanzar porque
está mitigado»*— **nunca funcionó**. El trigger existe y está bien escrito
(`private.link_pending_invitations`, migración 0002): resuelve las invitaciones cuyo
`invitee_phone_hash` coincide con el de quien acaba de registrar su número. El problema es
que **nada creaba una invitación con teléfono**: los dos llamadores del cliente pasaban
`create_invitation(null, null)`. O sea que el trigger nunca tuvo una sola fila que resolver.

Es el mismo patrón que ya apareció dos veces en este proyecto —los cuatro interruptores de
Ajustes que no mandaban nada (§1.13), y el permiso concedido que no guardaba coordenadas
(§1.6.3.1)—: **la pieza existe, se ve completa, y le falta el lado que la alimenta.** Los
tres se veían bien en el código y ninguno funcionaba.

**Lo que NO se tocó:** la tabla `invitations`, sus RPC y el trigger siguen en la base. Nadie
los llama. Se dejaron a propósito: borrarlos pide una migración para quitar algo que no
molesta, y el día que vuelvan los códigos —planes familiares, spec §13, es el caso donde
sirven de verdad— el lado del servidor ya está y probado.

**Consecuencia que hay que asumir:** sin número de teléfono, una persona **no aparece para
nadie**. El campo es opcional en el onboarding y ahora es la única llave. Vale la pena
mirarlo cuando haya usuarios reales: si mucha gente lo salta, el círculo vacío no va a tener
ninguna explicación visible.

### 1.17 🔴 «Quitar de mi círculo» no era un bloqueo, y el chat quedaba abierto

**Migración 0021, 2026-08-24.** Salió de una pregunta sobre el flujo de moderación —qué pasa
después de una denuncia— y lo que apareció fue peor que lo preguntado.

`removeConnection` hace un `delete` de la fila de `connections`. Dos consecuencias:

1. La persona removida **podía volver a mandar solicitud enseguida**, y cada intento dispara
   la notificación de «solicitud recibida» (§1.13). No podía entrar sin ser aceptada, pero sí
   podía seguir apareciendo en el teléfono de quien la sacó.
2. **La grave:** la política `messages_insert_member` (0004) solo comprueba **membresía de la
   conversación**. Ni la conversación ni sus miembros se borran al quitar el vínculo, así que
   **quien fue removido podía seguir escribiendo en el chat que ya existía**. Para acoso —el
   caso exacto para el que se acababa de construir denunciar (§1.16)— eso convierte a
   «bloquear» en una etiqueta sin efecto.

**Y el estado `'blocked'` estaba ahí desde el día uno**, en el check de `connections` de la
migración 0002 y en el tipo de TypeScript, sin que nada lo escribiera nunca. Cuarta aparición
del mismo patrón —la pieza existe, se ve completa, le falta el lado que la alimenta— después
de §1.13, §1.6.3.1 y §1.15.

**Quitar y bloquear quedan como dos acciones distintas**, y las dos hacen falta: quitar es el
caso amable y es la mayoría (ya no quiero compartir mi ubicación), bloquear es el hostil. Las
dos viven en el perfil del contacto, y bloquear además se ofrece al terminar una denuncia —
que es donde de verdad se necesita.

**Tres decisiones que no son obvias:**

- **Hizo falta una columna `blocked_by`.** `user_a`/`user_b` están en orden canónico por una
  restricción de 0002, así que la fila sola no dice quién bloqueó a quién — y eso es
  justamente lo que decide quién puede deshacerlo. Queda fuera del grant de UPDATE: si se
  pudiera escribir directo, cualquiera podría marcar que lo bloqueó el otro y quedarse con la
  llave para desbloquearse.
- **El bloqueo del chat es simétrico.** Quien bloqueó tampoco puede escribir. Un bloqueo de una
  sola dirección deja al que bloqueó mandando mensajes a alguien que no le puede contestar,
  que es acoso con otro nombre.
- **Leer el historial sigue permitido.** Solo se cierra la escritura: esconder lo que ya se
  dijo no protege a nadie y borra la evidencia de lo que se denunció.

**Verificado contra la base real, 10/10 aserciones**, con la secuencia completa: se escribe
antes de bloquear, se bloquea, deja de poder escribir en la conversación existente, tampoco
puede el que bloqueó, no puede pedir conexión, no puede desbloquearse solo, sale del círculo,
aparece en la lista de bloqueados con su nombre, se desbloquea, y el chat vuelve a abrirse.

**Y una pantalla nueva, `Ajustes → Personas bloqueadas`.** Un bloqueo que no se puede deshacer
es una trampa —bloquear por error en un mal momento es exactamente lo que va a pasar— y además
es lo que un revisor de Apple busca. `get_blocked()` es `security definer` por un motivo
concreto: la política de `profiles` solo deja ver a los contactos **aceptados**, y un
bloqueado por definición no lo es, así que sin eso la lista mostraría nombres vacíos y nadie
podría desbloquear a quien no puede ver.

### 1.16 Denunciar contenido, y por qué el chat privado igual lo necesita

**Migración 0020, 2026-08-24.** La guía **1.2 de App Store Review** pide cuatro cosas en
cualquier app donde una persona vea texto escrito por otra: poder **denunciar**, poder
**bloquear**, un **canal de contacto publicado** y **actuar en 24 horas**. La app tenía tres:
bloquear es «Quitar de mi círculo», el contacto está en `/soporte`, y el compromiso se
escribió en los términos §5.1. Faltaba denunciar.

**El matiz que no cambia la conclusión:** acá el chat es 1 a 1 entre dos personas que
**ambas aceptaron** la conexión, no hay contenido público y no hay forma de escribirle a un
desconocido. Es un caso mucho más benigno que el de una red social — pero la regla no
distingue, y el costo de tenerlo es medio día contra un ciclo de revisión perdido.

**Dónde vive, y por qué ahí.** Mantener apretado un mensaje **ajeno** en el chat, y
«Denunciar a esta persona» en el detalle del contacto. El gesto largo y no un botón visible
en cada burbuja: esto se usa una vez en la vida de una conversación, si acaso, y un ícono de
denuncia permanente en un chat entre familiares es ruido para un caso rarísimo. iOS ya enseñó
ese gesto — es lo que hace todo el mundo en Mensajes y en WhatsApp.

**Tres decisiones que no son obvias:**

- **La denuncia guarda una copia del mensaje.** Si el mensaje se borra o la persona
  denunciada elimina su cuenta, una denuncia que solo apunte con una llave foránea se queda
  sin objeto justo cuando hay que revisarla. La copia es la evidencia; el `message_id` es la
  referencia.
- **Las llaves van con `on delete set null`, al revés que todo el resto del esquema.** Cada
  tabla de este proyecto cuelga de `profiles` con `cascade`, porque borrar la cuenta tiene
  que borrar los datos de esa persona (§1.1.3). Una denuncia no es un dato *del* denunciado
  sino un registro de moderación: si se borrara con la cuenta, **bastaría con borrarse para
  limpiar el historial**. Mismo criterio que `revenuecat_events`.
- **Denunciar y quitar del círculo se ofrecen juntos, en ese orden.** Quitar es lo único con
  efecto inmediato; denunciar deja el registro. Quien denuncia normalmente quiere las dos, y
  mandarlo a buscar la segunda a otra pantalla es pedirle un trámite en el peor momento.

**Verificado contra la base real, 6/6 aserciones.** La que importa es la tercera: alguien que
no es miembro de la conversación **no puede** denunciar un mensaje de ella. Sin esa
comprobación, la copia del texto que guarda el servidor sería una forma de leer conversaciones
ajenas con solo tener un id — la funcionalidad de moderación se habría convertido en una fuga.

**Y la mitad que no es código.** Prometer «revisamos en 24 horas» y dejar las denuncias en una
tabla que nadie abre sería la cuarta aparición del patrón que este proyecto ya encontró tres
veces (§1.13, §1.6.3.1, §1.15): la pieza existe, se ve completa, y le falta el lado que la
lee. Por eso la consulta de denuncias pendientes entró en el chequeo diario del runbook. Con
volumen bajo alcanza; el día de la primera denuncia real hay que automatizar el aviso.

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
| `0014_alert_sender` | Secreto compartido del sender en Vault, rescate de avisos trabados en `sending` dentro del propio claim, cron de `send-alerts` cada minuto |
| `0015_social_notifications` | Cola `notification_deliveries` + disparadores para los cinco avisos entre personas, `connection_request` en preferencias, aviso instantáneo al cartero por `pg_net`, cron de «contacto sin responder», y el disparador que encola el fan-out de sismo **en la misma transacción** que la ingesta (§1.13) |
| `0016_drill_mode_lookup` | Desempate del simulacro que gobierna un reporte: gana el que está en curso. Lo encontró la propia prueba de 0015 (§1.13.2) |
| `0017_prune_notification_deliveries` | Poda a 30 días de la cola nueva. Descuido de 0015: sus dos tablas hermanas ya podaban, y esta es la que más crece —una fila por mensaje de chat y por destinatario— |
| `0018_push_receipts` | Tabla `push_receipts` + RPCs: guarda el `ticket_id` de cada mensaje para poder pedirle a Expo el veredicto real de APNs. Hasta acá `'sent'` solo significaba «Expo lo aceptó» (§3.5) |
| `0019_background_traces` | Tabla `background_traces`: migajas que deja la tarea de fondo, para distinguir «iOS no levantó la app» de «la levantó y murió» — dos cosas que si no, no dejan ningún rastro (§3.8.3) |
| `0020_duplicate_events_and_silent_scope` | La deduplicación deja de exigir fuentes distintas (el USGS se duplica a sí mismo), y «contacto no responde» se manda solo a quienes ese sismo también les aplicó (§1.13.5) |
| `0021_quake_news_vs_alert` | Separa la **alerta** de la **noticia**: la alerta deja de mirar si sos premium y queda igual para todos; lo mundial pasa a ser una noticia con interruptor propio (§1.13.6) |

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

Además hay cuatro INFO `rls_enabled_no_policy` —sobre `alert_deliveries`,
`notification_deliveries`, `push_receipts` y `revenuecat_events`— que **también son
intencionales**: son tablas internas, con RLS activa, cero políticas y los grants de
`anon`/`authenticated` revocados. Nadie más que `service_role` las toca, y esa es
exactamente la intención.

> Comprobado después de las migraciones 0015 y 0018: ni `claim_notification_deliveries`,
> ni `mark_notification_deliveries`, ni `record_push_tickets`, ni `list_pending_receipts`,
> ni `record_push_receipts` aparecen en la lista de funciones ejecutables por
> `authenticated`, así que los `revoke` quedaron bien puestos. Las tablas nuevas no
> agregaron ni un WARN.

**Edge Functions desplegadas**

| Función | Qué hace | Auth |
|---|---|---|
| `match-contacts` | Compara hashes de teléfono contra los números registrados. Recibe solo hashes SHA-256; la agenda en texto plano nunca llega al servidor. **v2:** consulta por lotes de 100, si no se rompe con cualquier agenda real (§1.6.6). | JWT del usuario |
| `ingest-quakes` | Consulta IGP y USGS y escribe en `quake_events`. La dispara `pg_cron` cada 2 min. | Secreto compartido en Vault |
| `send-alerts` | Drena `alert_deliveries` y postea a Expo. Borra los tokens muertos (`DeviceNotRegistered`). La dispara `pg_cron` cada minuto. | Secreto compartido en Vault |
| `send-notifications` | Lo mismo para `notification_deliveries`: los cinco avisos entre personas. La despierta un disparador de Postgres apenas hay algo encolado, con un cron cada 5 min de red de seguridad (§1.13). | Mismo secreto |
| `check-receipts` | Le pide a Expo el veredicto de APNs/FCM de cada mensaje enviado, y borra los tokens muertos. Es auditoría, no entrega: cron cada 15 min (§3.5). | Mismo secreto |

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
- `src/lib/notifications.ts` — permiso, canales de Android y registro del token en
  **cada refresco** (no solo en el onboarding: ver §3). También decide qué avisos se
  muestran: un mensaje del chat que ya está abierto no interrumpe con banner.
- `src/lib/background-alert.ts` — la mitad silenciosa del push de sismo: despierta la app
  unos segundos para capturar **dónde estaba** la persona (§3.2).
- `src/components/notification-router.tsx` — adónde lleva tocar cada aviso, con las dos
  entradas que hacen falta: la app abierta (listener) y la app cerrada, que el sistema
  levanta desde cero (§1.13.1).
- `src/hooks/use-pull-to-refresh.ts` — el spinner de tirar-para-refrescar, que **solo lo
  enciende el gesto**. Los refrescos automáticos revalidan en silencio (§1.4.2).
- `src/hooks/use-permissions.ts` + `src/components/permissions-checklist.tsx` — los tres
  permisos como lista de tareas, releídos al volver de los Ajustes del sistema (§1.14).
- `src/lib/geo.ts` — de dónde es un sismo, en español: `spot`, `label` (país y continente,
  para el feed global) y `area` (provincia y departamento, para la alerta) (§1.6.4.2).
- `src/theme/` — tokens de color, spacing y tipografía.

**Pantallas**

| Zona | Pantallas |
|---|---|
| Acceso | intro de valor (3 slides), entrar, crear cuenta, confirmar correo, olvidé mi contraseña, contraseña nueva |
| Onboarding | perfil + teléfono, permisos con contexto, contactos, plan de acción, listo |
| Tabs | Inicio, Círculo, **Sismos** (Noticias Sísmicas, §1.6.4), Chats, Ajustes |
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

> **Ese "todo lo demás" siguió abierto tres semanas más que el sismo.** La cadena de
> alerta se cerró primero y quedó tapando el hueco: el push de sismo funcionaba, así que
> parecía que el push funcionaba. Los cinco avisos entre personas —solicitudes, mensajes,
> «necesita ayuda», «no responde»— no se mandaban hasta el 2026-08-20 (§1.13). Lo destapó
> un sismo real, cuando un amigo mandó solicitud y escribió por chat y no llegó nada.

**Por qué no hay alternativa a push:** el teléfono no puede consultar Supabase
periódicamente en segundo plano — iOS mata esos procesos y consumiría batería. La única
forma de que un servidor despierte un teléfono es una notificación push.

### 3.2 Los dos trabajos distintos del push

1. **Aviso visible** — "Sismo de magnitud 5,6". Es lo que ve la persona.
2. **Push silencioso** (`contentAvailable`) — despierta la app unos segundos en background
   y ahí corre `captureLocationForActiveAlert()`, guardando dónde estaba **en ese
   momento**, con la app cerrada.

> 🔴 **Acá decía lo contrario, y era falso.** El texto original afirmaba: *"Los dos viajan
> en un solo mensaje, no en dos: iOS entrega una notificación con contenido visible y
> `content-available` a la vez, así que no hay motivo para gastar dos envíos"*. Suena
> razonable y **no es cierto**. La documentación de `expo-notifications` es explícita
> sobre qué dispara una tarea de fondo: el push tiene que contener *"only the `data` key
> (no `title`, `body`)"*. Un mensaje con alerta visible muestra el banner y **no despierta
> la app**. O sea que el trabajo n.º 2 —el que sostiene la promesa central del producto—
> no se hacía nunca, y el comentario que lo explicaba daba la impresión de estar resuelto.

**Van en dos mensajes**, uno por cada trabajo:

| | Visible | Silencioso |
|---|---|---|
| Contenido | título, cuerpo, sonido | solo `data` |
| `contentAvailable` | no | **sí** |
| Prioridad | `high` (APNs 10) | `normal` (**APNs 5**, que es lo que Apple exige para un background update) |
| Decide si el aviso cuenta como entregado | **sí** | no: es mejor-esfuerzo |

**Cómo se descubrió.** No por leer el código, sino tirando del hilo de un dato: tras el
M7,2 real del 2026-08-20, la ubicación de la única persona con token se capturó **5 h 41
min después**, al abrir la app. Al mirar por qué, apareció que el push silencioso nunca
tuvo forma de funcionar.

> **Sobre ese dato, una corrección honesta:** el primer diagnóstico dijo que la promesa
> central "no se cumplió", apoyándose en dos capturas tardías. Una de las dos no probaba
> nada —esa persona **no tenía token** cuando tembló, su token se creó dos horas después—
> y la otra venía de un dispositivo corriendo con `expo start`, donde las tareas de fondo
> son poco fiables de por sí. La conclusión era más fuerte que la evidencia. El bug del
> mensaje único sí es real y está confirmado contra la documentación, pero **cuánto
> explica de lo que se vio sigue sin medirse**: hace falta un sismo real con la app en
> TestFlight.

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

### 3.6 Receipts: la diferencia entre "Expo lo aceptó" y "llegó"

Hasta el 2026-08-21, `status = 'sent'` significaba **"Expo recibió el mensaje"**. Eso no
es entrega. Con una credencial de APNs mal asignada el ticket sale `ok` **igual**, y el
fallo aparece recién en el *receipt*, que hay que pedir después con el `ticket_id`.

Ese id se estaba tirando, y el costo se cobró exactamente cuando importaba: tratando de
responder por qué un sismo real no despertó ninguna app, **la pregunta era contestable y
no había con qué**. Los receipts viven 24 horas y el del M7,2 seguía disponible; faltaba
el id para pedirlo. Quedaban tres horas de margen.

**Cómo quedó.** Una tabla `push_receipts` con una fila por *mensaje a un dispositivo* —no
por aviso: un aviso va a N teléfonos y ahora además en dos mensajes, así que un `ticket_id`
como columna de la cola obligaría a elegir cuál guardar y perder el resto—. La edge
function `check-receipts` la barre cada 15 minutos, entre dos bordes que pone Expo:

- **15 minutos de piso**, que es lo que Expo recomienda esperar; antes el receipt puede no
  existir todavía.
- **20 horas de techo**, porque a las 24 los borra. Lo que pasa ese punto se marca vencido
  en vez de reintentarse para siempre.

De paso es donde de verdad se limpian los tokens muertos: `DeviceNotRegistered` aparece
mucho más en el receipt que en el ticket.

**Verificado de punta a punta** el 2026-08-21, con datos reales:

| | |
|---|---|
| Sonda invisible a los 3 dispositivos (1 dev + 2 TestFlight) | receipt `ok` en los 3 → **la key de APNs está bien en los dos entornos** |
| Aviso entre personas | 1 ticket anotado, barrido lo marcó `ok` |
| Alerta de sismo (sismo de prueba M0,1, dirigido a una sola cuenta) | **2 tickets: `visible` y `silent`**, los dos `ok` |
| Respuesta del barrido | `{"revisados":1,"entregados":1,"fallados":0}` |

Lo que esto **todavía no prueba** es que iOS ejecute la tarea de fondo: un receipt dice
que Apple aceptó el mensaje, no que el sistema decidió despertar la app.

### 3.7 Qué pasa cuando la app no está corriendo

La pregunta que decide si la promesa del producto es alcanzable: **esta es una app de
seguro**, que la gente instala y no vuelve a abrir en semanas. ¿Sirve de algo el push
silencioso si la app no está en segundo plano?

**Sí, y la distinción que lo salva no es "abierta o cerrada" sino _quién_ la cerró.**
Según la documentación de Apple, *"if an app is terminated for any reason other than the
user force quitting it, the system launches the app"* ante una notificación remota:

| Cómo dejó de correr | ¿Llega el aviso visible? | ¿Se despierta sola a capturar? |
|---|---|---|
| Está abierta | Sí | Sí |
| En segundo plano / suspendida | Sí | Sí |
| **iOS la mató por memoria** — lo normal tras días sin abrirla | Sí | **Sí** |
| El usuario la deslizó fuera del multitarea | **Sí** | No |

O sea que la app olvidada durante semanas **no** está en el caso malo: iOS la terminó por
memoria hace rato, y esas se relanzan. El único caso que falla es el del gesto deliberado
de cerrarla, y ni siquiera es permanente — vuelve a ser elegible la próxima vez que se
abra.

**Y el aviso visible llega siempre, en los cuatro estados.** Lo que se degrada es la
captura automática, y ahí queda la red: tocar la notificación abre la app y captura, y con
la ventana de 6 horas esa ubicación igual se asocia al sismo correcto.

Por eso el push silencioso no *es* el sistema: es la optimización para el caso en que la
persona **no puede o no llega a mirar el teléfono** —dormida, atrapada, herida—, que es
justo donde más importa y también donde más probable es que funcione, porque el teléfono
está quieto y nadie cerró nada a mano.

> **Dos honestidades.** iOS estrangula el trabajo en segundo plano de las apps que casi no
> se usan: aun con el estado correcto, la entrega es mejor-esfuerzo por diseño y no hay
> forma de garantizarla. Y existe una salida técnica que **se descarta a propósito**: la
> única excepción a la regla del cierre manual son las apps de ubicación, que iOS sí
> relanza. Suscribirse a cambios significativos de ubicación haría funcionar incluso ese
> caso, pero significa recibir ubicación de forma continua — exactamente lo que la app
> promete no hacer (§1.2), lo que dice su texto de permiso y lo que sostiene su ficha en
> la App Store. Romper la promesa central para cubrir el caso menos común sería un mal
> negocio.

**Sobre el copy de la alerta.** Se evaluó agregar "abre la app para que se actualice tu
ubicación" y se decidió **no hacerlo**. El texto actual —*"Avisa a tu círculo que estás
bien"*— ya consigue que la persona abra la app, y por un motivo mejor: le habla de su
gente, no de nuestra plomería. En una emergencia cada palabra de más cuesta atención que
no sobra, y pedirle que entienda un detalle interno de iOS para hacer bien su parte es
trasladarle un problema que no es suyo.

### 3.8 🔴 La tarea de fondo vivía donde el arranque headless no la ve

Corregido el mensaje único (§3.2), se corrió una **prueba controlada**: sismo simulado M5,0
a 5 km del usuario, entrega dirigida a una sola cuenta, app instalada desde TestFlight y
en segundo plano, teléfono sin tocar.

**No capturó en 7 minutos.** Y el resultado sirvió porque descartó todo lo demás:

| | |
|---|---|
| Los dos mensajes salieron | ✅ `silent` + `visible` |
| APNs los aceptó | ✅ receipt `ok` en ambos |
| El build declara `remote-notification` en `UIBackgroundModes` | ✅ |
| Permiso de ubicación en "Siempre" | ✅ |
| El sismo aplicaba según `quake_applies` | ✅ |
| El aviso **visible** llegó al teléfono | ✅ confirmado por el usuario |
| La app se despertó | ❌ |

**La causa.** La documentación de expo-notifications pide definir y registrar la tarea *"in
the module scope of a JS module which is **required early** by your app (e.g. in the
`index.ts` file)"*. Estaba en **`src/app/_layout.tsx`**, que es una pantalla del router.

Cuando llega un push silencioso con la app cerrada, iOS levanta el bundle en modo
**headless**: no monta pantallas ni arranca la navegación, solo ejecuta el código y busca
la tarea. Pero expo-router carga las rutas **al renderizar**, y ahí no se renderiza nada.

> O sea que la tarea existía justo cuando no hacía falta —con la app abierta— y faltaba
> justo cuando sí. Por eso nunca se notó en desarrollo: en un arranque normal funciona.

**El arreglo** es un `index.js` como entrada real, que define la tarea **antes** de cargar
el router, con `main` de `package.json` apuntando ahí. El orden de los imports es parte
del arreglo, no un detalle de estilo: `expo-router/entry` registra el componente raíz y
tiene que ir segundo.

**Necesita build nuevo**: el punto de entrada se hornea en el bundle, así que no se puede
verificar con un TestFlight anterior.

> **Una segunda causa que no se pudo descartar en su momento.** Al mismo dispositivo se le
> habían mandado **3 pushes silenciosos en hora y media**, y Apple recomienda no pasar de
> dos o tres por hora antes de empezar a estrangular. Por eso la prueba de confirmación se
> corrió con **un solo push** y el teléfono tranquilo casi hora y media antes.

### 3.8.1 ✅ Confirmado en dispositivo real — 2026-08-21 18:30 UTC

Con el build nuevo en TestFlight se repitió la prueba: M5,0 simulado a 5 km, entrega
dirigida a una sola cuenta, app en segundo plano, un único push, teléfono sin tocar.

**La app se despertó sola y escribió la ubicación 1,2 segundos después de que saliera el
aviso.** Cronología del `edge_logs`, que es el registro del servidor y no depende de lo que
reporte el cliente:

| Hora (UTC) | Qué |
|---|---|
| 18:29:59,93 | Sismo simulado insertado, y la fila de entrega para una sola cuenta |
| 18:30:00,5 | `send-alerts` entrega los dos mensajes a Expo, que acepta ambos |
| **18:30:01,27** | El teléfono pregunta `get_active_alert` — **0,7 s después del envío** |
| **18:30:01,69** | El teléfono escribe `report_status` con la ubicación |
| 18:30:02,3 | Recién acá el primer refresco completo de la app |

**Por qué esto prueba que fue la tarea de fondo y no la persona abriendo la app** — cuatro
señales independientes, y cualquiera de ellas sola ya sería difícil de explicar de otro modo:

1. **Velocidad.** 0,7 segundos entre que el mensaje sale del servidor y el teléfono
   responde. Ningún ser humano ve un banner, desbloquea y abre una app en ese tiempo.
2. **No hubo jitter.** El camino de la Home (`(tabs)/index.tsx`) llama a
   `captureLocationForActiveAlert` **con** jitter, que espera de 0 a 8 segundos antes de
   escribir (`ALERT_WRITE_JITTER_MS`). Entre la consulta y la escritura pasaron **415 ms**.
   El único llamador que pasa `jitter: false` es `src/lib/background-alert.ts`.
3. **No hubo refresco previo.** Para que la Home tuviera el sismo cargado hacía falta un
   `syncMe` completo —`user_settings`, `profiles`, `get_circle`, `tips`—, y el primero
   aparece a las 18:30:02,3, **después** de que la ubicación ya estaba escrita. Lo que
   precede a la escritura es una única consulta suelta: exactamente lo que hace la tarea.
4. **El teléfono estaba dormido.** En todo el minuto anterior al push no hizo ni una sola
   petición.

**Un detalle que parece un error y no lo es:** `location_at` quedó en 18:29:58,8, o sea
**antes** del push. Es iOS devolviendo un fix que ya tenía en memoria —
`getCurrentPositionAsync` con `Accuracy.Balanced`—, y es buena noticia: significa que el
GPS resolvió al instante en vez de gastar los ~30 segundos que da el sistema.

**Alcance honesto de la prueba.** Los 0,7 segundos delatan que la app estaba **suspendida en
memoria**, no terminada: un arranque headless en frío tarda de 1 a 3 segundos solo en cargar
el bundle. O sea que esto confirma el arreglo del §3.2 —el mensaje único— en el caso más
común, que es la app en segundo plano. El arreglo del `index.js` cubre el caso de app
terminada por el sistema, y **ese camino no quedó ejercitado acá**. Ver §3.8.2 para el
intento de probarlo, que salió mal por el diseño de la prueba.

### 3.8.2 🔴 Reiniciar el teléfono NO simula "app cerrada hace semanas"

Para ejercitar el arranque en frío se propuso lo que parecía obvio: reiniciar el teléfono, no
abrir la app, y repetir la prueba. **Se corrió dos veces y las dos dieron negativo**, sin una
sola petición de la app:

| Intento | Condiciones | Resultado |
|---|---|---|
| 18:47 UTC | 2º push silencioso en 16 min | ❌ nada, receipts `ok` los dos |
| 20:09 UTC | 1 h 20 min de teléfono tranquilo | ❌ nada, receipts `ok` los dos |

**Los receipts son la pieza que hace útiles a estos negativos:** APNs confirmó haber
entregado el mensaje silencioso al dispositivo. No fue un problema de entrega ni de
estrangulamiento — iOS recibió el push y **eligió no levantar la app**.

**La causa es el diseño de la prueba.** Reiniciar no produce el estado que se quería medir,
produce uno **más estricto**: lo que reportan consistentemente los desarrolladores es que
tras un reinicio iOS trata a la app como si el usuario la hubiera cerrado a mano, y no la
relanza con un push silencioso hasta que se abre una vez.

> **Con la honestidad que corresponde:** la documentación de Apple es **ambigua justo acá**.
> Su texto sobre el cierre manual dice que el usuario debe *"relaunch your app **or restart
> the device**"* para que el sistema vuelva a lanzarla sola — o sea que reiniciar debería
> *restaurar* la elegibilidad, lo contrario de lo observado. Dos negativos limpios son
> evidencia, no prueba.

**Qué queda sin medir.** El caso realista de una app-seguro no es un teléfono recién
reiniciado: es un teléfono que lleva semanas encendido, con la app **desalojada por presión
de memoria**. Esa app sí fue lanzada desde el último arranque, así que no cae en esta regla.
Ese caso sigue sin probarse y no hay forma cómoda de forzarlo.

**Y la ambigüedad de fondo no se resuelve mirando desde el servidor:** "iOS nunca la levantó"
y "la levantó y la tarea murió antes de llegar a la red" dejan **exactamente el mismo
rastro** — ninguno. Por eso la tarea de fondo ahora deja una **migaja local** en su primera
línea (§3.8.3): la próxima vez que ocurra, el dato lo va a dar el uso real y no una prueba
armada.

**Una propiedad que apareció y vale para el producto:** que iOS se niegue tras un reinicio
tiene salida natural. El aviso **visible** llega igual; tocarlo abre la app, lo que captura
la ubicación **y** le devuelve a la app el permiso de despertarse sola. Quien responde a la
alerta se auto-repara. Está reflejado en `QUE-PROMETE-LA-APP.md`.

### 3.8.3 Migajas: cómo se contesta la pregunta sin armar más pruebas

La ambigüedad de §3.8.2 —"no la levantó" contra "la levantó y se murió"— no se resuelve
mirando desde el servidor, porque las dos no dejan rastro. Así que la tarea de fondo ahora
anota **una migaja local en su primera línea**, antes de consultar nada
(`src/lib/background-trace.ts`, migración 0019).

| Lo que se ve después | Qué significa |
|---|---|
| Ninguna migaja | iOS no levantó la app |
| `woke` y nada más | Arrancó y murió antes de consultar |
| `woke` + `alert:none` | Arrancó bien; el servidor dijo que no había alerta |
| `woke` + `alert:found` + `captured` | Todo funcionó |

**Por qué local y no una escritura de red inmediata**, que sería más directo: esa escritura
podría fallar **justo por lo que se está investigando** —sin sesión restaurada, sin red, o
porque la app nunca arrancó—, y entonces la migaja tendría el mismo punto ciego que el
problema. Guardarla local no depende de nada salvo de que el JS haya corrido, que es
exactamente la pregunta. Se suben todas juntas en el próximo `syncEverything()`, y **el
borrado local va después de que el servidor confirmó**: al revés se perdería la evidencia de
un despertar sin red, que es uno de los casos que queremos poder ver.

**El efecto que más vale:** ya no hace falta armar pruebas. La respuesta la va a dar el **uso
real**, la próxima vez que tiemble en el teléfono de cualquier usuario.

`stage` es texto libre en la base a propósito, para no necesitar una migración cada vez que
se agrega un punto de medida. La tabla tiene poda a 30 días, como sus hermanas.

---

## 4. Pendiente (no bloqueado)

👉 **El trabajo pendiente vive en `docs/QUE-FALTA.md`**, que es el índice único: código,
iOS y Android en un solo lugar.

Estaba repartido entre este documento y el checklist de la guía de despliegue, y dos listas
de lo mismo en archivos distintos se separan siempre. Acá quedan las **deudas conocidas**,
que son otra cosa: problemas de lo que ya está construido, no trabajo nuevo.

Lo que se cerró del plan original: el fan-out (0010), el sender (0014), `eas init` y la
tarea de fondo. El bloque de push está completo en iOS (§3), y desde el 2026-08-20 eso
incluye **los cinco avisos entre personas** (§1.13), que era la mitad de la spec §7 que
seguía sin existir.

> **Cómo ver el modo alerta hoy.** La regla funciona y ya hubo un sismo real que la cumplía
> —el M4,8 de Lurín del 2026-08-19, a 49,1 km de Lima (§1.6.3.1)—, así que la afirmación
> anterior de que "la semana estuvo tranquila y lejos" quedó vieja. Aun así, los sismos que
> disparan alerta son poco frecuentes: para recorrer el flujo cuando se quiera, está el
> **simulacro**, que es justamente uno de los propósitos que le da la spec §9.

### Deudas conocidas

- **🟡 "Mi ubicación" en modo alerta no está verificada en dispositivo.** Typecheck, lint y
  bundle de iOS en verde, pero **no se probó en el simulador a propósito**: el GPS del
  simulador es una posición fija inventada, así que "me moví y actualizo" —que es
  justamente lo que hay que comprobar— ahí no se puede observar. Falta en un teléfono real:
  con una alerta activa (o un simulacro), ver el mapa con la posición propia, caminar unos
  metros, tocar «Actualizar mi ubicación» y confirmar tres cosas — que el pin se mueve, que
  `user_status` queda con las coordenadas nuevas, y que **el estado reportado no cambia**.
  Probar también el camino sin permiso concedido, que debe abrir el diálogo hacia Ajustes
  en vez de fallar en silencio. Ver §1.2.3.
- **🟡 Los dos mapas embebidos no están verificados en pantalla.** Typecheck, lint y bundle
  de iOS en verde, y las props usadas están confirmadas contra los tipos de
  `react-native-maps` 1.27.2 (`cacheEnabled` y `userInterfaceStyle` en ambas plataformas,
  `liteMode` solo Android). Falta **reconstruir el dev client** —es un módulo nativo nuevo,
  el build actual no lo trae— y mirar las dos pantallas: que el pin caiga donde debe, que
  el encuadre de 300 km del epicentro y el de 3 km del contacto se lean bien, que el tema
  oscuro cambie, y que el toque abra Apple Maps con la etiqueta correcta en vez de una
  búsqueda. Ver §1.2.1.
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
  contraseña (§1.1.1) y todavía no está hecha. **Qué crear y cómo sembrarla está escrito en
  `docs/REVISION-APPLE.md` §1**, junto con las notas para el revisor: lo que faltaba no era
  saber que hacía falta, era el detalle de qué tiene que tener adentro para que la revisión
  pueda evaluar la app. Una cuenta vacía deja al revisor mirando una pantalla sin nada y es
  motivo de rechazo tanto como una que no abre.
- **🔴 El chat no tiene «denunciar», y Apple lo pide.** La guía 1.2 exige, en apps con
  contenido entre usuarios, poder denunciar y bloquear. Bloquear existe —eliminar la
  conexión—; denunciar no. Es el rechazo más probable del primer envío
  (`docs/REVISION-APPLE.md` §4).
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
- ~~**Simulacro en modo "avisar al círculo".**~~ Hecho el 2026-08-20 (§1.13.2). El
  disparador de «necesita ayuda» lee `drills.mode` y se calla si el simulacro es
  silencioso; si es con aviso, el texto dice **«Simulacro ·»** y «NO es una emergencia
  real», que es literalmente lo que la pantalla promete. Ante la duda —un reporte marcado
  como simulacro sin un simulacro que lo respalde— se calla.
- ~~**`status = 'sent'` significa "Expo lo aceptó", no "llegó".**~~ Resuelto el 2026-08-21
  (§3.6): se guarda el `ticket_id` de cada mensaje y un barrido cada 15 min le pide a Expo
  el veredicto real de APNs. **Nota histórica de lo que decía esta deuda:** el
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
- **🟡 El texto del aviso de sismo usa el `place` crudo del USGS, que viene en inglés.** Un
  sismo peruano llega bien —el IGP da la referencia en español— pero uno global se anuncia
  como "170 km NE of Lorengau, Papua New Guinea" dentro de una app en español.
  `src/lib/geo.ts` ya resuelve país y continente para el feed; `send-alerts` debería usar
  lo mismo. Solo afecta a las alertas mundiales, que son premium.
  > No aplica al sender nuevo de §1.13: ahí el texto se arma **en Postgres al encolar**,
  > con el nombre de la persona, así que no pasa por `place` en ningún momento.
- ~~**El permiso de notificaciones solo se pide en el onboarding.**~~ Hecho el 2026-08-20
  (§1.14), y ampliado a los tres permisos en vez de solo ese: Ajustes tiene ahora una
  lista de tareas con ubicación, notificaciones y contactos, que se relee al volver de los
  Ajustes del sistema y **registra el token de push en el acto** al conceder.
- ~~**`app.json` declara dos permisos de Android que la app no usa.**~~ Quitados el
  2026-08-20 (§1.14.1), y verificados contra el manifiesto que genera `prebuild`, no
  contra el `app.json`.
- **🟡 Quedan tres permisos de Android que no pusimos nosotros**, y que conviene decidir
  antes de publicar en Play (§1.14.1): `SYSTEM_ALERT_WINDOW` viene de la plantilla de
  Expo, y `READ/WRITE_EXTERNAL_STORAGE` de `expo-file-system`, ya acotados con
  `maxSdkVersion="32"`. La recomendación es dejarlos —bloquear el primero rompe el menú
  de desarrollo y los otros dos son el patrón estándar y aceptado— pero queda anotado
  porque el que firma la declaración de permisos en Play Console es quien publica.
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
tier B2B · donaciones.

> El **punto de encuentro marcado en mapa** ya no figura acá: no está pospuesto, está
> **descartado** (§1.2.2). "Fuera de alcance" significa "todavía no"; esto es "no".

---

## 6. Bitácora

| Fecha | Qué pasó |
|---|---|
| 2026-08-24 | 🔴 **«Quitar de mi círculo» no era un bloqueo** (§1.17, migración 0021). Salió de preguntar qué pasa después de una denuncia. Dos agujeros: quien era removido podía **volver a mandar solicitud** —y cada intento le llegaba como aviso a quien lo sacó—, y sobre todo **podía seguir escribiendo en el chat que ya existía**, porque la política de `messages` comprueba membresía de la conversación y esa no se borra al quitar el vínculo. Para acoso, que es el caso para el que se acababa de construir denunciar, «bloquear» era una etiqueta sin efecto. **El estado `'blocked'` estaba en el esquema desde 0002 y nada lo escribía**: cuarta aparición del patrón. Ahora quitar y bloquear son dos acciones distintas —la amable y la hostil—, el bloqueo cierra el chat **en las dos direcciones** (un bloqueo de una sola deja al que bloqueó escribiéndole a alguien que no le puede contestar), leer el historial sigue permitido porque esconderlo borraría la evidencia de lo denunciado, y hay pantalla de **Personas bloqueadas** para deshacerlo. 10/10 aserciones contra la base real, incluida la secuencia completa de bloquear, comprobar el chat cerrado, desbloquear y verlo reabrirse. |
| 2026-08-24 | **Denunciar contenido** (§1.16, migración 0020): el último ítem de código que separaba a la app de la revisión. Tres decisiones que no son obvias: la denuncia **guarda una copia del mensaje**, porque una llave foránea a un mensaje que se borra deja la denuncia sin objeto justo cuando hay que revisarla; las llaves van con **`on delete set null` y no `cascade`**, al revés que todo el resto del esquema, porque si borrar la cuenta borrara las denuncias bastaría con borrarse para limpiar el historial; y el gesto es **mantener apretado** y no un botón en cada burbuja, porque un ícono de denuncia permanente en un chat entre familiares es ruido para un caso rarísimo. **6/6 aserciones contra la base real**, incluida la que importa: alguien que no está en la conversación no puede denunciar un mensaje de ella —si no, la copia del texto sería una forma de leer conversaciones ajenas—. Se cerró además la mitad que no es código: cláusula de tolerancia cero en los términos §5.1, y una consulta diaria en el runbook, porque prometer 24 horas y dejar las denuncias en una tabla que nadie abre sería la cuarta repetición del patrón que este proyecto ya encontró tres veces. |
| 2026-08-24 | 🔴 **Los textos de permiso del `Info.plist` habían quedado fuera de la auditoría, y son los que más pesan.** `app.json` seguía diciendo *«dónde estabas cuando ocurre un sismo»* y *«toma tu ubicación una sola vez, en el momento en que ocurre un sismo»*: las dos frases exactas que la auditoría del 21/08 retiró de las pantallas —la primera por vender humo (`QUE-PROMETE` §6), la segunda por omitir la lectura inicial que la propia pantalla dispara—. Sobrevivieron porque **el inventario de §10 de ese documento no incluía `app.json`**, y ahí es donde más importan: es el texto del diálogo del sistema, lo que lee el revisor y lo que declara el Nutrition Label. Corregidos, y `app.json` sumado al inventario **en primer lugar**, con la razón que lo hace urgente: viaja dentro del binario, así que corregirlo tarde obliga a un build nuevo. |
| 2026-08-24 | **Fuera los códigos de invitación** (§1.15), y al sacarlos apareció que el «auto-vínculo por teléfono» que se citaba como mitigación **nunca funcionó**: el trigger estaba bien, pero los dos llamadores del cliente creaban la invitación con `invitee_phone_hash` en `null`, así que no tenía nunca qué resolver. Tercera aparición del mismo patrón —la pieza existe, se ve completa y le falta el lado que la alimenta— después de los interruptores que no mandaban nada (§1.13) y del permiso que no guardaba coordenadas (§1.6.3.1). La tabla y las RPC se dejaron en la base para cuando vuelvan con los planes familiares. **Consecuencia asumida:** sin teléfono, una persona no aparece para nadie. |
| 2026-08-24 | **Seis documentos nuevos, y el trabajo que faltaba era escribir, no programar.** `ALCANCE-Y-IDIOMAS.md` (se publica en LatAm, EE. UU. y Asia, en español e inglés — pero el primer envío va **solo a Perú**, porque la regla «sismo fuerte en tu país» no se evalúa fuera del Perú: el USGS trae `country_code` en NULL, y el onboarding normaliza todo teléfono como peruano, lo que rompe en silencio la única vía de conexión que queda), `FICHA-APP-STORE.md` (texto contado, sin la keyword «alerta sísmica», que es la más buscada y la única prohibida), `PRIVACIDAD-APP-STORE.md`, `REVISION-APPLE.md`, `VERIFICACION-EN-DISPOSITIVO.md` —que le da un lugar dónde tacharse a las cuatro deudas de «sin verificar en pantalla», que eran una sola tarea escrita cuatro veces— y `RUNBOOK-OPERACION.md`. **Encontrado de paso:** el sitio ya está desplegado en Hostinger, donde `vercel.json` y `_redirects` no se aplican; y la política de privacidad todavía decía «una sola posición tomada en el momento del evento», la promesa retirada, ahora corregida junto con el titular del banco de datos que la Ley 29733 exige. |
| 2026-08-22 | 🔴 **El chat duplicaba cada mensaje propio, solo en la caché local** (§1.15). Reportado como «sale un relojito, y al volver al chat ya no está pero el mensaje se envió doble» — dos fallos con la misma raíz. **Lo primero fue descartar lo peor**, que el duplicado estuviera en el servidor y el contacto también viera dos: no lo estaba, cero duplicados en `public.messages` y el índice único `(conversation_id, sender_id, client_id)` funcionando, así que la idempotencia del reintento nunca estuvo comprometida. La raíz: el envío optimista guarda la fila local con `id = client_id` porque el id del servidor todavía no existe, y `syncMessages()` insertaba después la copia del servidor **como un mensaje nuevo** — dos filas, mismo texto, distinta clave. Eso explica también por qué el reloj desaparecía: el outbox apagaba `pending` en la provisional y la copia del servidor nacía sin reloj, así que ninguna de las dos quedaba marcada. Arreglado trayendo `client_id` y borrando la provisional antes de insertar la definitiva, lo que además **limpia los duplicados ya guardados** en cada sincronización: los teléfonos afectados se arreglan solos al abrir la conversación. **El reloj era un segundo fallo:** `sendMessage()` hacía `void flushOutbox()` por dentro y nadie sabía cuándo terminaba, así que el reloj quedaba puesto hasta que algo ajeno forzara una relectura —normalmente el eco de Realtime—; con el socket caído el mensaje ya estaba entregado y la burbuja seguía diciendo que no. Ahora la subida la dispara la pantalla, que es la única que puede refrescar al terminar. |
| 2026-08-22 | ⭐ **La ALERTA y la NOTICIA dejan de ser la misma cosa** (§1.13.6, migración 0021). Salió de decidir qué umbral ponerle a los avisos mundiales, y la respuesta fue que el umbral no era el problema: un sismo a 5.887 km entraba por la vía de la **alerta** y arrastraba sus cuatro consecuencias —modo emergencia, push silencioso, contador «X/Y confirmados» y aviso al círculo si no reportabas—. Subir el umbral habría hecho que pasara menos seguido, no que dejara de pasar. Ahora **la alerta no mira si sos premium**: `quake_applies()` perdió la rama `p_is_premium and p_worldwide_enabled` y dispara solo por cercanía o magnitud nacional, **idéntica para gratis y premium** — el premium no compra seguridad, que es además un mejor argumento de venta que el anterior. Lo mundial pasó a ser **noticia**, con dos interruptores (`quake_national` para todos, `quake_worldwide` solo con premium) y **canal `quakes` propio**, que en Android es una categoría silenciable desde el sistema sin tocar las alertas. Ninguna de las dos ramas avisa a quien ya recibió la alerta de ese sismo: a quien le tembló cerca no se le cuenta como noticia lo que ya vivió. Umbrales medidos sobre la propia base: nacional ≥ 4,5 y mundial ≥ 6,0, 3 por semana cada uno. **Un `NULL` que casi pasa:** la primera versión devolvía NULL en vez de `false` para un sismo en mar abierto —`country_code` es NULL y `NULL = 'PE'` es NULL—; en un `WHERE` se comporta como falso y no rompía nada hoy, pero un futuro `not quake_applies(...)` habría perdido el filtro en silencio. Blindado con `coalesce`. Verificado con la función real dentro de una transacción revertida. |
| 2026-08-22 | 🔴 **Un M6,7 en la Antártida destapó dos fallos de notificaciones** (§1.13.5, migración 0020). Un sismo en el mar de Scotia, a **5.887 km de Lima**, llegó **dos veces** al único usuario premium con avisos mundiales; sus dos contactos, que no recibieron ningún aviso, recibieron en cambio *«no responde… desde el sismo»*, también dos veces. **Lo primero fue descartar que el disparo fuera el bug**: no lo era, la regla mundial de premium es magnitud ≥ 6,0 y el sismo era 6,7. (1) La **deduplicación** exigía `q.source <> new.source`, escrita cuando el único duplicado imaginado era IGP-contra-USGS — pero **el USGS publica el mismo sismo bajo varios ids propios**, una solución automática y la revisada de su catálogo: `attk5wls` (M6,7) y `us6000tmrw` (M6,2), a 2,3 segundos y 26 km, entraron como sismos distintos con un fan-out cada uno. Se quitó la condición. (2) **«Contacto no responde» se mandaba a todo el círculo** sin comprobar que el sismo también les aplicara, así que los avisos mundiales de un premium se filtran a sus contactos no premium como una frase sin antecedente: *«el sismo»* no existe para quien la lee. Y viaja por el canal `alerts`, el mismo del aviso de sismo — el que menos puede acostumbrar a nadie a ignorarlo. Ahora se manda solo a quienes tienen entrega para ese mismo sismo. **Queda abierto lo de producto:** el umbral mundial reutiliza `alert_countrywide_magnitude`, sin ajuste propio, así que querer M6 en Perú obliga a recibir M6 en todo el planeta — medido: **0,6 por día**. |
| 2026-08-21 | 🔴 **Auditoría de los textos de la app contra `QUE-PROMETE-LA-APP.md`: 7 prometían de más.** El más grave **no era de marketing sino de privacidad**: la pantalla de permisos del onboarding decía que la ubicación se toma *"una sola vez, en el momento en que ocurre un sismo en tu zona"*, y **omitía la lectura inicial que esa misma pantalla dispara** —`ensureInitialLocation()`, unas líneas más arriba en el mismo handler—. O sea que la persona concedía el permiso creyendo que no se tomaba ninguna posición todavía, cuando sí. Eso es lo que declara el Nutrition Label, así que era además un riesgo de revisión. La misma frase estaba repetida en Ajustes. Los otros cinco: *"dónde estaba cuando ocurrió el sismo"* en la primera diapositiva que ve un usuario nuevo; *"se capturará al ocurrir un sismo"*; la tarjeta de notificaciones que enumeraba qué se avisa y **se olvidaba del sismo**, que es la función principal —y decía *"solo"*, o sea que era una afirmación falsa sobre el alcance, además inconsistente con la lista de permisos de Ajustes, que sí lo nombra—; *"tu círculo lo ve al instante"* en dos lugares, cuando un *"estoy bien"* no manda push y el círculo lo ve al refrescar; y *"la app puede hacer lo que promete"* con los tres permisos en verde, que ya no es cierto porque la captura depende además de la actualización en segundo plano y del modo de bajo consumo. **De paso se corrigió el documento nuevo**, que decía *"no funciona sin internet"* de forma demasiado absoluta: hay outbox y caché local, y el texto de la app era el correcto. Queda en §10 de ese archivo el **inventario de dónde vive cada afirmación**, para que la próxima auditoría no exija barrer el código entero. |
| 2026-08-21 | 📄 **`QUE-PROMETE-LA-APP.md`, y el retiro de una promesa que era humo.** La app decía guardar *"dónde estabas cuando tembló"*, y no es cierto: el aviso llega ~8 minutos después —de los cuales **7 m 45 s son del IGP**—, así que lo que se guarda es dónde estás **minutos después**. Se retiró esa frase y todas sus variantes. **El reencuadre no debilita el producto, lo mejora:** nadie necesita una reconstrucción forense de hace ocho minutos; una madre necesita saber dónde estás **ahora** para ir a buscarte, y si evacuaste a la calle, la ubicación de la calle es la útil. También se separó lo que se promete **sin asterisco** (el aviso llega en los cuatro estados de la app, incluida cerrada a mano) de lo que se promete **con letra chica** (la captura automática, que depende de permisos, actualización en segundo plano, modo de bajo consumo y de que la app se haya abierto una vez desde el último reinicio). El archivo es la **fuente única** de las afirmaciones públicas: landing, ficha de tienda y textos de la app salen de ahí — la misma disciplina que ya rige para las páginas legales, que se desactualizan en silencio y rompen revisiones de tienda. De paso quedó escrito el argumento que sí se sostiene con 8 minutos de retraso: **las líneas se saturan durante horas, y un toque en una app pasa cuando una llamada no pasa.** |
| 2026-08-21 | 🔴 **Reiniciar el teléfono no simula "app cerrada hace semanas" — error de diseño de la prueba** (§3.8.2). Se propuso reiniciar para ejercitar el arranque en frío; dos intentos, dos negativos, sin una sola petición de la app. **Los receipts vinieron `ok` las dos veces**, o sea que APNs entregó el push silencioso y **iOS eligió no levantar la app**: no fue entrega ni estrangulamiento. La causa es el método — tras un reinicio iOS trata a la app como si el usuario la hubiera cerrado a mano, y no la relanza hasta que se abre una vez. Dicho con la honestidad que corresponde: **la documentación de Apple es ambigua justo acá**, porque su texto sobre el cierre manual dice que reiniciar el dispositivo *restaura* la elegibilidad, lo contrario de lo observado; dos negativos son evidencia, no prueba. **Lo que queda sin medir** es el caso realista: teléfono encendido hace semanas, app desalojada por memoria, que **no** cae en esta regla y no hay forma cómoda de forzar. Se cerró la ambigüedad de raíz con **migajas** (§3.8.3, migración 0019): la tarea anota local en su primera línea, y se suben en el próximo refresco. Local y no red, porque una escritura de red al arrancar en headless podría fallar por lo mismo que se investiga, y la migaja tendría el mismo punto ciego que el problema. **Ya no hace falta armar pruebas: contesta el uso real.** Apareció además una propiedad que sirve al producto — el aviso visible llega igual, y tocarlo captura la ubicación **y** le devuelve a la app el permiso de despertarse sola, así que quien responde a la alerta se auto-repara. |
| 2026-08-21 | ✅ **La promesa central de la app quedó probada en un dispositivo real** (§3.8.1). Con el build nuevo en TestFlight se repitió la prueba controlada: M5,0 simulado a 5 km, entrega dirigida a una sola cuenta, **un solo push**, teléfono en segundo plano y sin tocar desde hacía hora y media. **La app se despertó sola y escribió la ubicación 1,2 segundos después de que saliera el aviso** — 0,7 s hasta que el teléfono preguntó `get_active_alert` y 0,4 s más hasta el `report_status`. Cuatro señales del `edge_logs` descartan que lo haya hecho la persona abriendo la app: (1) 0,7 s es más rápido de lo que nadie reacciona a un banner; (2) **no hubo jitter** — el camino de la Home espera de 0 a 8 s antes de escribir y acá pasaron 415 ms, y el único llamador con `jitter: false` es la tarea de fondo; (3) **no hubo refresco previo** — el primer `syncMe` completo aparece *después* de que la ubicación ya estaba escrita, y lo que precede a la escritura es una consulta suelta; (4) el teléfono no hizo **ni una petición** en todo el minuto anterior. Los dos seguros funcionaron: una sola fila de entrega, y ni Tracy ni Fabrizio recibieron nada. **Lo que la prueba no cubre**, dicho sin adornos: esos 0,7 s delatan una app **suspendida en memoria**, no terminada — un arranque headless en frío tarda de 1 a 3 s solo en cargar el bundle. O sea que esto confirma el arreglo del mensaje único (§3.2) en el caso común; el arreglo del `index.js`, que cubre la app terminada por el sistema, **sigue sin ejercitarse**. Se prueba reiniciando el teléfono, no abriendo la app, y repitiendo. |
| 2026-08-21 | 🔴 **Segundo bug del push silencioso, encontrado por una prueba controlada** (§3.8). Corregido el del mensaje único, se simuló un sismo M5,0 a 5 km del usuario, dirigido a una sola cuenta, con la app de TestFlight en segundo plano. **No capturó en 7 minutos**, y eso descartó todo el resto: los dos mensajes salieron, APNs los aceptó, el build declara `remote-notification`, el permiso estaba en "Siempre", la regla aplicaba, y el aviso visible **sí** llegó. El fallo estaba en el cliente: la tarea de fondo se definía en `src/app/_layout.tsx`, una pantalla del router. En un arranque *headless* —el que provoca un push con la app cerrada— iOS no monta pantallas, y expo-router carga las rutas al renderizar: la tarea nunca llegaba a existir. Existía justo cuando no hacía falta y faltaba justo cuando sí, que es por qué en desarrollo siempre pareció andar. Arreglado con un `index.js` de entrada real que la define antes del router. **Necesita build nuevo para verificarse.** No se pudo descartar una segunda causa concurrente: al mismo dispositivo se le habían mandado 3 pushes silenciosos en hora y media, y Apple estrangula a partir de dos o tres por hora. |
| 2026-08-21 | **Qué pasa cuando la app no está corriendo, contestado con la documentación de Apple** (§3.7). La duda de fondo era si el push silencioso sirve de algo en una app-seguro que nadie abre en semanas. La distinción que lo salva no es "abierta o cerrada" sino **quién la cerró**: iOS relanza las apps que él mismo terminó por memoria —el estado normal de una app olvidada— y no relanza las que el usuario deslizó fuera del multitarea. El aviso **visible llega en los cuatro estados**; lo que se degrada es solo la captura automática, con la apertura manual como red. Se descartó a propósito la única salida técnica que cubriría también el cierre manual —suscribirse a cambios significativos de ubicación, que iOS sí relanza— porque significa recibir ubicación continua, exactamente lo que la app promete no hacer. También se decidió **no** agregar "abre la app para actualizar tu ubicación" al texto de la alerta. |
| 2026-08-21 | 🔴 **El push silencioso no podía funcionar, y el comentario que lo explicaba decía que sí** (§3.2). El aviso de sismo mandaba título, cuerpo y `contentAvailable` en **un solo mensaje**, con un comentario que argumentaba que era lo correcto —"no hay motivo para gastar dos envíos"—. La documentación de expo-notifications dice lo contrario: para disparar una tarea de fondo el push tiene que contener *"only the `data` key (no `title`, `body`)"*. O sea que el trabajo que sostiene la promesa central del producto —capturar **dónde estabas cuando tembló**— no se hacía nunca, y estaba documentado como resuelto. Ahora van dos mensajes: el visible con prioridad alta y el silencioso solo con `data` y prioridad normal (APNs 5, que es lo que Apple exige para un background update). **De paso se cerró la deuda que impedía saberlo**: se guarda el `ticket_id` de cada mensaje y un barrido cada 15 min le pide a Expo el veredicto real de APNs (§3.6, migración 0018). Verificado con sondas invisibles a los 3 dispositivos —receipt `ok` en el dev y en los dos de TestFlight, o sea que la key de APNs está bien en los dos entornos— y con un sismo de prueba M0,1 dirigido a una sola cuenta, que produjo los dos tickets esperados y ambos `ok`. |
| 2026-08-21 | **Corrección de un diagnóstico propio.** El día anterior se afirmó, a partir de dos capturas de ubicación tardías tras el M7,2, que "la promesa central no se cumplió". Al revisar quién era quién: una de las dos personas **no tenía token** cuando tembló —lo creó dos horas después—, así que su captura tardía no probaba nada, y la otra corría con `expo start`, donde las tareas de fondo son poco fiables de por sí. La conclusión era más fuerte que la evidencia. El bug del mensaje único es real y está confirmado contra la documentación, pero **cuánto explica de lo observado sigue sin medirse**: hace falta un sismo real con la app instalada desde TestFlight. |
| 2026-08-20 | **"Mi ubicación" en la Home de alerta, y la ventana de 6 horas por fin escrita** (§1.2.3). La captura automática ocurre una sola vez, al dispararse la alerta, así que responde "dónde estaba cuando ocurrió" — pero la persona evacúa, va al punto de encuentro o sale a buscar a alguien, y su círculo se quedaba **hasta 6 horas mirando una posición vieja sin ninguna señal de que lo era**. Ahora hay una tarjeta con el mapa de la posición propia y un botón para volver a tomarla. **Va después del círculo, y el primer intento la puso antes**: medido en un iPhone de 852 pt, esos ~326 pt de tarjeta empujaban el arranque del círculo a y≈877 —fuera de pantalla— y ver cómo está tu gente es el propósito de la app. Comprimir no alcanzaba (sin mapa, el círculo seguía arrancando en y≈711): el problema era el orden, no el tamaño. **No es tracking**: la dispara la persona, no la app, y la tarjeta solo se monta en la rama de alerta — fuera de una alerta no hay nada que avisar y ese botón sería el seguimiento que prometemos no hacer. Detalle que no era obvio: actualizar la ubicación reescribe el estado como `effectiveStatus ?? 'unconfirmed'` y **no** como `myStatus.status`, porque copiar el estado crudo daría por confirmado en este sismo a quien reportó "estoy bien" en el anterior, y el contador "X/Y confirmados" mentiría. **Segundo hallazgo, de la pregunta que lo originó:** cuánto dura el modo alerta no estaba definido en ninguna parte salvo el código —6 h en `ACTIVE_ALERT_WINDOW_MS` y 6 h en el `interval` de `get_active_alert()`— y encima el comentario de la constante citaba "spec §5.2", una sección que nunca habló del plazo. Se escribió como **spec §5.3** con el porqué, y quedó advertida la duplicación TypeScript/SQL, que no tiene arreglo posible: no hay forma de compartir una constante entre los dos y separarlos rompe en ambas direcciones. La migración 0010 no se tocó, porque reescribir una migración ya aplicada es peor que la duplicación. |
| 2026-08-20 | **El punto de encuentro en mapa queda descartado, no pospuesto** (§1.2.2). Salió de revisar §1.2.1: al documentar que Places API y Geocoding API son las dos que sí se pagan, quedó a la vista que la única funcionalidad que las iba a necesitar era el selector de punto de encuentro en mapa — y esa funcionalidad no convence por producto, no por costo. **Un lugar de reunión tiene que poder decirse en voz alta y recordarse de memoria, incluidos los niños; una coordenada no cumple ninguna de las dos**, y falla justo en el escenario para el que existe: sin batería, sin señal, o con alguien que no es el dueño del teléfono. Se reescribieron los dos lugares de la spec que lo prometían (§8 "fase futura" y §13 beneficio Premium) en vez de dejarlos como pendientes, y se sacó de "Fuera de alcance del MVP", que significa "todavía no" y acá corresponde "no". **Lo que sobrevive del beneficio Premium** son los múltiples planes de acción —casa, trabajo, colegio—, cada uno en texto. **Lo que no cambia** es el tip "Acuerda un punto de encuentro" (0005, Cruz Roja Peruana): se descartó mapear la práctica, no la práctica. Efecto lateral que vale la pena: sin ninguna pantalla donde alguien *elija* un punto, la app nunca va a tocar Places ni Geocoding, así que el costo de mapas queda en cero por diseño y no por vigilancia. |
| 2026-08-20 | **Mapas embebidos, revirtiendo la decisión del MVP** (§1.2.1). El detalle del sismo y el del contacto muestran ahora un mini mapa con `react-native-maps` 1.27.2. La decisión anterior —solo deep link, sin mapa— se había tomado para evitar el costo y la API key de Google, y **el costo resultó no existir**: verificado contra la tabla de precios, el mapa nativo **sin Map ID** cae en el SKU `Maps SDK`, con tope "Unlimited" y precio "—". Lo que sí cobra es pedir un Map ID (SKU `Dynamic Maps`, 10.000/mes y luego $7 por millar), y eso lo exigen el *cloud styling*, los *Advanced Markers* y el *data-driven styling* — **por eso el tema oscuro se resuelve con `userInterfaceStyle` y no con `customMapStyle`**, que obligaría a Map ID y pondría a facturar la app. Descartados MapLibre (obliga a mantener un tile server a cambio de nada visible para dos pines de solo lectura) y `expo-maps` (su propia doc de SDK 57 lo declara **alpha** con "frequent breaking changes"). El mapa **no es interactivo a propósito**: vive dentro de un `ScrollView` y un mapa arrastrable le pelea el gesto al scroll, así que va con `cacheEnabled` —se renderiza una vez y se muestra como imagen— y el toque completo abre la app de mapas. En **Android no renderiza** mientras no exista la API key, porque sin ella Google pinta un rectángulo gris con su logo: se detecta leyendo el config plugin de `app.json`, para no tener una constante que se desincronice. **De paso**, `mapsUrl()` dejó de forzar Google: devolvía siempre `google.com/maps`, así que en un iPhone sin Google Maps instalada terminaba en el navegador; ahora usa `maps.apple.com` en iOS y `geo:` en Android, que respeta la app de mapas elegida por defecto. Typecheck, lint y bundle de iOS en verde; **sin verificar en pantalla todavía** (ver Deudas). |
| 2026-08-20 | **Los permisos, como lista de tareas** (§1.14). Se cerró la deuda que hacía invisibles a todas las demás: los tres permisos se pedían **solo en el onboarding**, así que un toque apurado en «No permitir» dejaba a alguien sin esa capacidad para siempre, sin pista dentro de la app ni forma de arreglarlo. El caso concreto: de las tres cuentas del proyecto **solo una tenía token de push**, y por eso al amigo que probó las conexiones no le llegó nada — ni le habría llegado aunque los avisos de §1.13 hubieran existido antes. Ahora los tres viven en una tarjeta con la misma forma que el checklist de la Home, en verde / ámbar / plomo, y cada fila que falta dice **qué se pierde** en vez de solo pintarse de un color. Conceder notificaciones **registra el token en el acto**, que es el paso sin el cual conceder no sirve de nada. El rojo se dejó fuera a propósito: en esta app significa «necesito ayuda» (§1.4.1) y gastarlo en un permiso le quitaría el significado al que sí lo es. **Encontrado y corregido de paso** (§1.14.1): `app.json` declaraba `RECORD_AUDIO` y `WRITE_CONTACTS` y **nada en `src/` los usaba** — pedir el micrófono en una app de sismos es lo que un revisor de Play marca. Quitar el segundo del array **no alcanzaba**, porque el config plugin de `expo-contacts` lo agrega él mismo siempre; hizo falta `android.blockedPermissions`. Verificado corriendo `prebuild` y leyendo el manifiesto generado, que es la única forma de saberlo: los plugins escriben ahí, no en `app.json`. |
| 2026-08-20 | **Limpieza de la fila de prueba de QA, y un descuido que apareció al hacerla.** Se borró la entrega de alerta insertada a mano en una sesión anterior (un M3,1 en **Alaska** a 9.517 km, con `quake_applies` diciendo `false`) y el aviso de «no responde» que colgaba de ella — en ese orden, porque al revés el cron la habría vuelto a encolar en el barrido siguiente. Comprobado después: las tres entregas que quedan son del M7,2 real, todas con la regla en `true` y jitter de 17 a 28 s, consistente con `random() * 30 s`. **El descuido:** `notification_deliveries` había quedado **sin poda**, cuando sus dos tablas hermanas la tienen desde el día uno — y es la que más crece, con una fila por mensaje de chat y por destinatario (migración 0017). |
| 2026-08-20 | **Un sismo real (M7,2 en Coracora) sirvió de prueba de campo y destapó seis cosas.** La grande: **los cinco avisos entre personas no existían** (§1.13). No era un bug — nunca hubo nada que los mandara, pero Ajustes **ya ofrecía cuatro interruptores** que guardaban prolijamente un booleano que nadie leía. Eso es peor que no tener la función: quien apaga «Mensajes» cree que decidió algo. Se construyó el equivalente de 0010+0014 para eventos entre personas, con las preferencias comprobadas en un solo lugar para que un disparador nuevo no se pueda olvidar del chequeo. Llega en **0,6 s medidos**, porque un disparador despierta al cartero en vez de esperar al cron — y como ese es el camino rápido, el cron bajó de cada minuto a cada 5, así que la función **consume menos** invocaciones que antes. Se honró por fin la promesa escrita del simulacro silencioso, y la prueba de eso encontró un bug propio (0016): `now()` es la hora de la **transacción**, así que dos simulacros del mismo bloque empataban y ganaba cualquiera. 9/9 aserciones dentro de una transacción revertida, para que ninguna notificación de prueba le llegara a nadie. **Verificación no buscada:** el cron de «contacto sin responder» se disparó solo en producción mientras se escribía esto, con la clave de deduplicación correcta. |
| 2026-08-20 | **Latencia del aviso de sismo: la mitad era espera nuestra** (§1.13.4). Medido con el M7,2: de los 9 m 45 s entre el sismo y el push, **7 m 45 s son del IGP** (79 %) y 1 m 59 s eran nuestros. De esos, 59 s era el sismo esperando sentado en la tabla a que pasara el cron de fan-out. Ahora un disparador lo encola en la misma transacción que lo inserta: SQL dentro de la ingesta, cero invocaciones nuevas. El jitter y el cron de envío se quedan a propósito. De paso se confirmó, contra `quake_applies`, que un aviso sospechoso por un M3,1 en **Alaska** no era un fallo de la regla de disparo sino una fila insertada a mano en QA: la regla decía `false` a 9.517 km, y su jitter de 608 s es imposible para `random() * 30 s`. |
| 2026-08-20 | **Tres arreglos de detalle del mismo sismo.** (1) La tarjeta de alerta decía «Sismo en Coracora» y nada más; el IGP mandaba «Parinacochas - Ayacucho» y el parser lo tiraba (§1.6.4.2). Ahora sale debajo, descartando las partes repetidas —«Lurín, Lima - Lima» se muestra como **Lima**, no «Lima, Lima»—; verificado contra los 24 `place` del IGP. (2) La flecha de retroceso del chat decía literalmente **«(tabs)»**: iOS rotula el botón con el título de la pantalla anterior, y los tabs son un grupo de expo-router sin título. Se dejó solo la flecha, porque al chat también se entra desde el detalle de un contacto. (3) El chip de estado se iba a la izquierda en el detalle de un contacto: tenía `alignSelf: 'flex-start'` fijo en el componente, que pisaba el centrado del padre y no se podía corregir desde afuera. |
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
