/**
 * Constantes de configuración del producto.
 */

/**
 * Base del link de invitación (spec §3).
 *
 * PENDIENTE: todavía no existe la landing page. Debe ser una página propia con
 * botones de descarga a App Store y Play Store, que lea el código de la URL.
 * No se usa Firebase Dynamic Links (Google lo cerró en agosto de 2025).
 */
export const INVITE_BASE_URL = 'https://todosbien.app/i';

export function inviteUrl(code: string): string {
  return `${INVITE_BASE_URL}/${code}`;
}

export function inviteMessage(code: string, inviterName: string): string {
  return (
    `${inviterName} te invitó a Todos Bien, una app para avisarle a tu familia que estás bien ` +
    `después de un sismo.\n\n${inviteUrl(code)}\n\nTu código: ${code}`
  );
}

/**
 * Largo del código que llega por correo.
 *
 * Ya no es el código de acceso —el acceso es con contraseña— pero sigue en uso
 * en los dos flujos que todavía dependen del correo: confirmar la cuenta recién
 * creada y recuperar la contraseña.
 *
 * Se configura en el dashboard: Authentication > Providers > Email >
 * "Email OTP Length" (acepta de 6 a 10). El default de Supabase es 6, pero este
 * proyecto lo tiene en 8. Si allá se cambia, se ajusta acá con
 * EXPO_PUBLIC_AUTH_CODE_LENGTH sin tocar código.
 */
const configuredCodeLength = Number(process.env.EXPO_PUBLIC_AUTH_CODE_LENGTH);

export const AUTH_CODE_LENGTH =
  Number.isInteger(configuredCodeLength) && configuredCodeLength >= 6 && configuredCodeLength <= 10
    ? configuredCodeLength
    : 8;

/**
 * Mínimo de caracteres de la contraseña.
 *
 * Supabase corta en 6 por defecto (Authentication > Providers > Email >
 * "Minimum password length"). Acá se exige 8 y se valida **antes** de llamar a
 * la API: así el error se ve mientras se escribe y no después de un viaje al
 * servidor. Si en el dashboard se sube el mínimo, hay que subirlo también acá,
 * o el servidor va a rechazar contraseñas que la app dio por buenas.
 */
export const AUTH_MIN_PASSWORD_LENGTH = 8;

/** Cuántos contactos de la agenda se procesan por lote al hashear. */
export const CONTACTS_PAGE_SIZE = 300;

/**
 * Jitter máximo (ms) al escribir el estado tras una alerta.
 *
 * Spec §6: evita que 200k+ dispositivos escriban en el mismo instante exacto.
 * Solo aplica a la escritura automática disparada por la alerta; cuando el
 * usuario toca un estado a mano la escritura es inmediata.
 */
export const ALERT_WRITE_JITTER_MS = 8000;

/**
 * Los planes, precios y beneficios de Premium NO viven en la app.
 *
 * Vienen del paywall de RevenueCat, que toma los precios ya localizados de App
 * Store Connect y Google Play. Mantener una copia acá haría que la app muestre
 * un precio y la tienda cobre otro. La referencia de producto está en la spec
 * §12 y §13; el único punto de enganche en código es
 * `src/components/premium-cta.tsx`.
 */
