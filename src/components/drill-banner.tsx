import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';

export type DrillBannerProps = {
  compact?: boolean;
  /**
   * Encendelo cuando el banner es lo primero de una pantalla SIN header nativo:
   * ahí arranca en y=0 y el texto queda debajo del reloj y la isla dinámica.
   * Apagado en pantallas con header (el chat), donde sumarlo pintaría una
   * franja amarilla de más.
   */
  topInset?: boolean;
};

/**
 * Marca visual persistente e inequívoca de simulacro (spec §9).
 *
 * Tiene que aparecer en TODA pantalla relevante mientras el simulacro esté
 * activo: nadie debe poder confundir una práctica con un evento real.
 */
export function DrillBanner({ compact = false, topInset = false }: DrillBannerProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.banner,
        compact ? styles.compact : styles.full,
        topInset && !compact ? { paddingTop: insets.top + Spacing.sm } : null,
      ]}>
      <MaterialIcons name="school" size={compact ? 14 : 18} color="#3A2A00" />
      <Text
        variant={compact ? 'caption' : 'footnote'}
        weight="700"
        style={styles.label}>
        SIMULACRO
      </Text>
      {compact ? null : (
        <Text variant="footnote" style={styles.sub}>
          · esto es una práctica, no un sismo real
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    // Amarillo fijo en ambos temas a propósito: esta marca no debe cambiar de
    // aspecto según el modo del sistema.
    backgroundColor: '#FFD60A',
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  full: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  compact: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  label: { color: '#3A2A00', letterSpacing: 0.8 },
  sub: { color: '#3A2A00' },
});
