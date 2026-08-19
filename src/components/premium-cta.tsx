import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Botón para pasarse a Premium.
 *
 * ⚠️ INERTE A PROPÓSITO. RevenueCat todavía no está integrado, así que no hay
 * paywall que abrir ni compra que cobrar. Se prefiere un botón visiblemente
 * deshabilitado antes que simular una compra que no existe.
 *
 * 👉 PARA INTEGRAR REVENUECAT ESTE ES EL ÚNICO ARCHIVO A TOCAR:
 *    1. `onPress={() => RevenueCatUI.presentPaywall()}` (o `presentPaywallIfNeeded`).
 *    2. Quitar `disabled` y el aviso de abajo.
 * El paywall de RevenueCat trae su propio contenido —beneficios, planes y
 * precios ya localizados por App Store Connect y Google Play—, por eso la app
 * no mantiene una pantalla de venta propia: tener precios hardcodeados haría
 * que la app muestre uno y la tienda cobre otro.
 *
 * El resto de la app no necesita cambios: ya lee `mySettings.isPremium`, que es
 * lo que va a escribir el webhook de RevenueCat en `user_settings`.
 */
export function PremiumCta({ nota = true }: { nota?: boolean }) {
  const { colors, status } = useTheme();

  return (
    <View style={styles.wrap}>
      <Button title="Obtener Premium" icon="workspace-premium" disabled onPress={() => {}} />

      {nota ? (
        <View style={[styles.aviso, { backgroundColor: status.helping.soft }]}>
          <MaterialIcons name="construction" size={16} color={status.helping.strong} />
          <Text variant="caption" style={[styles.flex, { color: status.helping.strong }]}>
            Las suscripciones todavía no están habilitadas. Estamos terminando de conectar los
            pagos con App Store y Google Play.
          </Text>
        </View>
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
