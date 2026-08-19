import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { ActionPlanEditor } from '@/features/action-plan/action-plan-editor';
import { updateMyProfile } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { syncMe } from '@/lib/sync';
import { Spacing } from '@/theme/tokens';

export default function ActionPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { myProfile, refresh } = useAppData();

  const [plan, setPlan] = useState('');
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sembrar el input con el plan guardado se hace durante el render, no en un
  // efecto: es el patrón que React recomienda para ajustar estado cuando llega
  // un dato nuevo, y evita el render extra con el campo vacío.
  if (myProfile && myProfile.id !== loadedFrom) {
    setLoadedFrom(myProfile.id);
    setPlan(myProfile.actionPlan ?? '');
  }

  const changed = plan.trim() !== (myProfile?.actionPlan ?? '').trim();

  const save = async () => {
    if (!userId || saving) return;
    setSaving(true);
    setError(null);
    try {
      await updateMyProfile(userId, { actionPlan: plan.trim() || null });
      await syncMe(userId);
      await refresh();
      router.back();
    } catch {
      setError('No pudimos guardar. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Plan de acción' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          <Text variant="body" tone="secondary">
            Qué vas a hacer si tiembla. Lo ven tus contactos cuando tocan tu foto, junto con tu
            última ubicación.
          </Text>

          {myProfile?.actionPlanUpdatedAt ? (
            <Text variant="caption" tone="tertiary">
              Actualizado {timeAgo(myProfile.actionPlanUpdatedAt)}
            </Text>
          ) : null}

          <ActionPlanEditor value={plan} onChange={setPlan} />

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Guardar"
            onPress={() => void save()}
            disabled={!changed}
            loading={saving}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
});
