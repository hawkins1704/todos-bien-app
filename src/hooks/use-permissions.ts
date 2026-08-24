import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getContactsPermissionState } from '@/lib/contacts';
import { getPermissionState } from '@/lib/location';
import { getNotificationPermissionState } from '@/lib/notifications';

/**
 * El estado de los tres permisos que la app pide, en un solo lugar.
 *
 * **Se relee al volver a la app, no solo al montar.** No es un detalle: el
 * camino más común para conceder un permiso que ya se rechazó es salir a los
 * Ajustes del sistema y volver, y en ese viaje la pantalla nunca se desmonta ni
 * pierde el foco. Sin esto, la persona concede el permiso, vuelve, y la app le
 * sigue diciendo que falta.
 */

export type PermissionKey = 'location' | 'notifications' | 'contacts';

/**
 * Tres grados y no dos, porque la ubicación no es binaria: «solo con la app
 * abierta» no es lo mismo que «nunca» —sirve para reportar a mano— pero tampoco
 * alcanza para lo que la app promete, que es capturar dónde estás en los
 * minutos siguientes al sismo aunque el teléfono siga en el bolsillo.
 */
export type PermissionGrade = 'granted' | 'partial' | 'denied';

export type PermissionSnapshot = {
  grade: PermissionGrade;
  /**
   * `false` = el sistema ya no muestra el diálogo. Hay que distinguirlo: un
   * botón «Permitir» que no abre nada deja a la persona sin saber qué hacer.
   */
  canAskAgain: boolean;
};

export type PermissionsState = Record<PermissionKey, PermissionSnapshot>;

const DESCONOCIDO: PermissionSnapshot = { grade: 'denied', canAskAgain: true };

export async function readPermissions(): Promise<PermissionsState> {
  const [location, notifications, contacts] = await Promise.all([
    getPermissionState(),
    getNotificationPermissionState(),
    getContactsPermissionState(),
  ]);

  return {
    location: {
      grade:
        location.level === 'background'
          ? 'granted'
          : location.level === 'foreground'
            ? 'partial'
            : 'denied',
      canAskAgain: location.canAskAgain,
    },
    notifications: {
      grade: notifications.granted ? 'granted' : 'denied',
      canAskAgain: notifications.canAskAgain,
    },
    contacts: {
      grade: contacts.granted ? 'granted' : 'denied',
      canAskAgain: contacts.canAskAgain,
    },
  };
}

export function usePermissions(): {
  permissions: PermissionsState | null;
  reload: () => void;
} {
  const [permissions, setPermissions] = useState<PermissionsState | null>(null);

  const reload = useCallback(() => {
    void readPermissions()
      .then(setPermissions)
      // Que no se pueda leer un permiso no puede romper la pantalla de Ajustes.
      // Se muestra como "sin conceder", que es el lado seguro del error: invita
      // a revisarlo en vez de afirmar que está todo bien.
      .catch(() =>
        setPermissions({
          location: DESCONOCIDO,
          notifications: DESCONOCIDO,
          contacts: DESCONOCIDO,
        }),
      );
  }, []);

  useEffect(() => {
    reload();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') reload();
    });
    return () => subscription.remove();
  }, [reload]);

  return { permissions, reload };
}
