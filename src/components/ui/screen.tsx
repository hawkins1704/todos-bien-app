import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/use-theme';

export type ScreenProps = ViewProps & {
  /** Aplica el safe area de arriba. Apágalo en pantallas con header nativo. */
  topInset?: boolean;
  tone?: 'grouped' | 'plain';
};

export function Screen({ topInset = false, tone = 'grouped', style, ...rest }: ScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: tone === 'grouped' ? colors.backgroundGrouped : colors.background },
        topInset ? { paddingTop: insets.top } : null,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
});
