/**
 * Constantes de configuración del producto.
 */

/** Sitio público. Es lo que se comparte al invitar a alguien. */
export const APP_WEBSITE_URL = 'https://todosbien.app';

/**
 * Mensaje para compartir la app. **No lleva código de invitación.**
 *
 * El MVP salió sin códigos: se conecta gente por el match de agenda de la spec
 * §3 —hash del teléfono + solicitud que la otra persona acepta— y compartir es
 * solo el empujón para que la instale. Un código agrega una pantalla, una
 * landing que lo lea, captura del deep link y una segunda vía de conexión que
 * hay que mantener y explicar, a cambio de ahorrar un paso que el match ya
 * resuelve.
 *
 * Lo que había antes de esto vivía a medias y conviene saberlo si alguna vez se
 * repone: el código se generaba y se compartía, pero **nada del cliente creaba
 * una invitación con `invitee_phone_hash`** —los dos llamadores pasaban `null`—,
 * así que el auto-vínculo por teléfono del trigger `link_pending_invitations`
 * (migración 0002) no se disparaba nunca. Se citaba como red de seguridad y no
 * lo era.
 */
export function shareAppMessage(inviterName: string): string {
  return (
    `${inviterName} te invitó a Todos Bien, la app para avisarle a tu familia que estás bien ` +
    `después de un sismo.\n\n${APP_WEBSITE_URL}\n\n` +
    `Instálala y regístrate con tu número: así se encuentran en la app.`
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
