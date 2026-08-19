import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Text } from '@/components/ui/text';
import { effectiveStatus } from '@/lib/quakes';
import { Radius, Spacing, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { CircleMember } from '@/types/domain';

export type CircleGridProps = {
  members: CircleMember[];
  /** Cuando hay alerta activa, el estado se calcula respecto de ESE sismo. */
  activeQuakeId: string | null;
  /** En modo tranquilo no se muestran anillos de urgencia (spec §5.2). */
  showStatus: boolean;
};

export function CircleGrid({ members, activeQuakeId, showStatus }: CircleGridProps) {
  const { colors } = useTheme();
  const router = useRouter();

  if (members.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <MaterialIcons name="group-add" size={28} color={colors.textTertiary} />
        <Text variant="callout" tone="secondary" center>
          Tu círculo está vacío
        </Text>
        <Text variant="footnote" tone="tertiary" center>
          La app solo sirve si las personas que te importan también están acá.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-contacts')}
          style={({ pressed }) => [
            styles.emptyAction,
            { backgroundColor: colors.accentSoft },
            pressed ? styles.pressed : null,
          ]}>
          <Text variant="footnote" weight="600" tone="accent">
            Agregar contactos
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.grid}>
      {members.map((member) => {
        const status = showStatus
          ? (effectiveStatus(member, activeQuakeId) as StatusKey)
          : null;

        return (
          <Pressable
            key={member.userId}
            accessibilityRole="button"
            onPress={() => router.push(`/contact/${member.userId}`)}
            style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}>
            <Avatar
              displayName={member.displayName}
              avatarUrl={member.avatarUrl}
              size={62}
              status={status}
              showStatusBadge={showStatus}
            />
            <Text variant="caption" center numberOfLines={1} style={styles.name}>
              {firstName(member.displayName)}
            </Text>
            {member.isDrill && showStatus ? (
              <Text variant="caption" tone="accent" weight="600">
                simulacro
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, rowGap: Spacing.md },
  item: { alignItems: 'center', gap: 2, width: 84 },
  name: { maxWidth: 80 },
  pressed: { opacity: 0.65 },
  empty: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  emptyAction: {
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
