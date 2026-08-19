import { Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { ContactMatcher } from '@/features/contacts/contact-matcher';
import { Spacing } from '@/theme/tokens';

/**
 * Mismo flujo que el paso de contactos del onboarding (spec §3: "usar en
 * onboarding y también desde la pantalla principal, mismo flujo en ambos
 * casos"), por eso comparte el componente en vez de duplicarlo.
 */
export default function AddContactsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Agregar contactos' }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Text variant="body" tone="secondary">
          Las conexiones son de a dos y no se contagian: agregar a alguien no le muestra el resto
          de tus contactos.
        </Text>

        <ContactMatcher />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
});
