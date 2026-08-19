import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

export type ButtonProps = Omit<PressableProps, 'style'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: keyof typeof MaterialIcons.glyphMap;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = true,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const { colors } = useTheme();
  const isDisabled = disabled || loading;

  const surface: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: colors.accent },
    secondary: { backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.border },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: colors.danger },
  };

  const contentColor = {
    primary: colors.accentText,
    secondary: colors.text,
    ghost: colors.accent,
    danger: '#FFFFFF',
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(isDisabled), busy: loading }}
      disabled={isDisabled}
      onPress={(event) => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      style={({ pressed }) => [
        styles.base,
        size === 'lg' ? styles.lg : styles.md,
        surface[variant],
        fullWidth ? styles.fullWidth : null,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={contentColor} />
      ) : (
        <View style={styles.content}>
          {icon ? <MaterialIcons name={icon} size={20} color={contentColor} /> : null}
          <Text variant="headline" style={{ color: contentColor }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    justifyContent: 'center',
  },
  md: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  lg: { paddingHorizontal: Spacing.xl, paddingVertical: Spacing.lg },
  fullWidth: { alignSelf: 'stretch' },
  content: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.4 },
});
