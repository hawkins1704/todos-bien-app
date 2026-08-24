# Qué falta

Índice **único** de trabajo pendiente. Si algo está por hacerse, está acá; el resto de los
documentos explican *cómo* y *por qué*, no *qué queda*.

- `ESTADO-DEL-PROYECTO.md` — qué existe y por qué se decidió así. Más las **deudas
  conocidas**, que son problemas de lo ya construido, no trabajo nuevo.
- `QUE-PROMETE-LA-APP.md` — **fuente única de las afirmaciones públicas**: qué se puede
  prometer, qué no, y con qué palabras. La landing, la ficha de tienda y los textos de la app
  salen de ahí.
- `ALCANCE-Y-IDIOMAS.md` — en qué países se publica, en qué idiomas, y qué falta para cada uno.
- `FICHA-APP-STORE.md` — el texto de la ficha, contado y listo para pegar.
- `PRIVACIDAD-APP-STORE.md` — la hoja de respuestas de los Nutrition Labels, dato por dato.
- `REVISION-APPLE.md` — cuenta de demostración, notas para el revisor y los rechazos probables.
- `VERIFICACION-EN-DISPOSITIVO.md` — el recorrido en un iPhone real que cierra las deudas de
  «sin verificar en pantalla».
- `RUNBOOK-OPERACION.md` — qué mirar cuando ya hay usuarios, con las consultas hechas.
- `GUIA-DESPLIEGUE.md` — el procedimiento paso a paso de tiendas y credenciales.
- `GUIA-CORREO-RESEND.md` — configuración de correo y plantillas.

Última revisión: **2026-08-24**.

---

## Dónde está parado el proyecto

| Bloque | Estado |
|---|---|
| Backend, RLS, ingesta de sismos, fan-out | ✅ |
| Cliente completo (acceso, onboarding, círculo, chat, simulacro, noticias) | ✅ |
| **Push de punta a punta en iOS** | ✅ verificado con datos reales |
| **Premium / RevenueCat en iOS** | ✅ compra, restauración y transferencia probadas |
| Sitio, dominio y páginas legales | ✅ desplegado en Hostinger, las cuatro URL responden 200 |
| Textos de la ficha, privacidad y notas de revisión | ✅ escritos (`FICHA-APP-STORE.md`, `PRIVACIDAD-APP-STORE.md`, `REVISION-APPLE.md`) |
| Ficha cargada en App Store Connect | 🟡 falta pegarla, más capturas y cuenta demo |
| Verificación en un iPhone real | 🟡 el recorrido está escrito, falta correrlo |
| **Android** | ❌ sin empezar salvo Firebase |
| Mercados fuera de Perú | ❌ decidido que sí, no construido (`ALCANCE-Y-IDIOMAS.md`) |

---

## 1 · Código

Nada de esto bloquea un TestFlight interno.

| # | Qué | Por qué importa |
|---|---|---|
| 1.1 | 🔴 **Denunciar contenido en el chat** | Apple exige moderación en apps con contenido entre usuarios (guía 1.2): filtro, **denunciar**, bloquear y actuar en 24 h. Bloquear ya existe —eliminar la conexión— pero denunciar no. Es el rechazo más probable de esta app; ver `REVISION-APPLE.md` §4 |
| 1.2 | **Texto del aviso en español para sismos globales** | Hoy sale el `place` crudo del USGS: *"170 km NE of Lorengau"* dentro de una app en español. `src/lib/geo.ts` ya resuelve país y continente; el sender debería usarlo. Solo afecta a las alertas premium |
| 1.3 | 🟡 **Leer las migajas cuando ocurra un sismo real** | La prueba grande **pasó** el 2026-08-21: con la app en segundo plano se despertó sola y capturó la ubicación **1,2 s** después del aviso (§3.8.1). El caso de app **terminada** sigue sin medirse, y **no se puede forzar**: reiniciar el teléfono no lo simula, produce un estado más estricto que iOS bloquea (§3.8.2, dos negativos con receipts `ok`). Ya no hace falta armar pruebas — la tarea deja migajas y el próximo sismo real contesta solo (§3.8.3). **Qué mirar:** `select stage, at from background_traces order by at desc`. Sin migajas = iOS no la levantó; `woke` sin nada más = la levantó y murió, y eso sí sería un bug nuestro |
| 1.4 | **Ver la propia ubicación en la app** | Hoy solo la ve tu círculo. Vos no tenés forma de confirmar que la app está haciendo lo que promete, salvo por la ausencia del aviso de "sin ubicación" |
| 1.5 | 🟡 **Declaración de permisos en Play Console** | Ya se quitaron `RECORD_AUDIO` y `WRITE_CONTACTS`, que nada usaba (§1.14.1). Quedan tres que vienen de la plantilla de Expo y de `expo-file-system` —`SYSTEM_ALERT_WINDOW` y los dos de almacenamiento acotados a `maxSdkVersion=32`— que hay que saber justificar al publicar. La recomendación es dejarlos; bloquear el primero rompe el menú de desarrollo |
| 1.6 | Sentry para errores de cliente | Sin esto, un crash en el teléfono de un usuario es invisible |
| 1.8 | **Textos de sismos globales en español** | El aviso mundial de premium usa el `place` crudo del USGS: *"Scotia Sea"*, *"194 km SW of Labuan, Indonesia"* — inglés dentro de una app en español. `src/lib/geo.ts` ya resuelve país y continente, pero vive en TypeScript y el texto se arma en SQL (`notify_quake_news`). Es el mismo pendiente que 1.2, ahora más visible porque las noticias mundiales son el beneficio principal de Premium |
| 1.7 | Pruebas de carga (spec §16.2) | El fan-out recorre `user_settings` entero por sismo. Con padrón grande hay que medirlo |
| 1.9 | **Español e inglés, y país en el onboarding** | Decidido publicar en LatAm, EE. UU. y Asia. Hoy la app es solo español y normaliza **todo teléfono como peruano** (`'PE'` fijo en el onboarding), lo que rompe en silencio la única vía de conexión que queda. Detalle y orden en `ALCANCE-Y-IDIOMAS.md` |

**Deudas abiertas** (problemas de lo ya construido, detalle en el estado del proyecto):
la Home que mostró "todo en calma" con alerta activa —sin reproducir—, el `TabBarExtraInset`
de Android sin medir, y la fortaleza del hash de teléfono.

**Cerrado el 2026-08-24:** los **códigos de invitación**, que salieron del MVP enteros —
pantalla, RPC del cliente, página `/i/` del sitio y reglas de reescritura—. Lo que se
descubrió al sacarlos y conviene no olvidar: el «auto-vínculo por teléfono» que se citaba
como red de seguridad **nunca funcionó**, porque los dos llamadores de `create_invitation`
pasaban `null` como `invitee_phone_hash` y el trigger que lo resuelve no tenía nunca qué
resolver. La única vía de conexión es —y era— el match de agenda.

**Cerrado el 2026-08-20:** los cinco avisos entre personas —solicitud recibida, solicitud
aceptada, «necesita ayuda», mensaje de chat y «contacto sin responder»— que Ajustes ya
ofrecía en cuatro interruptores sin que nada los mandara (§1.13 del estado). Con ellos se
cerró también el modo «avisar a mi círculo» del simulacro, y el ruteo al tocar un aviso,
que antes abría siempre la Home.

**También cerrado ese día:** volver a ofrecer los permisos desde dentro de la app (§1.14).
Los tres —ubicación, notificaciones, contactos— viven ahora en una lista de tareas en
Ajustes, y conceder notificaciones **registra el token de push en el acto**. Era la deuda
que hacía invisibles a todas las demás: de las tres cuentas del proyecto, solo una tenía
token registrado.

---

## 2 · iOS — para mandar a revisión

Todo lo técnico está listo. Lo que falta es de consola, **salvo 2.0**, que es de código y
caduca: si el build sale antes, sale con los textos viejos.

| # | Qué | Dónde |
|---|---|---|
| 2.0 | ✅ **Textos de permiso del `Info.plist` corregidos** (2026-08-24) | Decían «dónde estabas cuando ocurre un sismo» y omitían la lectura inicial: las dos frases que la auditoría del 21/08 retiró de la app y que en `app.json` habían quedado. **Van dentro del binario**, así que el build de 2.1 tiene que ser posterior |
| 2.1 | **Build de producción y subida** | `eas build --profile production -p ios` + `eas submit`. Antes, **commitear**: `index.js` y las migraciones 0018/0019 estaban sin versionar y EAS empaqueta desde git |
| 2.2 | **Probar el push con la app terminada** | Solo se puede con el build de 2.1: el dev client necesita Metro. El recorrido está en `VERIFICACION-EN-DISPOSITIVO.md` §7 |
| 2.3 | ✅ **URLs de la ficha** — soporte, privacidad, términos, eliminar cuenta | Verificadas en producción el 2026-08-24: las cuatro responden 200 |
| 2.4 | **Nutrition Labels** | Respuestas listas, dato por dato, en `PRIVACIDAD-APP-STORE.md`. Falta pegarlas |
| 2.5 | **Justificación de ubicación en segundo plano, en inglés** | Escrita en `PRIVACIDAD-APP-STORE.md` §4. Falta pegarla |
| 2.6 | 🔴 **Términos y Privacidad en el footer del paywall** | RevenueCat → Paywalls. Apple lo exige en apps de suscripción; es rechazo casi automático |
| 2.7 | **Cuenta de demostración para App Review** | Qué crear y cómo sembrarla, en `REVISION-APPLE.md` §1. Una cuenta vacía es tan rechazable como una que no abre |
| 2.8 | **Capturas de pantalla** | Las seis, con qué tiene que verse en cada una, en `FICHA-APP-STORE.md` §5 |
| 2.9 | **Borrar el usuario de QA** `qa.simulador@example.com` | Quedó de las pruebas iniciales |
| 2.10 | **Prender *Leaked password protection*** | Supabase → Authentication → Providers → Email. Lo marca el advisor desde que la app usa contraseñas |
| 2.11 | **Verificar que en *Reset Password* llegue un código y no un link** | El envío ya funciona (`/recover` → 200 el 20/08 08:11), pero eso solo prueba que el correo salió. Si la plantilla quedó con el `{{ .ConfirmationURL }}` de fábrica, la app pide 8 dígitos y a la persona le llega una URL: la recuperación queda rota **sin dar ningún error**. Se comprueba pidiendo un cambio de contraseña y mirando el correo. Ver `GUIA-CORREO-RESEND.md` |
| 2.12 | Revisión legal de términos y limitación de responsabilidad | spec §18 |
| 2.13 | **Disponibilidad territorial: solo Perú en el primer envío** | Ampliarla después es un cambio de ficha, no un envío nuevo. El porqué y qué hace falta para los demás mercados, en `ALCANCE-Y-IDIOMAS.md` |
| 2.14 | **Correr el recorrido de verificación** | `VERIFICACION-EN-DISPOSITIVO.md`, entero, sobre el build de 2.1 |

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
| 3.1.3 | **Medir `TabBarExtraInset`**. Los 80dp actuales salen de la documentación de Material 3, sin verificar en un dispositivo. Si Android reporta la barra dentro de `insets.bottom` como iOS, el valor correcto es 0 |

### 3.1.b Mapas

| # | Qué |
|---|---|
| 3.1.4 | **API key de Google Maps para Android.** Proyecto en Google Cloud → habilitar *Maps SDK for Android* → SHA-1 del certificado de firma → key restringida a `com.renzoarroyo.todosbien` + ese SHA-1. Declararla en el config plugin de `app.json`: `["react-native-maps", { "androidGoogleMapsApiKey": "AIza..." }]` |
| 3.1.5 | Verificar que el mapa se dibuja en el detalle del sismo y en el del contacto. **Hasta que exista la key, `LocationMap` no renderiza en Android a propósito** — sin key Google pinta un rectángulo gris con su logo, que es peor que no mostrar nada. No se rompe nada, simplemente no se ve el mapa (ver ESTADO §1.2.1) |

> ⚠️ El uso **no factura** —el SKU `Maps SDK` del mapa nativo sin Map ID tiene tope
> "Unlimited" y precio "—"—, pero Google **exige igual una cuenta de facturación con
> tarjeta** para emitir la key. iOS no necesita nada de esto: usa Apple Maps.

### 3.2 Tienda

| # | Qué |
|---|---|
| 3.2.1 | Cuenta de **Google Play Developer** (pago único de USD 25) |
| 3.2.2 | Crear la app en Play Console con el paquete `com.renzoarroyo.todosbien` (**sin guiones**: Android no los admite, y que difiera del bundle de iOS es correcto) |
| 3.2.3 | Ficha: descripción, capturas, icono, clasificación de contenido, cuestionario de seguridad de datos |
| 3.2.4 | Firma de la app: dejar que **Play App Signing** la maneje, que es el default y lo que EAS espera |
| 3.2.5 | Primera subida a un *internal testing track* — Play Console exige un build antes de habilitar varias secciones |

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

## Orden sugerido

1. **Commitear**, y recién ahí el **build de producción de iOS** → destraba 2.2 y TestFlight.
2. **Lo de consola de iOS** (2.4 a 2.13) mientras el build corre. El texto ya está escrito:
   es pegar, no redactar.
3. **Correr `VERIFICACION-EN-DISPOSITIVO.md`** sobre ese build.
4. **Decidir 1.1** (denunciar en el chat) — es lo único de código que puede costar el ciclo
   de revisión.
5. **Enviar a revisión**, con disponibilidad solo en Perú.
6. Después, en dos frentes que no conviene mezclar: **Android** (3.1 a 3.3) y **los demás
   mercados** (`ALCANCE-Y-IDIOMAS.md`).

Los demás ítems de código no bloquean nada de esto y se pueden intercalar. El único que
conviene mirar antes de tener usuarios de verdad es el **1.3**: sin receipts, un problema de
entrega se ve exactamente igual que todo funcionando bien.
