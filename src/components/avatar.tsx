import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { initialsOf } from '@/lib/format';
import { StatusIcons, StatusLabels, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type AvatarProps = {
  displayName: string;
  avatarUrl?: string | null;
  size?: number;
  /**
   * Estado que pinta el anillo, estilo "historias". Si es null no se dibuja
   * anillo (útil para solicitudes pendientes, que todavía no reportan estado).
   */
  status?: StatusKey | null;
  /** Badge con el ícono del estado. Es lo que hace la app usable con daltonismo. */
  showStatusBadge?: boolean;
  dimmed?: boolean;
};

export function Avatar({
  displayName,
  avatarUrl,
  size = 64,
  status = null,
  showStatusBadge = true,
  dimmed = false,
}: AvatarProps) {
  const { colors, status: statusColors } = useTheme();

  const ringWidth = Math.max(2, Math.round(size * 0.045));
  const gap = ringWidth;
  const outer = size + (ringWidth + gap) * 2;
  const badgeSize = Math.max(18, Math.round(size * 0.34));
  const initialsSize = Math.round(size * 0.36);

  const ringColor = status ? statusColors[status].base : 'transparent';

  return (
    <View
      style={[styles.wrapper, { height: outer, width: outer }, dimmed ? styles.dimmed : null]}
      accessible
      accessibilityLabel={
        status ? `${displayName}. ${StatusLabels[status]}` : displayName
      }>
      <View
        style={[
          styles.ring,
          {
            borderColor: ringColor,
            borderRadius: outer / 2,
            borderWidth: ringWidth,
            height: outer,
            width: outer,
          },
        ]}
      />

      {avatarUrl ? (
        <Image
          source={{ uri: avatarUrl }}
          style={{ borderRadius: size / 2, height: size, width: size }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View
          style={[
            styles.fallback,
            {
              backgroundColor: colors.accent,
              borderRadius: size / 2,
              height: size,
              width: size,
            },
          ]}>
          {/* `lineHeight` va junto al `fontSize`, no puede quedar el del
              variant: `headline` fija 22px y a partir de avatares grandes la
              letra (0.36 × size) no entra en esa caja y se corta por abajo. */}
          <Text
            variant="headline"
            style={{
              color: colors.accentText,
              fontSize: initialsSize,
              lineHeight: Math.round(initialsSize * 1.2),
            }}>
            {initialsOf(displayName)}
          </Text>
        </View>
      )}

      {status && showStatusBadge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: statusColors[status].base,
              borderColor: colors.background,
              borderRadius: badgeSize / 2,
              height: badgeSize,
              width: badgeSize,
            },
          ]}>
          <MaterialIcons
            name={StatusIcons[status].mi as keyof typeof MaterialIcons.glyphMap}
            size={badgeSize * 0.68}
            color="#FFFFFF"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.55 },
  ring: { position: 'absolute' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    alignItems: 'center',
    borderWidth: 2,
    bottom: 0,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
  },
});
