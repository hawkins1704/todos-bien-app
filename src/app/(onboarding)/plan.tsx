import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { ActionPlanEditor } from '@/features/action-plan/action-plan-editor';
import { createActionPlan } from '@/lib/api';
import { syncMe } from '@/lib/sync';
import { Spacing } from '@/theme/tokens';

export default function OnboardingPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [plan, setPlan] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setError(null);
    try {
      // Se escribe en `action_plans` (0024), NO en `profiles.action_plan`: esa
      // columna quedó como espejo de solo lectura, y escribirla directo dejaría
      // el plan del alta invisible en la lista y en el círculo.
      //
      // Acá no se pide nombre a propósito. Es el paso 4 del alta y pedir dos
      // campos para algo que la mayoría va a tener uno solo agrega fricción
      // donde más se abandona. El nombre se edita después, si suma un segundo.
      if (plan.trim()) {
        await createActionPlan(userId, { name: 'Mi plan', body: plan, sortOrder: 0 });
      }
      await syncMe(userId);
      router.push('/ready');
    } catch {
      setError('No pudimos guardar tu plan. Revisa tu conexión.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <OnboardingStep
            step={4}
            title="¿Qué vas a hacer si tiembla?"
            subtitle="Escríbelo ahora, con calma. En el momento nadie improvisa bien."
          />

          <ActionPlanEditor value={plan} onChange={setPlan} />

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title={plan.trim() ? 'Guardar y continuar' : 'Saltar por ahora'}
            onPress={() => void submit()}
            loading={saving}
            variant={plan.trim() ? 'primary' : 'secondary'}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
});
