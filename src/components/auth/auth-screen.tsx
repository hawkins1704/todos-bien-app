import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type AuthScreenProps = {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
};

/**
 * Marco común de las pantallas de acceso: safe area, teclado que no tapa el
 * campo enfocado y el mismo encabezado en las cinco. Se extrajo al pasar de una
 * sola pantalla de código a cinco (entrar, crear cuenta, confirmar, olvidé,
 * nueva contraseña): repetir el KeyboardAvoidingView cinco veces garantizaba
 * que tarde o temprano una quedara con el teclado encima del botón.
 */
export function AuthScreen({ icon, title, subtitle, children }: AuthScreenProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen tone="plain">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.iconWell, { backgroundColor: colors.accentSoft }]}>
            <MaterialIcons name={icon} size={32} color={colors.accent} />
          </View>

          <Text variant="title">{title}</Text>
          {typeof subtitle === 'string' ? (
            <Text variant="body" tone="secondary">
              {subtitle}
            </Text>
          ) : (
            subtitle
          )}

          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.md, paddingHorizontal: Spacing.xl },
  iconWell: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 60,
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    width: 60,
  },
});
