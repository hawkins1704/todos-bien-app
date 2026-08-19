import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { purchasesEnabled, waitForPremiumFlag } from '@/lib/purchases';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Botón para pasarse a Premium.
 *
 * Abre el paywall de RevenueCat, que trae su propio contenido —beneficios,
 * planes y precios ya localizados por App Store Connect y Google Play—. Por eso
 * la app no mantiene una pantalla de venta propia: tener precios hardcodeados
 * haría que la app muestre uno y la tienda cobre otro.
 *
 * Después de una compra hay dos relojes distintos: la tienda confirma el cobro
 * al instante, pero el permiso lo otorga nuestro servidor cuando le llega el
 * webhook de RevenueCat y escribe `user_settings.is_premium`. `waitForPremiumFlag`
 * cubre ese hueco de segundos para que la pantalla no siga diciendo "Plan
 * gratuito" justo después de pagar.
 *
 * Sin `EXPO_PUBLIC_REVENUECAT_IOS_KEY` configurada el botón queda visiblemente
 * deshabilitado: se prefiere eso antes que abrir un paywall que va a fallar.
 */
export function PremiumCta() {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { refresh } = useAppData();

  const [busy, setBusy] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const abrirPaywall = useCallback(async () => {
    setBusy(true);
    setAviso(null);

    try {
      const resultado = await RevenueCatUI.presentPaywall();

      if (resultado === PAYWALL_RESULT.PURCHASED || resultado === PAYWALL_RESULT.RESTORED) {
        const aplicado = userId ? await waitForPremiumFlag(userId) : false;
        await refresh();

        if (!aplicado) {
          setAviso(
            'Tu compra quedó registrada. Puede tardar unos minutos en activarse; si no la ves, cerrá y volvé a abrir la app.',
          );
        }
      } else if (resultado === PAYWALL_RESULT.ERROR) {
        setAviso('No pudimos conectarnos con la tienda. Revisá tu conexión e intentá de nuevo.');
      }
      // CANCELLED y NOT_PRESENTED no son errores: la persona cerró el paywall.
    } catch (caught) {
      if (__DEV__) console.warn('[premium-cta] el paywall falló', caught);
      setAviso('No pudimos abrir las opciones de Premium. Intentá de nuevo en un momento.');
    } finally {
      setBusy(false);
    }
  }, [userId, refresh]);

  return (
    <View style={styles.wrap}>
      <Button
        title="Obtener Premium"
        icon="workspace-premium"
        loading={busy}
        disabled={!purchasesEnabled}
        onPress={() => void abrirPaywall()}
      />

      {purchasesEnabled ? null : (
        <View style={[styles.aviso, { backgroundColor: colors.surfaceSunken }]}>
          <Text variant="footnote" tone="secondary" style={styles.flex}>
            Las suscripciones todavía no están habilitadas en esta versión.
          </Text>
        </View>
      )}

      {aviso ? (
        <Text variant="footnote" tone="secondary" center>
          {aviso}
        </Text>
      ) : null}

      <Text variant="caption" tone="tertiary" center style={{ color: colors.textTertiary }}>
        El núcleo de seguridad es gratis y sin límites: tu círculo, tus estados, tu ubicación y
        el chat no dependen de Premium.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.sm },
  flex: { flex: 1 },
  aviso: {
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
});
