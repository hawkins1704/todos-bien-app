import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

import { CONTACTS_PAGE_SIZE } from '@/lib/config';
import { normalizeAndHash } from '@/lib/phone';

/**
 * Lectura de la agenda y hashing local (spec §3, pasos 1 y 2).
 *
 * NADA de este módulo manda números en texto plano a ningún lado. Lo único que
 * sale del dispositivo son hashes SHA-256, y eso ocurre en api.matchContacts().
 */

export type LocalContact = {
  id: string;
  name: string;
  numbers: string[];
};

export type HashEntry = {
  hash: string;
  e164: string;
  localName: string;
};

export async function getContactsPermission(): Promise<boolean> {
  const response = await getPermissionsAsync();
  return response.granted;
}

/** Con `canAskAgain`: ver la nota en `getNotificationPermissionState`. */
export async function getContactsPermissionState(): Promise<{
  granted: boolean;
  canAskAgain: boolean;
}> {
  const { granted, canAskAgain } = await getPermissionsAsync();
  return { granted, canAskAgain };
}

export async function requestContactsPermission(): Promise<boolean> {
  const response = await requestPermissionsAsync();
  return response.granted;
}

const FIELDS = [
  ContactField.FULL_NAME,
  ContactField.GIVEN_NAME,
  ContactField.FAMILY_NAME,
  ContactField.PHONES,
] as const;

export async function readDeviceContacts(): Promise<LocalContact[]> {
  const collected: LocalContact[] = [];
  let offset = 0;

  // Se pagina para no traer una agenda de miles de contactos de un golpe.
  for (;;) {
    const page = await Contact.getAllDetails(FIELDS, {
      limit: CONTACTS_PAGE_SIZE,
      offset,
    });

    if (page.length === 0) break;

    for (const [index, entry] of page.entries()) {
      const record = entry as {
        id?: string;
        fullName?: string | null;
        givenName?: string | null;
        familyName?: string | null;
        phones?: { number?: string | null }[] | null;
      };

      const numbers = (record.phones ?? [])
        .map((phone) => phone?.number)
        .filter((number): number is string => Boolean(number));

      if (numbers.length === 0) continue;

      const name =
        record.fullName?.trim() ||
        [record.givenName, record.familyName].filter(Boolean).join(' ').trim() ||
        'Sin nombre';

      collected.push({ id: record.id ?? `${offset + index}`, name, numbers });
    }

    if (page.length < CONTACTS_PAGE_SIZE) break;
    offset += CONTACTS_PAGE_SIZE;
  }

  return collected;
}

/**
 * Normaliza a E.164 y hashea. Un contacto con varios números produce varias
 * entradas; se deduplica por hash, quedándose con el primer nombre visto.
 */
export async function buildHashEntries(
  contacts: LocalContact[],
  defaultCountry = 'PE',
): Promise<HashEntry[]> {
  const byHash = new Map<string, HashEntry>();

  for (const contact of contacts) {
    for (const raw of contact.numbers) {
      const normalized = await normalizeAndHash(raw, defaultCountry);
      if (!normalized) continue;
      if (byHash.has(normalized.hash)) continue;

      byHash.set(normalized.hash, {
        hash: normalized.hash,
        e164: normalized.e164,
        localName: contact.name,
      });
    }
  }

  return [...byHash.values()];
}
