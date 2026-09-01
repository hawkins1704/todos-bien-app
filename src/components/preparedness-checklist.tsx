import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { timeAgo } from '@/lib/format';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { FREE_DRILL_LIMIT } from '@/types/domain';

export type PreparednessChecklistProps = {
  actionPlan: string | null;
  actionPlanUpdatedAt: string | null;
  circleSize: number;
  drillsCompleted: number;
};

type Item = {
  key: string;
  label: string;
  detail: string;
  done: boolean;
  href: '/action-plan' | '/circle' | '/drill';
};

/**
 * Spec §5.2: checklist de preparación, NO gamificación. Nada de puntos, rachas
 * ni insignias: el público es adulto y preventivo y ese lenguaje no encaja.
 */
export function PreparednessChecklist({
  actionPlan,
  actionPlanUpdatedAt,
  circleSize,
  drillsCompleted,
}: PreparednessChecklistProps) {
  const { colors, status } = useTheme();
  const router = useRouter();

  const items: Item[] = [
    {
      key: 'plan',
      label: 'Plan de acción',
      detail: actionPlan
        ? `Actualizado ${timeAgo(actionPlanUpdatedAt)}`
        : 'Todavía sin escribir',
      done: Boolean(actionPlan?.trim()),
      href: '/action-plan',
    },
    {
      key: 'circle',
      label: 'Tu red',
      detail:
        circleSize === 0
          ? 'Sin contactos todavía'
          : `${circleSize} ${circleSize === 1 ? 'persona' : 'personas'}`,
      done: circleSize > 0,
      href: '/circle',
    },
    {
      key: 'simulacros',
      label: 'Simulacros',
      // El ítem se marca listo recién con los 3 hechos, no con el primero: con
      // uno solo la persona vio el flujo una vez, que no es lo mismo que
      // tenerlo practicado. Además así el check verde no aparece mientras la
      // fila todavía dice "1 de 3".
      detail:
        drillsCompleted >= FREE_DRILL_LIMIT
          ? `${drillsCompleted} completados`
          : `${drillsCompleted} de ${FREE_DRILL_LIMIT} completados`,
      done: drillsCompleted >= FREE_DRILL_LIMIT,
      href: '/drill',
    },
  ];

  return (
    <Card padded={false}>
      <View style={styles.header}>
        <Text variant="headline">Estado de preparación</Text>
      </View>

      {items.map((item, index) => {
        const tone = item.done ? status.safe : status.unconfirmed;

        return (
          <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`${item.label}. ${item.detail}`}
              onPress={() => router.push(item.href)}
              style={({ pressed }) => [
                styles.row,
                index > 0 ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
                pressed ? { backgroundColor: colors.surfaceSunken } : null,
              ]}>
              <View style={[styles.icon, { backgroundColor: tone.soft }]}>
                <MaterialIcons
                  name={item.done ? 'check-circle' : 'radio-button-unchecked'}
                  size={20}
                  color={tone.strong}
                />
              </View>

              <View style={styles.copy}>
                <Text variant="callout" weight="500">
                  {item.label}
                </Text>
                <Text variant="footnote" tone="secondary">
                  {item.detail}
                </Text>
              </View>

              <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, gap: 1 },
});
