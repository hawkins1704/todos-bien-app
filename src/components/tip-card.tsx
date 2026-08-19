import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { Tip } from '@/types/domain';

export type TipCardProps = {
  tip: Tip;
  /**
   * 'compact' para modo alerta (una línea, sin robar espacio al banner).
   * 'expanded' para la Home en calma: mini artículo (spec §5.2 y §11).
   */
  variant?: 'compact' | 'expanded';
  onNext?: () => void;
};

export function TipCard({ tip, variant = 'compact', onNext }: TipCardProps) {
  const { colors } = useTheme();
  const expanded = variant === 'expanded';

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <MaterialIcons name="lightbulb" size={14} color={colors.accent} />
          <Text variant="caption" weight="600" tone="accent">
            {PHASE_LABEL[tip.phase]}
          </Text>
        </View>

        {onNext ? (
          <Pressable
            onPress={onNext}
            accessibilityRole="button"
            accessibilityLabel="Ver otro tip"
            hitSlop={10}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <MaterialIcons name="refresh" size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <Text variant={expanded ? 'title3' : 'headline'} style={styles.title}>
        {tip.title}
      </Text>

      <Text variant={expanded ? 'callout' : 'subhead'} tone="secondary">
        {expanded ? (tip.longBody ?? tip.body) : tip.body}
      </Text>

      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync(tip.sourceUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Abrir la fuente: ${tip.sourceName}`}
        style={({ pressed }) => [styles.source, pressed ? styles.pressed : null]}>
        <Text variant="footnote" tone="accent" weight="600">
          Fuente: {tip.sourceName}
        </Text>
        <MaterialIcons name="open-in-new" size={13} color={colors.accent} />
      </Pressable>
    </Card>
  );
}

const PHASE_LABEL: Record<Tip['phase'], string> = {
  antes: 'Prepararse antes',
  durante: 'Durante el sismo',
  despues: 'Después del sismo',
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  badge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  title: { marginBottom: Spacing.xs },
  source: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  pressed: { opacity: 0.6 },
});
