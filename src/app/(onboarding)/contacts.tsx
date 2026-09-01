import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { ContactMatcher } from '@/features/contacts/contact-matcher';
import { Spacing } from '@/theme/tokens';

export default function OnboardingContactsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { circle } = useAppData();

  // Spec §10: hay que agregar al menos un contacto. Una solicitud pendiente
  // cuenta: la app no puede quedarse trabada esperando que el otro acepte.
  const hasAtLeastOne = circle.length > 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}>
        <OnboardingStep
          step={3}
          title="Arma tu red"
          subtitle="Cada persona arma el suyo por separado. Agregar a alguien no comparte tus otros contactos con esa persona."
        />

        <ContactMatcher />

        <Button
          title={hasAtLeastOne ? 'Continuar' : 'Continuar sin agregar a nadie'}
          onPress={() => router.push('/plan')}
          variant={hasAtLeastOne ? 'primary' : 'secondary'}
          size="lg"
        />

        {hasAtLeastOne ? null : (
          <Text variant="caption" tone="tertiary" center>
            Puedes hacerlo después, pero la app no te sirve de mucho hasta que haya alguien más.
          </Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
});
