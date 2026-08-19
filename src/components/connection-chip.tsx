import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type ConnectionChipProps = {
  online: boolean;
  pendingWrites?: number;
  lastSync?: string | null;
};

/**
 * Spec §16.1: el usuario tiene que saber siempre si lo que ve está en vivo o
 * es la última copia guardada. Visible en la Home en ambos estados.
 */
export function ConnectionChip({ online, pendingWrites = 0 }: ConnectionChipProps) {
  const { colors, status } = useTheme();

  const tone = online ? status.safe : status.unconfirmed;
  const label = online ? 'Con conexión' : 'Sin conexión · mostrando datos guardados';

  return (
    <View style={[styles.chip, { backgroundColor: tone.soft }]}>
      <MaterialIcons
        name={online ? 'cloud-done' : 'cloud-off'}
        size={14}
        color={tone.strong}
      />
      <Text variant="caption" weight="600" style={{ color: tone.strong }}>
        {label}
      </Text>
      {pendingWrites > 0 ? (
        <View style={[styles.pending, { backgroundColor: colors.accentSoft }]}>
          <MaterialIcons name="schedule" size={12} color={colors.accent} />
          <Text variant="caption" weight="600" style={{ color: colors.accent }}>
            {pendingWrites} por enviar
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs + 1,
  },
  pending: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: 3,
    marginLeft: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
});
