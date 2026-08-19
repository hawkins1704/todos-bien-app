import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { timeAgo } from '@/lib/format';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Spec §5.2: sin alerta activa no se repite la lógica de "confirmar estado".
 * En su lugar, una barra tranquila que transmite que la app sigue monitoreando.
 */
export function CalmBanner({ lastCheck }: { lastCheck: string | null }) {
  const { status } = useTheme();
  const tone = status.safe;

  return (
    <View style={[styles.banner, { backgroundColor: tone.soft }]}>
      <MaterialIcons name="shield" size={20} color={tone.strong} />
      <View style={styles.copy}>
        <Text variant="subhead" weight="600" style={{ color: tone.strong }}>
          Sin alertas activas
        </Text>
        <Text variant="footnote" style={{ color: tone.strong }}>
          {lastCheck ? `Fuentes verificadas ${timeAgo(lastCheck)}` : 'Esperando primera verificación'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  copy: { flex: 1, gap: 1 },
});
