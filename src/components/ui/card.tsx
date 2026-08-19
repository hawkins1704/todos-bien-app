import { StyleSheet, View, type ViewProps } from 'react-native';

import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type CardProps = ViewProps & {
  padded?: boolean;
  tone?: 'surface' | 'sunken';
};

export function Card({ padded = true, tone = 'surface', style, ...rest }: CardProps) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: tone === 'surface' ? colors.surface : colors.surfaceSunken,
          borderColor: colors.border,
        },
        padded ? styles.padded : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  padded: { padding: Spacing.lg },
});
