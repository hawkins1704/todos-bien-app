import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { usePaywall } from '@/hooks/use-paywall';
import { purchasesEnabled } from '@/lib/purchases';
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
 * La mecánica del paywall vive en `usePaywall`, porque hay pantallas que lo
 * abren desde un botón que no dice «Premium» (ver el hook). Acá queda lo que es
 * de este componente: el botón de venta y los avisos que se muestran debajo.
 *
 * Sin `EXPO_PUBLIC_REVENUECAT_IOS_KEY` configurada el botón queda visiblemente
 * deshabilitado: se prefiere eso antes que abrir un paywall que va a fallar.
 */
export function PremiumCta() {
  const { colors } = useTheme();
  const { abrirPaywall, abriendo } = usePaywall();

  const [aviso, setAviso] = useState<string | null>(null);

  const abrir = useCallback(async () => {
    setAviso(null);
    const resultado = await abrirPaywall();

    if (resultado === 'pendiente') {
      setAviso(
        'Tu compra quedó registrada. Puede tardar unos minutos en activarse; si no la ves, cierra y vuelve a abrir la app.',
      );
    } else if (resultado === 'sin-identidad') {
      // No se abrió el paywall y nadie pagó nada. El texto lo dice con esas
      // palabras a propósito: «no pudimos conectarnos con la tienda» haría
      // pensar que quizá la compra salió a medias.
      setAviso(
        'No pudimos preparar tu compra. No se cobró nada. Revisa tu conexión e intenta de nuevo; si sigue pasando, cierra sesión y vuelve a entrar.',
      );
    } else if (resultado === 'error') {
      setAviso('No pudimos conectarnos con la tienda. Revisa tu conexión e intenta de nuevo.');
    }
  }, [abrirPaywall]);

  return (
    <View style={styles.wrap}>
      <Button
        title="Obtener Premium"
        icon="workspace-premium"
        loading={abriendo}
        disabled={!purchasesEnabled}
        onPress={() => void abrir()}
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
        El núcleo de seguridad es gratis y sin límites: tu red, tus estados, tu ubicación y
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
