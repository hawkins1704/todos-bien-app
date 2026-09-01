import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useDrill } from '@/context/drill';
import { Radius, Spacing } from '@/theme/tokens';

/**
 * La franja amarilla del simulacro (spec §9).
 *
 * **Vive en el layout raíz, arriba del `Stack`**, y por eso está en todas las
 * pantallas sin que ninguna tenga que acordarse de pintarla — incluidas las
 * modales, el chat y los ajustes. Antes cada pantalla la ponía por su cuenta y
 * el resultado era que faltaba en la mayoría: una marca de simulacro que
 * aparece a veces es peor que ninguna, porque enseña a no mirarla.
 *
 * Dice **dónde se sale**, y eso no es un detalle de copia: desde la 0035 la
 * única salida está en Ajustes. Un modo del que no se ve cómo salir es una
 * trampa, y la app se desinstala.
 */
export function DrillBanner() {
  const insets = useSafeAreaInsets();
  const { isDrilling } = useDrill();

  if (!isDrilling) return null;

  return (
    <Animated.View
      entering={FadeInUp.duration(240)}
      exiting={FadeOutUp.duration(180)}
      accessibilityRole="alert"
      style={[styles.banner, { paddingTop: insets.top + Spacing.sm }]}>
      <MaterialIcons name="school" size={16} color="#3A2A00" />
      <Text variant="footnote" weight="700" style={styles.label}>
        SIMULACRO
      </Text>
      <Text variant="caption" style={styles.sub} numberOfLines={1}>
        · para salir, ve a Ajustes
      </Text>
    </Animated.View>
  );
}

/**
 * La versión chica, para meter dentro de una tarjeta o de una burbuja de chat.
 * No se pinta sola: la usa quien ya sabe que hay simulacro.
 */
export function DrillTag() {
  return (
    <View style={styles.compact}>
      <MaterialIcons name="school" size={12} color="#3A2A00" />
      <Text variant="caption" weight="700" style={styles.label}>
        SIMULACRO
      </Text>
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
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  compact: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFD60A',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  label: { color: '#3A2A00', letterSpacing: 0.8 },
  sub: { color: '#3A2A00' },
});
