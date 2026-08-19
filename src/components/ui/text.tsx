import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { Type } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Variant = keyof typeof Type;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'accent' | 'danger' | 'inverse';

export type TextProps = RNTextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: TextStyle['fontWeight'];
  center?: boolean;
};

export function Text({
  variant = 'body',
  tone = 'primary',
  weight,
  center,
  style,
  ...rest
}: TextProps) {
  const { colors } = useTheme();

  const color = {
    primary: colors.text,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    accent: colors.accent,
    danger: colors.danger,
    inverse: colors.accentText,
  }[tone];

  return (
    <RNText
      style={[
        Type[variant] as TextStyle,
        { color },
        weight ? { fontWeight: weight } : null,
        center ? { textAlign: 'center' } : null,
        style,
      ]}
      {...rest}
    />
  );
}
