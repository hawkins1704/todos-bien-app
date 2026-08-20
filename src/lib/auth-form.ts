/**
 * Reglas de los formularios de acceso, en un solo lugar.
 *
 * Están acá y no dentro de cada pantalla porque las comparten cuatro (entrar,
 * crear cuenta, olvidé mi contraseña, contraseña nueva) y porque el mínimo de
 * la contraseña tiene que coincidir con el del servidor: validar distinto en
 * cada pantalla es cómo se llega a que una acepte lo que la otra rechaza.
 */

import { AUTH_MIN_PASSWORD_LENGTH } from '@/lib/config';

/**
 * Deliberadamente laxo: solo descarta lo que es imposible que sea un correo.
 * Una regex estricta rechaza direcciones válidas raras pero reales, y el que
 * decide de verdad es el servidor de correo cuando el mensaje llega o rebota.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/**
 * Devuelve el problema de la contraseña, o null si está bien. Se valida en el
 * cliente para que el aviso salga mientras se escribe y no después de un viaje
 * al servidor.
 */
export function passwordProblem(password: string): string | null {
  if (password.length < AUTH_MIN_PASSWORD_LENGTH) {
    return `La contraseña necesita al menos ${AUTH_MIN_PASSWORD_LENGTH} caracteres.`;
  }
  return null;
}

export const PASSWORD_HINT = `Mínimo ${AUTH_MIN_PASSWORD_LENGTH} caracteres.`;
