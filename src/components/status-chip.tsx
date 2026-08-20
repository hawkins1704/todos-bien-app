import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import {
  Radius,
  Spacing,
  StatusIcons,
  StatusLabels,
  StatusLabelsShort,
  type StatusKey,
} from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type StatusChipProps = {
  status: StatusKey;
  short?: boolean;
  size?: 'sm' | 'md';
};

export function StatusChip({ status, short = false, size = 'md' }: StatusChipProps) {
  const { status: statusColors } = useTheme();
  const tone = statusColors[status];
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <View
      style={[
        styles.chip,
        size === 'sm' ? styles.sm : styles.md,
        { backgroundColor: tone.soft },
      ]}>
      <MaterialIcons
        name={StatusIcons[status].mi as keyof typeof MaterialIcons.glyphMap}
        size={iconSize}
        color={tone.strong}
      />
      <Text
        variant={size === 'sm' ? 'caption' : 'footnote'}
        weight="600"
        style={{ color: tone.strong }}>
        {short ? StatusLabelsShort[status] : StatusLabels[status]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    // Sin `alignSelf`: la alineación la decide quien lo usa. Cuando estaba fijo
    // en 'flex-start' el chip se iba a la izquierda dentro del detalle de un
    // contacto, que centra todo lo demás, y no había forma de corregirlo desde
    // afuera. Los dos lugares donde se usa ya centran con `alignItems`.
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  sm: { paddingHorizontal: Spacing.sm, paddingVertical: 3 },
  md: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs + 1 },
});
