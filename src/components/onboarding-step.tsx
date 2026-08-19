import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export const ONBOARDING_STEPS = 4;

export function OnboardingStep({
  step,
  title,
  subtitle,
}: {
  step: number;
  title: string;
  subtitle?: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrapper}>
      <View style={styles.bars}>
        {Array.from({ length: ONBOARDING_STEPS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.bar,
              { backgroundColor: i < step ? colors.accent : colors.border },
            ]}
          />
        ))}
      </View>

      <Text variant="caption" tone="tertiary" weight="600">
        PASO {step} DE {ONBOARDING_STEPS}
      </Text>
      <Text variant="title">{title}</Text>
      {subtitle ? (
        <Text variant="body" tone="secondary">
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.xs },
  bars: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  bar: { borderRadius: Radius.pill, flex: 1, height: 4 },
});
