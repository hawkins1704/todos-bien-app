import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, View } from 'react-native';

import { magnitudeSeverity } from '@/components/quake-card';
import { Text } from '@/components/ui/text';
import { elapsedShort, formatMagnitude } from '@/lib/format';
import { shortPlace } from '@/lib/quakes';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { QuakeEvent } from '@/types/domain';

/**
 * Fila de la lista de Noticias Sísmicas.
 *
 * Es deliberadamente más liviana que `QuakeCard`: la lista global llega a ~144
 * eventos y una tarjeta completa por fila la volvería pesada de leer y de
 * renderizar. La tarjeta completa se reserva para el detalle.
 *
 * El color del cuadro de magnitud usa la misma escala que la tarjeta, así que
 * un M6 se ve igual en la lista y en el detalle.
 */
export function QuakeRow({
  quake,
  onPress,
  blurred = false,
}: {
  quake: QuakeEvent;
  onPress?: () => void;
  /** Vista previa bloqueada: se ofusca el contenido, no se puede tocar. */
  blurred?: boolean;
}) {
  const { colors, status } = useTheme();
  const palette = status[magnitudeSeverity(quake.magnitude)];

  return (
    <Pressable
      onPress={onPress}
      disabled={blurred || !onPress}
      accessibilityRole="button"
      accessibilityLabel={
        blurred
          ? 'Contenido premium bloqueado'
          : `Sismo de magnitud ${formatMagnitude(quake.magnitude)} en ${shortPlace(quake)}, ${elapsedShort(quake.occurredAt)}`
      }
      style={({ pressed }) => [
        styles.row,
        pressed ? { backgroundColor: colors.surfaceSunken } : null,
      ]}>
      <View style={[styles.magnitude, { backgroundColor: palette.base }]}>
        <Text variant="headline" style={styles.magnitudeValue}>
          {blurred ? '•,•' : formatMagnitude(quake.magnitude)}
        </Text>
      </View>

      <View style={styles.copy}>
        <Text variant="callout" weight="500" numberOfLines={1}>
          {blurred ? '••••••••••••••••' : shortPlace(quake)}
        </Text>
        <View style={styles.meta}>
          <Text variant="caption" tone="tertiary">
            {blurred ? '••••••' : elapsedShort(quake.occurredAt)}
          </Text>
          {!blurred && quake.depthKm != null ? (
            <>
              <Text variant="caption" tone="tertiary">
                ·
              </Text>
              <Text variant="caption" tone="tertiary">
                {Math.round(quake.depthKm)} km
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {blurred ? (
        <MaterialIcons name="lock" size={18} color={colors.textTertiary} />
      ) : (
        <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  magnitude: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 44,
    justifyContent: 'center',
    width: 48,
  },
  magnitudeValue: { color: '#FFFFFF', fontWeight: '700' },
  copy: { flex: 1, gap: 2 },
  meta: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs },
});
