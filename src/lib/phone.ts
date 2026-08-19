import * as Crypto from 'expo-crypto';

/**
 * Normalización a E.164 y hashing de números (spec §3).
 *
 * El hash se calcula SIEMPRE en el dispositivo: la agenda nunca sale del
 * teléfono en texto plano, ni siquiera hacia nuestro propio backend.
 */

const DIAL_CODES: Record<string, string> = {
  PE: '51',
  AR: '54',
  BO: '591',
  BR: '55',
  CL: '56',
  CO: '57',
  EC: '593',
  ES: '34',
  MX: '52',
  US: '1',
  VE: '58',
};

/**
 * Sal fija de la app.
 *
 * Sinceramiento: NO es un secreto. Vive en el bundle, así que quien
 * descompile la app la obtiene. Su único valor real es que una tabla rainbow
 * genérica de SHA-256 de números telefónicos no sirve contra nuestra base.
 * Contra un atacante con la app en la mano, el espacio de números móviles
 * peruanos (~10^8) sigue siendo forzable por fuerza bruta.
 *
 * Cambiarla invalida TODOS los hashes ya guardados y rompe el match de
 * contactos y las invitaciones pendientes: solo se toca con una migración.
 */
const PHONE_HASH_SALT = 'todosbien.v1';

/**
 * Lleva un número tal como está escrito en la agenda a formato E.164.
 * Devuelve null si no se puede interpretar con confianza.
 */
export function normalizeToE164(raw: string, defaultCountry = 'PE'): string | null {
  if (!raw) return null;

  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  let digits = trimmed.replace(/\D/g, '');

  if (!digits) return null;

  // 00 es el prefijo internacional en gran parte del mundo.
  if (!hasPlus && digits.startsWith('00')) {
    digits = digits.slice(2);
    return validate(`+${digits}`);
  }

  if (hasPlus) {
    return validate(`+${digits}`);
  }

  const dial = DIAL_CODES[defaultCountry];
  if (!dial) return null;

  // Ya trae el código de país pero sin el "+".
  if (digits.startsWith(dial) && digits.length > dial.length + 5) {
    return validate(`+${digits}`);
  }

  // Prefijo troncal nacional: en Perú se marca 0 antes del número local.
  if (digits.startsWith('0')) {
    digits = digits.replace(/^0+/, '');
  }

  if (!digits) return null;

  return validate(`+${dial}${digits}`);
}

function validate(candidate: string): string | null {
  // E.164: "+" seguido de 7 a 15 dígitos, sin empezar en 0.
  return /^\+[1-9]\d{6,14}$/.test(candidate) ? candidate : null;
}

/** SHA-256 en hex del número en E.164 con la sal de la app. */
export async function hashPhone(e164: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${PHONE_HASH_SALT}:${e164}`,
    { encoding: Crypto.CryptoEncoding.HEX },
  );
}

/** Normaliza y hashea de una. Devuelve null si el número no es interpretable. */
export async function normalizeAndHash(
  raw: string,
  defaultCountry = 'PE',
): Promise<{ e164: string; hash: string } | null> {
  const e164 = normalizeToE164(raw, defaultCountry);
  if (!e164) return null;
  return { e164, hash: await hashPhone(e164) };
}

/**
 * Códigos de país conocidos, del más largo al más corto.
 *
 * El orden importa: hay que probar `591` (Bolivia) antes que `59…`, y `1`
 * (EE.UU.) al final, para que gane siempre el prefijo más específico.
 */
const DIAL_CODES_BY_LENGTH = [...new Set(Object.values(DIAL_CODES))].sort(
  (a, b) => b.length - a.length,
);

/**
 * Formato de lectura para mostrar el propio número: `+51 999 122 784`.
 *
 * El código de país se toma de la lista, NO se adivina por cantidad de dígitos.
 * Adivinarlo con `\d{1,3}` es greedy y parte mal los números de dos dígitos de
 * código: `+51999122784` salía como `+519 991 227 84` en vez de
 * `+51 999 122 784`.
 *
 * El resto se agrupa de a 3, que es la convención latina y calza exacto con los
 * 9 dígitos de un móvil peruano. En países con otra convención (EE.UU. agrupa
 * 3-3-4) puede quedar un grupo final corto; se acepta porque hoy la app opera
 * solo en Perú (`country_code` default 'PE').
 */
export function formatE164ForDisplay(e164: string | null): string {
  if (!e164) return '';

  const digits = e164.replace(/\D/g, '');
  const dial = DIAL_CODES_BY_LENGTH.find((code) => digits.startsWith(code));

  // Sin código conocido no se sabe dónde corta el país: mejor mostrarlo crudo
  // que inventar una separación equivocada.
  if (!dial) return e164;

  const grouped = digits.slice(dial.length).replace(/(\d{3})(?=\d)/g, '$1 ');
  return `+${dial} ${grouped}`;
}
