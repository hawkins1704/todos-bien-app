/**
 * Traducción de los errores de Supabase Auth a copy que se pueda leer en pantalla.
 *
 * Los mensajes de Supabase vienen en inglés y son de infraestructura ("Invalid
 * login credentials", "Error sending confirmation email"). Mostrarlos crudos fue
 * justamente el bug que se reportó: la pantalla decía *Error sending confirmation
 * email* sin decir qué hacer al respecto.
 *
 * Se traduce por `code`, no por el texto del mensaje: el texto de Supabase cambia
 * entre versiones y el código es contrato estable.
 * https://supabase.com/docs/guides/auth/debugging/error-codes
 */

type SupabaseAuthError = { code?: string; status?: number; message?: string };

function asAuthError(caught: unknown): SupabaseAuthError | null {
  if (typeof caught !== 'object' || caught === null) return null;
  const maybe = caught as SupabaseAuthError;
  if (typeof maybe.message !== 'string') return null;
  return maybe;
}

const GENERIC = 'No pudimos completar la operación. Revisa tu conexión e intenta de nuevo.';

/**
 * El fallo del proveedor de correo se distingue aparte porque **no es culpa de
 * quien usa la app** y no se arregla reintentando: es configuración del servidor
 * (remitente sin dominio verificado, credenciales de SMTP vencidas). Decirle
 * "revisa tu conexión" mandaría a la persona a perseguir un problema que no tiene.
 */
const EMAIL_DELIVERY =
  'No pudimos enviar el correo en este momento. No es culpa tuya: intenta de nuevo en unos minutos.';

export function authErrorMessage(caught: unknown): string {
  const error = asAuthError(caught);
  if (!error) return GENERIC;

  switch (error.code) {
    case 'invalid_credentials':
      return 'Correo o contraseña incorrectos.';

    case 'email_not_confirmed':
      return 'Todavía no confirmaste tu correo. Revisa tu bandeja de entrada.';

    case 'user_already_exists':
    case 'email_exists':
      return 'Ese correo ya tiene una cuenta. Entra con tu contraseña.';

    case 'weak_password':
      return 'Esa contraseña es muy débil. Usa una más larga o menos obvia.';

    case 'same_password':
      return 'La contraseña nueva tiene que ser distinta de la anterior.';

    case 'email_address_invalid':
    case 'validation_failed':
      return 'Ese correo no parece válido. Revísalo.';

    case 'otp_expired':
      return 'Ese código ya venció. Pide uno nuevo.';

    case 'over_email_send_rate_limit':
      return 'Ya pediste varios correos seguidos. Espera unos minutos antes de volver a intentar.';

    case 'over_request_rate_limit':
      return 'Demasiados intentos seguidos. Espera un momento.';

    case 'signup_disabled':
      return 'El registro está deshabilitado por ahora.';

    case 'user_not_found':
      return 'No encontramos una cuenta con ese correo.';

    // Los dos de abajo no son de Supabase Auth sino SQLSTATE de Postgres: los
    // levanta `delete_my_account` (migración 0013), que valida la contraseña en
    // el servidor y llega acá como PostgrestError, no como AuthError.
    case '28P01':
      return 'Esa contraseña no es correcta.';

    case '28000':
      return 'Tu sesión venció. Vuelve a entrar e intenta de nuevo.';
  }

  // Cuando el SMTP rechaza el envío, Supabase devuelve 500 con
  // `unexpected_failure` y el detalle del proveedor en el mensaje.
  if (/sending|smtp|mail/i.test(error.message ?? '')) return EMAIL_DELIVERY;

  // Sin red, supabase-js no llega a producir un AuthError con código.
  if (/fetch|network/i.test(error.message ?? '')) {
    return 'No hay conexión. Revisa tu internet e intenta de nuevo.';
  }

  return GENERIC;
}
