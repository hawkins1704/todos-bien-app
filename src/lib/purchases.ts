import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';

import { fetchMySettings } from '@/lib/api';

/**
 * Integración con RevenueCat (spec §12 y §13).
 *
 * ## Quién decide si alguien es Premium
 *
 * La app **no** decide. `user_settings.is_premium` está fuera del grant de
 * UPDATE de `authenticated` (migración 0001) y lo escribe únicamente el service
 * role desde el webhook de RevenueCat (`supabase/functions/revenuecat-webhook`).
 * Toda la app lee ese campo vía `mySettings.isPremium`.
 *
 * El `customerInfo` del SDK se usa solo para lo que pasa en el teléfono
 * (¿muestro el paywall o el centro de suscripción?). Si se usara como fuente de
 * verdad, un dispositivo con la caché adelantada vería beneficios que el
 * servidor todavía no otorga —y las alertas mundiales, que se resuelven en
 * Postgres, no llegarían igual—.
 *
 * ## Cómo se ata la compra al usuario
 *
 * `Purchases.logIn(userId)` con el UUID de Supabase. Ese valor es el que
 * RevenueCat manda como `app_user_id` en el webhook, y es lo que permite saber
 * a qué fila de `user_settings` corresponde la compra. Sin esto el webhook
 * recibiría un id anónimo (`$RCAnonymousID:...`) imposible de mapear.
 */

/**
 * Clave pública por tienda. Viaja dentro del binario a propósito: RevenueCat
 * diseñó las SDK keys para eso.
 */
const apiKey = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
  default: undefined,
});

/**
 * Sin clave configurada la app funciona igual, solo que sin paywall. Es
 * deliberado: el núcleo de seguridad es gratis, así que una integración de
 * cobro a medio configurar no puede impedir que alguien use la app.
 */
export const purchasesEnabled = Boolean(apiKey);

/**
 * Identificador del entitlement, no su nombre para mostrar. En el dashboard
 * conviven los dos ("Todos Bien Premium" es el display name) y el SDK indexa
 * `entitlements.active` por el identifier.
 */
export const PREMIUM_ENTITLEMENT = process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT || 'premium';

let configured = false;

/**
 * Arranca el SDK. Idempotente: se llama al cargar el layout raíz y otra vez
 * cada vez que cambia la sesión, porque el orden entre ambas cosas no está
 * garantizado.
 */
export function configurePurchases(): void {
  if (configured || !apiKey) return;
  configured = true;

  if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  // StoreKit 2 es el default del SDK 10 en iOS y es lo que espera la In-App
  // Purchase Key (.p8) que se cargó en RevenueCat, no el viejo shared secret.
  Purchases.configure({ apiKey });
}

/**
 * Ata (o desata) la sesión de RevenueCat a la de Supabase.
 *
 * Nunca lanza: que falle la red de RevenueCat no puede tumbar el arranque de
 * una app cuyo propósito es avisar que estás bien después de un sismo.
 */
export async function syncPurchasesUser(userId: string | null): Promise<void> {
  if (!purchasesEnabled) return;
  configurePurchases();

  try {
    if (userId) {
      await Purchases.logIn(userId);
      return;
    }

    // `logOut()` lanza si el usuario ya es anónimo, y eso pasa siempre en el
    // primer arranque sin sesión.
    if (!(await Purchases.isAnonymous())) await Purchases.logOut();
  } catch (caught) {
    if (__DEV__) console.warn('[purchases] no se pudo sincronizar el usuario', caught);
  }
}

/**
 * ¿El SDK está identificado como ESTE usuario? Si no, lo intenta y lo dice.
 *
 * ## Por qué hace falta, y qué costó no tenerlo
 *
 * 🔴 **2026-09-06, en sandbox.** Una compra entró a RevenueCat con
 * `app_user_id = "$RCAnonymousID:c2fd7f83…"` en vez del UUID de Supabase. El
 * webhook no tenía a qué fila de `user_settings` aplicarla, así que **nadie
 * recibió Premium**: la tienda cobró y el permiso no se otorgó. Peor: el evento
 * llegó como `TRANSFER` y le **quitó** Premium a la cuenta que sí lo tenía,
 * porque el mismo Apple ID de prueba había comprado antes desde ella.
 *
 * `syncPurchasesUser` ya llamaba a `logIn`, pero con dos agujeros:
 *
 *   1. corre en un `useEffect` suelto y **se traga los errores** —solo avisa en
 *      `__DEV__`—, así que un fallo de red al arrancar dejaba el SDK anónimo sin
 *      que nada en la app lo supiera;
 *   2. nadie lo comprobaba antes de vender. El paywall se abría igual.
 *
 * La lección: `logIn` no es una tarea de arranque que se lanza y se olvida. Es
 * una **precondición de la compra**, y hay que verificarla en el momento de
 * comprar, no minutos antes.
 *
 * Devuelve `false` cuando no pudo, y quien vende tiene que respetarlo: es
 * preferible no cobrar a cobrar sin poder entregar.
 */
export async function ensurePurchasesUser(userId: string): Promise<boolean> {
  if (!purchasesEnabled) return false;
  configurePurchases();

  try {
    if ((await Purchases.getAppUserID()) === userId) return true;

    const { customerInfo } = await Purchases.logIn(userId);
    // No se confía en que `logIn` haya resuelto: se vuelve a preguntar. Si el
    // SDK quedó anónimo igual, la respuesta honesta es `false`.
    void customerInfo;
    return (await Purchases.getAppUserID()) === userId;
  } catch (caught) {
    if (__DEV__) console.warn('[purchases] no se pudo identificar al usuario', caught);
    return false;
  }
}

/**
 * ¿El SDK ve algún entitlement activo en este dispositivo?
 *
 * Se usa para elegir qué mostrar en la app, no para otorgar beneficios: eso lo
 * decide `is_premium` en la base.
 *
 * Se pregunta por "algún entitlement" y no por `PREMIUM_ENTITLEMENT` a
 * propósito: el proyecto tiene un solo entitlement, y si el identifier del
 * dashboard no coincide con el configurado acá, el costo de la versión estricta
 * sería mostrarle el paywall de nuevo a alguien que ya pagó.
 */
export function hasPremiumEntitlement(info: CustomerInfo): boolean {
  return Object.keys(info.entitlements.active).length > 0;
}

/** Lee el estado de compras del dispositivo. `null` si el SDK no está activo. */
export async function getCustomerInfo(): Promise<CustomerInfo | null> {
  if (!purchasesEnabled) return null;
  configurePurchases();

  try {
    return await Purchases.getCustomerInfo();
  } catch (caught) {
    if (__DEV__) console.warn('[purchases] getCustomerInfo falló', caught);
    return null;
  }
}

/**
 * Restaura compras previas.
 *
 * Apple lo exige para los planes de por vida (compra no consumible): sin un
 * camino explícito para recuperar la compra en un teléfono nuevo, la revisión
 * rechaza la app. El paywall de RevenueCat trae su propio botón, pero este vive
 * en Mi cuenta, que es donde alguien que ya pagó va a buscarlo.
 */
export async function restorePurchases(userId: string): Promise<CustomerInfo> {
  configurePurchases();

  // Restaurar con el SDK anónimo tiene el mismo final que comprar con el SDK
  // anónimo: la compra queda atada a un `$RCAnonymousID` y el webhook no sabe a
  // quién dársela. Por eso la identidad es un **argumento obligatorio** y se
  // verifica acá adentro, y no una llamada previa que el próximo sitio que use
  // esta función se pueda olvidar de hacer.
  if (!(await ensurePurchasesUser(userId))) {
    throw new Error('No pudimos identificar tu cuenta para restaurar la compra.');
  }

  return Purchases.restorePurchases();
}

/**
 * Espera a que el webhook escriba `is_premium` después de una compra.
 *
 * El cobro lo confirma la tienda, pero el permiso lo otorga nuestro servidor
 * cuando RevenueCat le avisa. Entre una cosa y la otra pasan segundos, y en ese
 * hueco la pantalla seguiría diciendo "Plan gratuito" justo después de pagar.
 *
 * Se consulta la fila directo en vez de usar `refresh()` del contexto porque
 * acá hace falta ver el valor *ahora*, no dentro de un render posterior.
 * Devuelve `false` si se agotaron los reintentos: la compra igual está hecha y
 * el webhook la va a aplicar, solo que la UI se entera en el próximo refresco.
 */
const PREMIUM_POLL_DELAYS_MS = [800, 1500, 2500, 4000, 6000];

export async function waitForPremiumFlag(userId: string): Promise<boolean> {
  for (const delay of PREMIUM_POLL_DELAYS_MS) {
    await new Promise((resolve) => setTimeout(resolve, delay));

    try {
      const settings = await fetchMySettings(userId);
      if (settings?.isPremium) return true;
    } catch {
      // Sin red se reintenta en la vuelta siguiente.
    }
  }

  return false;
}
