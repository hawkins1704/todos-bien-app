import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import {
  MANUAL_STATUSES,
  Radius,
  Spacing,
  StatusIcons,
  StatusLabels,
  type StatusKey,
} from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type StatusPickerProps = {
  value: StatusKey | null;
  onChange: (status: StatusKey) => void;
  disabled?: boolean;
};

/**
 * Selector de "Mi estado" con los 3 estados manuales de la spec §4.
 * `unconfirmed` no aparece: es el default del sistema, no una opción.
 */
export function StatusPicker({ value, onChange, disabled = false }: StatusPickerProps) {
  const { colors, status: statusColors } = useTheme();

  return (
    <View style={styles.row}>
      {MANUAL_STATUSES.map((status) => {
        const tone = statusColors[status];
        const selected = value === status;

        return (
          <Pressable
            key={status}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={StatusLabels[status]}
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onChange(status);
            }}
            style={({ pressed }) => [
              styles.option,
              {
                backgroundColor: selected ? tone.soft : colors.surface,
                borderColor: selected ? tone.base : colors.border,
                borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
              },
              pressed ? styles.pressed : null,
              disabled ? styles.disabled : null,
            ]}>
            <View style={[styles.iconWell, { backgroundColor: tone.base }]}>
              <MaterialIcons
                name={StatusIcons[status].mi as keyof typeof MaterialIcons.glyphMap}
                size={22}
                color="#FFFFFF"
              />
            </View>
            <Text
              variant="footnote"
              weight={selected ? '600' : '400'}
              center
              style={{ color: selected ? tone.strong : colors.text }}>
              {StatusLabels[status]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  option: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    flex: 1,
    gap: Spacing.sm,
    justifyContent: 'flex-start',
    minHeight: 108,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  iconWell: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: { opacity: 0.8 },
  disabled: { opacity: 0.5 },
});
