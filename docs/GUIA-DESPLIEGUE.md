# Guía de despliegue: Apple, Android, EAS y RevenueCat

Orden de operaciones para conectar el proyecto con las tiendas. Está pensada para
seguirse **de arriba hacia abajo**: cada fase produce algo que la siguiente necesita.

- **Proyecto EAS:** `89758dc9-6d22-47fd-8dc7-2691d816f159` (slug `todos-bien`)
- **Bundle ID iOS:** `com.renzoarroyo.todos-bien`
- **Package Android:** `com.renzoarroyo.todosbien` (sin guiones: Android no los admite en
  el nombre de paquete. Que sean distintos es correcto y no hay que "arreglarlo")
- **Apple Team:** `3S8A8U48YR`

---

## Por qué este orden

No es arbitrario. Las dependencias reales son:

```
eas init  ──►  Fase 1: build iOS ──┬──► crea el App ID en el portal de Apple
 (ya hecho)     en tu iPhone       ├──► crea el certificado y el perfil
                                   └──► crea la APNs Key  ──► push iOS funciona
                                            │
                                            ▼
                   Fase 2: ficha en App Store Connect
                   (necesita que el App ID YA exista)
                                            │
                        ┌───────────────────┴───────────────────┐
                        ▼                                       ▼
        Fase 4: TestFlight / envío                 Fase 5: RevenueCat
        (necesita la ficha + ascAppId)             (necesita ficha + contrato
                                                    de apps de pago + productos)

  Fase 3: Android/Firebase  ──► push Android. INDEPENDIENTE de todo lo de Apple:
                                se puede hacer en paralelo o después.
```

**El error clásico** es empezar creando la app en App Store Connect a mano. Se puede, pero
entonces hay que registrar el Bundle ID por separado en el portal de Developer y es fácil
escribirlo distinto al de `app.json`. Dejando que el **primer build de EAS** lo cree, el
identificador sale del `app.json` y no puede quedar desalineado.

> **Lo que EAS hace solo** (verificado en la documentación de Expo): al correr
> `eas build -p ios` e iniciar sesión con tu cuenta de Apple, EAS genera el **certificado
> de distribución**, el **perfil de aprovisionamiento** y la **APNs Key** para push.
> **Lo que NO hace:** crear la ficha de la app en App Store Connect. Eso es manual
> (Fase 2).

---

## Fase 0 · Estado actual

Ya está hecho, no hay que repetirlo:

- [x] `eas init` — el `projectId` está en `app.json` (`extra.eas.projectId`)
- [x] `eas.json` con los perfiles `development`, `preview` y `production`
- [x] `eas-cli` 20.4.0

> ⚠️ **El token se registra en cada refresco, no solo en el onboarding.** `syncPushToken()`
> (`src/lib/notifications.ts`) corre al abrir la app y al volver del segundo plano, y solo
> escribe cuando el token cambió. Antes vivía únicamente en el último paso del onboarding,
> que no se repite nunca: quien lo había completado antes de que existiera el `projectId`
> quedaba sin token para siempre. En el simulador sigue sin pasar nada: `Device.isDevice`
> es `false`.

Verificá que estás en la cuenta correcta antes de empezar:

```bash
npx eas-cli whoami
```

---

## Fase 1 · Apple: primer build en tu iPhone

Esta es la fase que **destraba el push de iOS**. Al terminarla tenés la APNs Key creada y
una app instalada en tu teléfono capaz de recibir notificaciones.

### 1.1 Registrar tu iPhone

Un build de desarrollo con `distribution: internal` se firma con un perfil *ad hoc*, que
solo instala en dispositivos registrados por UDID.

```bash
npx eas-cli device:create
```

Elegí **Website** — te da un link/QR; abrilo **en el iPhone**, instalá el perfil que
descarga (Ajustes → Perfil descargado → Instalar) y el dispositivo queda registrado.

Confirmá que aparece:

```bash
npx eas-cli device:list
```

### 1.2 Correr el primer build

```bash
npx eas-cli build --profile development --platform ios
```

Durante el proceso te va a preguntar:

| Pregunta | Qué responder | Qué hace |
|---|---|---|
| *Log in to your Apple Developer account?* | **Sí**, con tu Apple ID | Le da permiso a EAS para crear credenciales |
| *Two-factor code* | El código de tu dispositivo Apple | — |
| Elegir el equipo | `3S8A8U48YR` | Debe coincidir con `appleTeamId` de `app.json` |
| *Generate a new Apple Distribution Certificate?* | **Sí** | Firma la app |
| *Generate a new Apple Provisioning Profile?* | **Sí** | Incluye los dispositivos registrados en 1.1 |
| **_Would you like to set up Push Notifications?_** | **SÍ** ← *no lo saltees* | **Crea la APNs Key.** Es el objetivo de toda esta fase |

> Si por error respondés que no a la de push, no hay que rehacer el build:
> `npx eas-cli credentials -p ios` → `production` → *Push Notifications: Manage your Apple
> Push Notifications Key*.

El build tarda ~10-20 min. Al terminar te da un QR: escaneálo con el iPhone e instalá.

### 1.3 Verificar que el push quedó armado

```bash
npx eas-cli credentials -p ios
```

Tiene que listar *Distribution Certificate*, *Provisioning Profile* y **Push Key**.

Después, con la app instalada en el teléfono:

1. Abrí la app y completá el onboarding **aceptando notificaciones**.
2. Confirmá que el token llegó a la base:

```sql
select platform, device_name, created_at from public.push_tokens;
```

Si aparece una fila, el circuito de credenciales está cerrado. **Ese es el criterio de
éxito de la Fase 1.**

> **Ojo con el simulador.** Todo esto solo funciona en un iPhone físico: el simulador de
> iOS no entrega tokens de APNs. Hasta ahora la app se venía verificando en el simulador;
> de acá en adelante, para push, hace falta el dispositivo.

---

## Fase 2 · App Store Connect: crear la ficha de la app

Ahora que el Bundle ID existe en el portal (lo creó la Fase 1), se puede crear la ficha.
Hace falta para TestFlight, para `eas submit` y para los productos de RevenueCat.

1. Entrá a [App Store Connect](https://appstoreconnect.apple.com) → **Apps** → **+** →
   **Nueva app**.
2. Completá:

| Campo | Valor |
|---|---|
| Plataformas | iOS |
| Nombre | `Todos Bien` (es único en toda la App Store; si está tomado hay que variarlo) |
| Idioma principal | Español (México) — es el neutro latino que usa la app (§1.10) |
| Bundle ID | `com.renzoarroyo.todos-bien` (aparece en la lista porque lo creó la Fase 1) |
| SKU | `todos-bien-001` — identificador interno tuyo, no lo ve nadie |
| Acceso de usuario | Acceso completo |

3. Una vez creada, andá a **General → Información de la app** y copiá el número que dice
   **Apple ID** (son ~10 dígitos, no es tu correo). Ese es el `ascAppId`.

4. Pegalo en `eas.json`:

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "0000000000"
    }
  }
}
```

### 2.1 Contrato de apps de pago — hacelo ya

En **Empresa** (*Business*), firmá el **Contrato de aplicaciones de pago** y completá
datos **bancarios** e **impositivos**.

Va acá y no en la fase de RevenueCat por una razón práctica: **hasta que el contrato esté
activo no se pueden crear productos de compra dentro de la app**, y la aprobación puede
tardar días. Si lo dejás para el final, te bloquea justo cuando querés cerrar.

### 2.2 Declaraciones que va a pedir la revisión

Anotalas ahora, se usan al enviar:

- **Cifrado:** ya está resuelto por código. `app.json` tiene
  `ITSAppUsesNonExemptEncryption: false`, así que no pregunta en cada build.
- **Ubicación en segundo plano:** Apple pide justificación. El texto ya está escrito en
  `docs/ESTADO-DEL-PROYECTO.md` §1.2 — hay que traducirlo al inglés.
- **Privacidad (Nutrition Labels):** la app recolecta ubicación, contactos (solo como
  hash, en el dispositivo) y datos de contacto. Declaralo tal cual: el hasheo se hace en
  el teléfono y la agenda nunca sube en texto plano.

---

## Fase 3 · Android: Firebase y FCM

Independiente de Apple. Se puede hacer en cualquier momento.

> **Esta fase es solo el push.** La tienda (Play Console, ficha, productos, facturación) es
> un trabajo aparte y con otra cuenta de Google: está listado en `docs/QUE-FALTA.md` §3.
> Confundir el proyecto de Firebase con el de Play Console es el error clásico de Android.

### 3.1 Crear el proyecto de Firebase

1. [Firebase Console](https://console.firebase.google.com) → **Agregar proyecto** →
   nombre `Todos Bien`. Google Analytics es opcional (no lo necesitamos).
2. Dentro del proyecto: **Agregar app** → **Android**.
3. **Nombre del paquete:** `com.renzoarroyo.todosbien` — tiene que ser **exacto**, es el
   de `app.json` (sin guiones).
4. Descargá **`google-services.json`** y ponelo en la **raíz del repo**.

Ese archivo **sí se commitea**: solo trae identificadores públicos.

5. Declaralo en `app.json`, dentro de `expo.android`:

```json
"googleServicesFile": "./google-services.json"
```

### 3.2 Subir la service account a EAS

Esto es lo que le permite a nuestro servidor mandar push a los Android.

1. Firebase Console → ⚙️ **Configuración del proyecto** → pestaña **Cuentas de servicio**.
2. **Generar nueva clave privada** → **Generar clave**. Descarga un `.json`.

> 🔒 Ese archivo **es un secreto**: quien lo tenga puede mandar notificaciones a todos tus
> usuarios. **No lo commitees.** El `.gitignore` ya cubre los nombres que usa Firebase
> (`*-firebase-adminsdk-*.json`), pero verificá con `git status` antes de commitear.

3. Subilo:

```bash
npx eas-cli credentials -p android
```

Elegí: `production` → **Google Service Account** → *Manage your Google Service Account Key
for Push Notifications (FCM V1)* → *Set up a Google Service Account Key* → **Upload a new
service account key**.

### 3.3 Build y verificación

```bash
npx eas-cli build --profile development --platform android
```

Instalalo en un Android físico **o en un emulador con Google Play services** (a diferencia
de iOS, el emulador de Android sí recibe push). Repetí la verificación de la Fase 1.3: el
token tiene que aparecer en `push_tokens` con `platform = 'android'`.

> ⚠️ **Pendiente al probar en Android:** medir los insets de la tab bar. La constante
> `TabBarExtraInset` usa 80dp tomados de la documentación de Material 3, sin verificar en
> un dispositivo (ver §1.4 y las deudas conocidas del estado del proyecto).

---

## Fase 4 · TestFlight

Cuando quieras probar con gente real antes de publicar:

```bash
npx eas-cli build --profile production --platform ios
npx eas-cli submit --profile production --platform ios
```

`eas submit` **necesita que la ficha ya exista** (Fase 2) y que `ascAppId` esté en
`eas.json`. No crea la app por su cuenta.

Después, en App Store Connect → **TestFlight**, agregá testers internos.

---

## Fase 5 · RevenueCat

Va **al final** porque depende de todo lo anterior: la ficha de la app, el contrato de
apps de pago activo y los productos creados.

### 5.1 Crear los productos en App Store Connect

App Store Connect → tu app → **Suscripciones**. Creá un **grupo de suscripción**
(`Todos Bien Premium`) y dentro los productos. Los precios y planes están en la spec §13.

Convención de IDs sugerida:

```
com.renzoarroyo.todosbien.individual.mensual
com.renzoarroyo.todosbien.familiar4.mensual
com.renzoarroyo.todosbien.familiar6.mensual
```

> Los planes **de por vida** de la spec §13 no son suscripción: van como *compra dentro de
> la app no consumible*, en la sección **Compras dentro de la app**, no en Suscripciones.

### 5.2 La In-App Purchase Key

RevenueCat con StoreKit 2 (lo recomendado hoy) necesita la **In-App Purchase Key**, no el
viejo *shared secret*.

App Store Connect → **Usuarios y acceso** → **Integraciones** → **Compra dentro de la
app** → **+**. Guardá el `.p8` que descarga (se descarga **una sola vez**) y anotá el
**Key ID** y el **Issuer ID**.

El `.gitignore` ya cubre `*.p8`.

### 5.3 Configurar RevenueCat

1. Creá el proyecto en [RevenueCat](https://app.revenuecat.com) y agregá la app de iOS con
   el bundle ID y la In-App Purchase Key de 5.2.
2. Creá los **Entitlements** (uno: `premium`), los **Products** y una **Offering**.
3. Armá el **Paywall** en el dashboard de RevenueCat. Acá es donde viven los beneficios y
   los precios: la app **no** los guarda (§1.9.1).

### 5.4 El código — ya está hecho

```bash
npx expo install react-native-purchases react-native-purchases-ui
```

Requiere un **development build** (no funciona en Expo Go), que ya vas a tener de la
Fase 1. **Ojo:** estos paquetes traen código nativo, así que un build anterior a su
instalación no sirve — hay que volver a buildear.

| Archivo | Qué hace |
|---|---|
| `src/lib/purchases.ts` | Arranca el SDK, ata la sesión de RevenueCat a la de Supabase y espera a que el webhook aplique la compra |
| `src/app/_layout.tsx` | `configurePurchases()` antes del primer render + `<PurchasesIdentity />` |
| `src/components/premium-cta.tsx` | Abre el paywall de RevenueCat y maneja el resultado |
| `src/components/subscription-manager.tsx` | Customer Center si ya es Premium; paywall + restaurar compras si no |
| `supabase/functions/revenuecat-webhook/` | Único lugar que escribe `is_premium` |
| `supabase/migrations/0012_revenuecat_webhook.sql` | Secreto del webhook + bitácora de eventos |

**Quién decide quién es Premium.** La app no. `is_premium` está fuera del grant de
UPDATE de `authenticated` desde la migración 0001; lo escribe el webhook con service
role. El `customerInfo` del SDK se usa solo para elegir qué pantalla mostrar. Si fuera
al revés, las alertas mundiales —que se resuelven en Postgres— no llegarían igual.

**Cómo se ata la compra al usuario.** `Purchases.logIn(userId)` con el UUID de Supabase.
Ese valor es el `app_user_id` que llega en el webhook y lo que permite saber a qué fila
de `user_settings` corresponde la compra.

### 5.4.1 Las claves en `.env`

```
EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_...
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_...
EXPO_PUBLIC_REVENUECAT_ENTITLEMENT=premium
```

Son claves **públicas de cliente**: RevenueCat las diseñó para viajar dentro del
binario, igual que la publishable de Supabase. Por eso van en `.env`, que se commitea.

> ⚠️ Una clave `test_...` es la del **Test Store** de RevenueCat: sirve para ver el
> paywall sin tocar App Store Connect, pero no cobra ni genera transacciones. Antes de
> TestFlight hay que cambiarla por la de la app de App Store (`appl_...`), en
> RevenueCat → Project Settings → API keys.

`EXPO_PUBLIC_REVENUECAT_ENTITLEMENT` es el **identifier** del entitlement, no su nombre
para mostrar. Si la variable queda vacía, la app asume `premium`.

Si la clave de la plataforma queda vacía, la app arranca igual y el botón de Premium se
muestra deshabilitado. Es deliberado: el núcleo de seguridad es gratis, así que una
integración de cobro a medio configurar no puede impedir que alguien use la app.

### 5.4.2 El webhook

Sin esto la compra se cobra pero nadie otorga el beneficio.

1. Leé el secreto que generó la migración 0012:

```sql
select public.get_revenuecat_secret();
```

2. RevenueCat → **Integrations** → **Webhooks** → **+ New**:

| Campo | Valor |
|---|---|
| Webhook URL | `https://gfutgfmiwzgjtcrinqwo.supabase.co/functions/v1/revenuecat-webhook` |
| Authorization header | el valor del paso 1, **sin** `Bearer` |
| Environment | *All* (sandbox también: es lo que se prueba en TestFlight) |

3. Mandá el evento de prueba desde el dashboard y verificá que llegó:

```sql
select event_id, type, environment, outcome, affected_user_ids, received_at
from public.revenuecat_events order by received_at desc limit 5;
```

La función se despliega con `--no-verify-jwt` (RevenueCat no puede firmar un JWT de
Supabase; la autenticación es el header contra el secreto de Vault) y es **idempotente**:
`event_id` es la primary key de la bitácora, así que los reintentos de RevenueCat no
reprocesan la misma compra.

Qué hace con cada evento:

| Evento | Efecto |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE`… | Otorga |
| `EXPIRATION`, `SUBSCRIPTION_PAUSED` | Quita |
| `CANCELLATION` con vencimiento a futuro | **No hace nada** — cancelar es "no se renueva", no "se terminó ahora" |
| `CANCELLATION` con vencimiento ya pasado | Quita: así llega un reembolso |
| `BILLING_ISSUE` | No hace nada: la tienda reintenta durante el período de gracia |
| `TRANSFER` | Se lo saca a un usuario y se lo da al otro |

Junto con `is_premium` escribe `alert_worldwide_enabled`: las alertas mundiales son el
beneficio premium que se resuelve del lado del servidor (spec §12) y `is_premium` por sí
solo no las activa.

### 5.4.3 Probar la compra

Con el development build instalado en el iPhone:

1. En App Store Connect → **Usuarios y acceso** → **Sandbox** creá un tester.
2. En el iPhone: Ajustes → App Store → **Cuenta de sandbox** → iniciá sesión con él.
3. Abrí la app → Mi cuenta → **Obtener Premium** → comprá.
4. La pantalla debería pasar a "Todos Bien Premium" sola en unos segundos: ese es el
   webhook aplicando la compra.

Si no cambia, mirá `revenuecat_events`. Si el evento llegó con `outcome = 'unmapped'`,
el `app_user_id` no era el UUID de Supabase: revisá que `Purchases.logIn()` se esté
llamando (`syncPurchasesUser` en `src/lib/purchases.ts`).

### 5.5 Android (cuando toque)

Necesita: cuenta de Google Play Developer (pago único de USD 25), ficha de la app en Play
Console, productos creados y una service account con permisos de facturación conectada a
RevenueCat. **Es un proyecto aparte del de Firebase** aunque los dos sean de Google.

---

## Sign in with Apple

**Hoy no hace falta.** Apple lo exige solo si la app ofrece login con otros proveedores
externos (Google, Facebook). Todos Bien usa correo y contraseña propios (§1.1), así que no
aplica.

Cuando se agregue Google Sign In, **en el mismo momento** hay que agregar Sign in with
Apple o la revisión rechaza la app.

---

## Checklist antes de publicar

👉 **Se mudó a `docs/QUE-FALTA.md`**, que es el índice único de trabajo pendiente.

Estaba duplicado con la sección "Pendiente" del estado del proyecto, y dos listas de lo
mismo en archivos distintos se separan siempre. Esta guía queda para el **cómo**: el
procedimiento de cada consola y por qué en ese orden.

Una cosa que ya está resuelta y conviene no volver a buscar: **borrar la cuenta desde la
app** (guía 5.1.1(v) de Apple) existe en Mi cuenta → SEGURIDAD → Borrar mi cuenta. Al
llenar el formulario de revisión, Apple pregunta **dónde está**: la ruta es
*Ajustes → tocar el perfil → SEGURIDAD → Borrar mi cuenta*.

---

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `Provisioning profile doesn't include device` | El iPhone no estaba registrado al momento del build | `eas device:create` y **volver a buildear** |
| El build sale bien pero no llega ningún push | Se respondió "no" a la pregunta de push del build | `eas credentials -p ios` → crear la Push Key |
| `push_tokens` vacío | Se probó en el simulador | `Device.isDevice` es `false` ahí: usar un teléfono real |
| `Invalid bundle identifier` al crear la ficha | Se creó la app antes del primer build | Registrar el App ID en el portal o rehacer con el ID exacto de `app.json` |
| RevenueCat no deja crear productos | Falta el contrato de apps de pago | App Store Connect → Empresa (§2.1) |
| El botón de Premium se ve deshabilitado | `EXPO_PUBLIC_REVENUECAT_IOS_KEY` vacía, o el build es anterior a instalar los paquetes | Completar `.env` y **volver a buildear**: `react-native-purchases` trae código nativo |
| El paywall sale vacío o "no offerings" | La Offering no está marcada como *current* en RevenueCat, o los productos no están aprobados en App Store Connect | RevenueCat → Offerings → *Make current* |
| Se compró pero sigue diciendo "Plan gratuito" | El webhook no llegó o no mapeó al usuario | `select * from public.revenuecat_events order by received_at desc limit 5` |
| El evento llegó con `outcome = 'unmapped'` | El `app_user_id` no es el UUID de Supabase | Verificar que `Purchases.logIn()` corra (`syncPurchasesUser` en `src/lib/purchases.ts`) |
| RevenueCat reporta 401 en el webhook | El header `Authorization` no coincide con el secreto de Vault | `select public.get_revenuecat_secret();` y volver a pegarlo, sin `Bearer` |
| La base dice `sent` pero el push no llega | Expo responde `ok` cuando **acepta** el mensaje, no cuando Apple lo entrega | Pedir el *receipt*: `POST https://exp.host/--/api/v2/push/getReceipts` con el `id` del ticket. Ahí sí está el veredicto de Apple |
| El receipt dice `TopicDisallowed` | La APNs Key cargada en EAS no está autorizada para este bundle ID: suele ser una clave vieja heredada de otro proyecto, o restringida a otro tema | `eas credentials -p ios` → mirá la fecha de *Push Key*; si es mucho más vieja que los certificados, ahí está. **Add a new push key**. No hace falta rebuildear: la clave vive en los servidores de Expo |
| El receipt dice `DeviceNotRegistered` | La app se desinstaló o revocó el permiso | El sender ya borra ese token solo |
