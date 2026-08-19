import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import RevenueCatUI from 'react-native-purchases-ui';

import { PremiumCta } from '@/components/premium-cta';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import {
  hasPremiumEntitlement,
  purchasesEnabled,
  restorePurchases,
  waitForPremiumFlag,
} from '@/lib/purchases';
import { Spacing } from '@/theme/tokens';

/**
 * Bloque de suscripción de Mi cuenta. Dos caras según el plan:
 *
 * - **Con Premium:** el Customer Center de RevenueCat. Es una pantalla nativa
 *   configurada desde el dashboard que resuelve cancelar, cambiar de plan y
 *   —solo en iOS— pedir un reembolso, sin que la app tenga que reimplementar
 *   nada ni mandar a la gente a Ajustes a buscarlo.
 * - **Sin Premium:** el paywall, más un botón explícito de restaurar compras.
 *
 * Restaurar no es opcional: el plan de por vida es una compra no consumible y
 * Apple rechaza las apps que no ofrecen forma de recuperarla en un teléfono
 * nuevo. El paywall trae su propio botón, pero Mi cuenta es donde alguien que
 * ya pagó lo va a buscar.
 */
export function SubscriptionManager() {
  const { mySettings, refresh } = useAppData();
  const { userId } = useAuth();

  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const isPremium = mySettings?.isPremium ?? false;

  const abrirCustomerCenter = useCallback(async () => {
    setAviso(null);

    try {
      await RevenueCatUI.presentCustomerCenter({
        callbacks: {
          onRestoreCompleted: () => {
            void refresh();
          },
        },
      });
    } catch (caught) {
      if (__DEV__) console.warn('[suscripción] el customer center falló', caught);
      setAviso('No pudimos abrir la gestión de tu suscripción. Intentá de nuevo en un momento.');
      return;
    }

    // Cancelar o cambiar de plan lo confirma la tienda, y el cambio real de
    // permisos llega después por el webhook. Refrescamos igual para reflejar lo
    // que ya se sepa.
    await refresh();
  }, [refresh]);

  const restaurar = useCallback(async () => {
    setBusy(true);
    setAviso(null);

    try {
      const info = await restorePurchases();

      if (!hasPremiumEntitlement(info)) {
        setAviso('No encontramos compras anteriores con este ID de Apple.');
        return;
      }

      const aplicado = userId ? await waitForPremiumFlag(userId) : false;
      await refresh();

      if (!aplicado) {
        setAviso('Encontramos tu compra. Puede tardar unos minutos en activarse.');
      }
    } catch (caught) {
      if (__DEV__) console.warn('[suscripción] restaurar falló', caught);
      setAviso('No pudimos restaurar tus compras. Revisá tu conexión e intentá de nuevo.');
    } finally {
      setBusy(false);
    }
  }, [userId, refresh]);

  if (isPremium) {
    return (
      <View style={styles.wrap}>
        <Button
          title="Administrar suscripción"
          icon="manage-accounts"
          variant="secondary"
          onPress={() => void abrirCustomerCenter()}
        />
        {aviso ? (
          <Text variant="footnote" tone="secondary" center>
            {aviso}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <PremiumCta />

      {purchasesEnabled ? (
        <Button
          title="Restaurar compras"
          variant="ghost"
          loading={busy}
          onPress={() => void restaurar()}
        />
      ) : null}

      {aviso ? (
        <Text variant="footnote" tone="secondary" center>
          {aviso}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
});
