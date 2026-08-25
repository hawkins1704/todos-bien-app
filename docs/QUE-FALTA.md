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
- `GUIA-DESPLIEGUE.md` — el procedimiento paso a paso de tiendas y credenciales.
- `GUIA-CORREO-RESEND.md` — configuración de correo y plantillas.

Última revisión: **2026-08-25**.

> **Lo que cambió el 2026-08-25 y hay que tener presente al leer lo de abajo:** se construyó
> **Guardián** (0022), se sacaron las invitaciones del servidor (0023), llegaron los **planes
> de acción múltiples** (0024), el `country_code` por fin se detecta de verdad, y la landing
> se reescribió con precios nuevos. **El código está en verde y sin verificar en pantalla:**
> lo único que separa al proyecto de un envío es el recorrido de
> `VERIFICACION-EN-DISPOSITIVO.md` y el trabajo de consola.

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
| **Guardián, planes múltiples, denunciar y bloquear** | ✅ migraciones 0020-0024, con aserciones contra la base real. Falta verlo en el teléfono |
| **Productos y precios en las tiendas** | 🔴 la landing ya anuncia **S/ 89 de por vida · S/ 9,90 mes · S/ 59 año** y en App Store Connect siguen los viejos. Se está publicando un precio que no se vende |
| Ficha cargada en App Store Connect | 🟡 info y capturas cargadas; falta App Privacy, las notas de revisión y el texto nuevo de Premium (`FICHA-APP-STORE.md`) |
| Landing | 🟡 reescrita el 2026-08-25 con comparativa, sección de Premium y precios nuevos. **Falta subirla a Hostinger**, junto con `terminos/index.html` |
| Cuenta de demostración | ✅ creada, sembrada y con el login probado |
| **Ícono y splash** | ✅ reemplazados el 2026-08-24 en app y sitio; falta solo el monocromo de Android (`ICONO-Y-MARCA.md`) |
| Build de producción | ✅ el flujo funciona: se compila **local** (Xcode) y `eas submit` sube el `.ipa` a TestFlight. Por eso no aparece en `eas build:list` |
| Proyecto nativo `ios/` sincronizado | 🔴 **desactualizado**: el `Info.plist` de disco todavía tiene los textos de permiso viejos |
| Verificación en un iPhone real | 🟡 el recorrido está escrito, falta correrlo |
| **Android** | ❌ sin empezar salvo Firebase |
| Mercados fuera de Perú | ❌ decidido que sí, no construido (`ALCANCE-Y-IDIOMAS.md`) |

---

## 1 · Código

Nada de esto bloquea un TestFlight interno.

| # | Qué | Por qué importa |
|---|---|---|
| 1.1 | ✅ **Denunciar y bloquear** (2026-08-24, migraciones 0020 y 0021) | Denunciar: mantener apretado un mensaje ajeno, o desde el detalle del contacto; guarda **copia del mensaje** como evidencia. Bloquear: cierra el chat en las dos direcciones —incluido el que ya existía, que era el agujero real— e impide nuevas solicitudes, con pantalla de **Personas bloqueadas** para deshacerlo. Términos actualizados. **Falta revisarlo en el teléfono** (`VERIFICACION-EN-DISPOSITIVO.md` §8.b) |
| 1.2 | **Texto del aviso en español para sismos globales** | Hoy sale el `place` crudo del USGS: *"170 km NE of Lorengau"* dentro de una app en español. `src/lib/geo.ts` ya resuelve país y continente; el sender debería usarlo. Solo afecta a las alertas premium |
| 1.3 | 🟡 **Leer las migajas cuando ocurra un sismo real** | La prueba grande **pasó** el 2026-08-21: con la app en segundo plano se despertó sola y capturó la ubicación **1,2 s** después del aviso (§3.8.1). El caso de app **terminada** sigue sin medirse, y **no se puede forzar**: reiniciar el teléfono no lo simula, produce un estado más estricto que iOS bloquea (§3.8.2, dos negativos con receipts `ok`). Ya no hace falta armar pruebas — la tarea deja migajas y el próximo sismo real contesta solo (§3.8.3). **Qué mirar:** `select stage, at from background_traces order by at desc`. Sin migajas = iOS no la levantó; `woke` sin nada más = la levantó y murió, y eso sí sería un bug nuestro |
| 1.4 | **Ver la propia ubicación en la app** | Hoy solo la ve tu círculo. Vos no tenés forma de confirmar que la app está haciendo lo que promete, salvo por la ausencia del aviso de "sin ubicación" |
| 1.5 | 🟡 **Declaración de permisos en Play Console** | Ya se quitaron `RECORD_AUDIO` y `WRITE_CONTACTS`, que nada usaba (§1.14.1). Quedan tres que vienen de la plantilla de Expo y de `expo-file-system` —`SYSTEM_ALERT_WINDOW` y los dos de almacenamiento acotados a `maxSdkVersion=32`— que hay que saber justificar al publicar. La recomendación es dejarlos; bloquear el primero rompe el menú de desarrollo |
| 1.6 | Sentry para errores de cliente | Sin esto, un crash en el teléfono de un usuario es invisible |
| 1.8 | **Textos de sismos globales en español** | El aviso mundial de premium usa el `place` crudo del USGS: *"Scotia Sea"*, *"194 km SW of Labuan, Indonesia"* — inglés dentro de una app en español. `src/lib/geo.ts` ya resuelve país y continente, pero vive en TypeScript y el texto se arma en SQL (`notify_quake_news`). Es el mismo pendiente que 1.2, ahora más visible porque las noticias mundiales son el beneficio principal de Premium |
| 1.7 | Pruebas de carga (spec §16.2) | El fan-out recorre `user_settings` entero por sismo. Con padrón grande hay que medirlo |
| 1.9 | ✅ **País detectado de verdad** (2026-08-25) | `user_settings.country_code` nacía con `default 'PE'` y **ninguna pantalla lo escribía nunca**: todos los usuarios del mundo eran `PE` para siempre. Rompía en dos lugares — un peruano en Madrid entraba en **modo emergencia** por un sismo en Lima, y sus contactos locales no encontraban match porque el teléfono se normalizaba con prefijo peruano. Ahora se resuelve del punto ya capturado, una vez por instalación. `DIAL_CODES` pasó de 11 a 18 países. **El inglés NO va en v1** (`MONETIZACION.md` §6: el que paga es peruano) |
| 1.10 | 🔴 **Guardián es Premium y su aviso tiene que verse en el teléfono** | El servidor está probado (12/12), pero nadie vio todavía llegar la notificación. Es lo único que sostiene el precio: `VERIFICACION-EN-DISPOSITIVO.md` §7.b |

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
| 2.-1 | ✅ **Ícono y splash propios** (2026-08-24) | Globo con onda sísmica. El de iOS quedó sin canal alfa, que es lo que rechaza la validación de Apple. Detalle en `ICONO-Y-MARCA.md` |
| 2.0 | ✅ **Textos de permiso del `Info.plist` corregidos** (2026-08-24) | Decían «dónde estabas cuando ocurre un sismo» y omitían la lectura inicial: las dos frases que la auditoría del 21/08 retiró de la app y que en `app.json` habían quedado. **Van dentro del binario**, así que el build de 2.1 tiene que ser posterior |
| 2.1 | **Build de producción y subida** | Se compila **local** con Xcode y `eas submit` sube el `.ipa`. 🔴 **Antes hay que correr `npx expo prebuild -p ios --clean`**: `ios/` es de disco y no se regenera solo, así que hoy tiene el `Info.plist` viejo y el ícono de la plantilla. Ver `ICONO-Y-MARCA.md` §6 |
| 2.1.b | 🟡 **Número de build** | `app.json` no declara `ios.buildNumber`, así que cada `prebuild` deja `CFBundleVersion = 1`. `autoIncrement` de `eas.json` **no aplica a builds locales**, y App Store Connect rechaza un número repetido para la misma versión. Conviene fijarlo en `app.json` y subirlo a mano en cada envío |
| 2.2 | **Probar el push con la app terminada** | Solo se puede con el build de 2.1: el dev client necesita Metro. El recorrido está en `VERIFICACION-EN-DISPOSITIVO.md` §7 |
| 2.3 | ✅ **URLs de la ficha** — soporte, privacidad, términos, eliminar cuenta | Verificadas en producción el 2026-08-24: las cuatro responden 200 |
| 2.4 | **Nutrition Labels** | Respuestas listas, dato por dato, en `PRIVACIDAD-APP-STORE.md`. Falta pegarlas |
| 2.5 | **Justificación de ubicación en segundo plano, en inglés** | Escrita en `PRIVACIDAD-APP-STORE.md` §4. Falta pegarla |
| 2.6 | 🔴 **Términos y Privacidad en el footer del paywall** | RevenueCat → Paywalls. Apple lo exige en apps de suscripción; es rechazo casi automático |
| 2.6.b | 🔴 **Precios nuevos en App Store Connect y RevenueCat** | **S/ 89 de por vida** (el producto principal), **S/ 9,90 al mes**, **S/ 59 al año**. La landing ya los publica: mientras no coincidan, el sitio anuncia un precio que la tienda no cobra. Detalle y porqué en `MONETIZACION.md` §4 |
| 2.6.c | 🔴 **Copia del paywall** | Hoy vende «el mundo». El argumento pasó a ser **Guardián**, que es lo que la landing y la ficha ya cuentan. Texto de referencia en `MONETIZACION.md` §5 |
| 2.6.d | 🟡 **Small Business Program de Apple** | Baja la comisión del 30 % al 15 % con menos de un millón de dólares al año. Es un formulario y duplica el margen |
| 2.7 | ✅ **Cuenta de demostración para App Review** (2026-08-24) | `todosbienapp@gmail.com`, con círculo de 4 contactos en estados mezclados, plan de acción, chat y los 3 simulacros libres. **Login probado contra la API real.** Detalle en `REVISION-APPLE.md` §1 |
| 2.8 | **Capturas de pantalla** | Las seis, con qué tiene que verse en cada una, en `FICHA-APP-STORE.md` §5 |
| 2.9 | **Borrar el usuario de QA** `qa.simulador@example.com` | Quedó de las pruebas iniciales |
| 2.10 | ⏸️ **Leaked password protection** — **no se puede en el plan free** | Es una función de pago de Supabase, así que el advisor lo va a seguir marcando y no hay nada que hacer hasta que el proyecto pase a Pro. **No bloquea la revisión**: Apple no lo pide. Queda para después del MVP |
| 2.11 | ✅ **En *Reset Password* llega un código, no un link** — confirmado por el dueño el 2026-08-24. Texto original del pendiente, por si vuelve a romperse: | El envío ya funciona (`/recover` → 200 el 20/08 08:11), pero eso solo prueba que el correo salió. Si la plantilla quedó con el `{{ .ConfirmationURL }}` de fábrica, la app pide 8 dígitos y a la persona le llega una URL: la recuperación queda rota **sin dar ningún error**. Se comprueba pidiendo un cambio de contraseña y mirando el correo. Ver `GUIA-CORREO-RESEND.md` |
| 2.12 | Revisión legal de términos y limitación de responsabilidad | spec §18 |
| 2.13 | **Disponibilidad territorial: Perú + América + Japón** | Revisado el 2026-08-25: Guardián se le vende a la diáspora, así que restringirlo a Perú deja fuera al que paga. **España e Italia quedan afuera por ahora** — distribuir en la UE exige declarar *trader status* y Apple publica nombre, dirección y teléfono del desarrollador. Detalle en `MONETIZACION.md` §6.2 |
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

## Orden sugerido — actualizado el 2026-08-25

**Ya no falta código para enviar.** Lo que queda son cuatro bloques, y solo el primero es
mío; los otros tres son de consola y de teléfono.

### Bloque 0 · Commitear y compilar

1. **Commitear** lo de las migraciones 0022-0024 y la landing.
2. `npx expo prebuild -p ios --clean` — 🔴 obligatorio: `ios/` es de disco y hoy tiene el
   `Info.plist` viejo y el ícono de la plantilla.
3. Subir `ios.buildNumber` en `app.json` (2.1.b), compilar en Xcode y `eas submit`.

### Bloque 1 · Subir el sitio

4. **Hostinger**: la landing nueva (`index.html` + `css/styles.css`) y
   **`terminos/index.html`**, que cambió con el bloqueo y todavía no subió.

### Bloque 2 · Consola — es pegar, no redactar

5. **RevenueCat**: productos con los **precios nuevos** (2.6.b), copia del paywall centrada
   en Guardián (2.6.c), y **Términos y Privacidad en el pie** (2.6) — este último es rechazo
   casi automático si falta.
6. **App Store Connect**: Nutrition Labels (2.4), justificación de ubicación en segundo
   plano (2.5), notas del revisor (`REVISION-APPLE.md` §2), el texto nuevo de Premium en la
   ficha, disponibilidad territorial (2.13) y **Small Business Program** (2.6.d).
7. **Borrar** `qa.simulador@example.com` (2.9).

### Bloque 3 · El teléfono, que es la única puerta que queda

8. **`VERIFICACION-EN-DISPOSITIVO.md` entero**, sobre el build del paso 3. El orden está en
   el propio documento: §0 para montar el banco, §9.b primero (lo que tiene que ser
   idéntico entre gratis y Premium), y después §7.b, §9.c y §8.b.

### Y recién ahí

9. **Enviar a revisión.**
10. Después, dos frentes que no conviene mezclar: **Android** (3.1 a 3.3) y el **inglés**, si
    alguna vez se decide vender fuera de la comunidad peruana.

> **Lo único que puede costar un ciclo de revisión hoy** es el pie del paywall sin Términos
> ni Privacidad (2.6). Todo lo demás ya está resuelto o escrito.

Los ítems de código que quedan (1.2, 1.4, 1.6, 1.7, 1.8) no bloquean nada. El que conviene
mirar antes de tener usuarios de verdad es el **1.3**: sin receipts, un problema de entrega
se ve exactamente igual que todo funcionando bien.
