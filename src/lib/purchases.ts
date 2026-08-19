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
export async function restorePurchases(): Promise<CustomerInfo> {
  configurePurchases();
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
