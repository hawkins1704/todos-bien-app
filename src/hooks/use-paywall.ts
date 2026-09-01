import { useCallback, useState } from 'react';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { purchasesEnabled, waitForPremiumFlag } from '@/lib/purchases';

/**
 * Abrir el paywall de RevenueCat desde cualquier parte.
 *
 * Vivía dentro de `PremiumCta`, que es un botón. Se sacó acá porque hay
 * pantallas donde el botón que hay que mostrar **no** es «Obtener Premium» sino
 * la acción de siempre —«Nuevo grupo», «Agregar un plan»—, y el paywall se
 * abre recién al tocarla. Ese patrón importa: un botón que desaparece cuando
 * llegas al tope no le enseña a nadie que existe una versión con más. El botón
 * se queda, y al tocarlo la app dice por qué no puede y qué costaría.
 *
 * ## Los dos relojes después de una compra
 *
 * La tienda confirma el cobro al instante, pero el permiso lo otorga nuestro
 * servidor cuando le llega el webhook de RevenueCat y escribe
 * `user_settings.is_premium` (ver `lib/purchases.ts`). `waitForPremiumFlag`
 * cubre ese hueco de segundos; si se agota, la compra igual está hecha y
 * devolvemos `'pendiente'` para poder decirlo con esas palabras en vez de
 * dejar la pantalla diciendo «plan gratuito» justo después de pagar.
 */
export type PaywallResultado =
  /** Compró o restauró, y el servidor ya lo aplicó. */
  | 'listo'
  /** Compró, pero el webhook todavía no llegó. */
  | 'pendiente'
  /** Cerró el paywall sin comprar. No es un error. */
  | 'cerrado'
  /** No se pudo abrir o la tienda falló. */
  | 'error'
  /** La app se compiló sin clave de RevenueCat. */
  | 'no-disponible';

export function usePaywall(): {
  abrirPaywall: () => Promise<PaywallResultado>;
  abriendo: boolean;
  /** `false` si esta build no tiene configurada la clave de la tienda. */
  disponible: boolean;
} {
  const { userId } = useAuth();
  const { refresh } = useAppData();
  const [abriendo, setAbriendo] = useState(false);

  const abrirPaywall = useCallback(async (): Promise<PaywallResultado> => {
    if (!purchasesEnabled) return 'no-disponible';

    setAbriendo(true);
    try {
      const resultado = await RevenueCatUI.presentPaywall();

      if (resultado === PAYWALL_RESULT.PURCHASED || resultado === PAYWALL_RESULT.RESTORED) {
        const aplicado = userId ? await waitForPremiumFlag(userId) : false;
        await refresh();
        return aplicado ? 'listo' : 'pendiente';
      }

      if (resultado === PAYWALL_RESULT.ERROR) return 'error';

      // CANCELLED y NOT_PRESENTED no son errores: la persona cerró el paywall.
      return 'cerrado';
    } catch (caught) {
      if (__DEV__) console.warn('[paywall] no se pudo abrir', caught);
      return 'error';
    } finally {
      setAbriendo(false);
    }
  }, [userId, refresh]);

  return { abrirPaywall, abriendo, disponible: purchasesEnabled };
}
