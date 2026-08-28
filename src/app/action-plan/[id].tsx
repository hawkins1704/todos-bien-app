import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { ActionPlanEditor } from '@/features/action-plan/action-plan-editor';
import {
  ActionPlanLimitError,
  createActionPlan,
  fetchMyActionPlans,
  updateActionPlan,
} from '@/lib/api';
import { syncMe } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const NAME_MAX = 40;

/** Nombres sugeridos. Son los cortes reales del día, no categorías inventadas. */
const SUGERENCIAS = ['En casa', 'En el trabajo', 'Con los chicos', 'De noche', 'De viaje'];

export default function ActionPlanEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { refresh } = useAppData();
  const { id } = useLocalSearchParams<{ id: string }>();

  const esNuevo = id === 'nuevo';

  const [name, setName] = useState('');
  const [body, setBody] = useState('');
  const [cargado, setCargado] = useState(esNuevo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    if (esNuevo || !userId) return;
    try {
      const plan = (await fetchMyActionPlans(userId)).find((p) => p.id === id);
      if (plan) {
        setName(plan.name);
        setBody(plan.body);
      }
    } catch {
      setError('No pudimos cargar el plan. Revisa tu conexión.');
    } finally {
      setCargado(true);
    }
  }, [esNuevo, id, userId]);

  useEffect(() => {
    // Mismo caso que la lista: `cargar()` empieza por la red, así que el
    // setState cae en un microtask posterior, no en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  const completo = name.trim().length > 0 && body.trim().length > 0;

  const guardar = async () => {
    if (!userId || saving || !completo) return;
    setSaving(true);
    setError(null);
    try {
      if (esNuevo) {
        // `sort_order` por posición actual: los planes se muestran en el orden
        // en que se crearon, que es el que la persona tiene en la cabeza.
        const actuales = await fetchMyActionPlans(userId);
        await createActionPlan(userId, { name, body, sortOrder: actuales.length });
      } else {
        await updateActionPlan(id, { name, body });
      }

      // `syncMe` y no `syncCircle`: los planes propios NO viajan en
      // `get_circle` —esa función devuelve a los contactos, no a uno mismo—,
      // así que refrescar el círculo acá no actualiza nada de lo que cambió.
      //
      // Lo que sí hay que releer es el perfil: el disparador de 0024 copia el
      // primer plan a `profiles.action_plan`, y de ahí sale el aviso de la Home
      // «Todavía no escribiste tu plan de acción». Sin esto, ese aviso seguía
      // en pantalla después de escribir el primero.
      await syncMe(userId);
      await refresh();
      router.back();
    } catch (caught) {
      setError(
        caught instanceof ActionPlanLimitError
          ? 'Llegaste al máximo de planes de tu plan actual.'
          : 'No pudimos guardar. Revisa tu conexión e intenta de nuevo.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: esNuevo ? 'Nuevo plan' : 'Editar plan' }} />

      <KeyboardAvoider style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          <Text variant="footnote" tone="secondary" weight="600">
            ¿Cuándo aplica este plan?
          </Text>

          <TextInput
            value={name}
            onChangeText={(text) => setName(text.slice(0, NAME_MAX))}
            placeholder="Ej: En el trabajo"
            placeholderTextColor={colors.textTertiary}
            accessibilityLabel="Nombre del plan"
            style={[
              styles.nameInput,
              { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text },
            ]}
          />

          {/* El nombre es lo que hace legible una lista de varios planes: es lo
              que tu contacto lee para saber cuál le sirve a esta hora. */}
          <Text variant="caption" tone="tertiary">
            Así lo van a ver tus contactos, para saber cuál aplica en cada momento.
          </Text>

          {esNuevo && !name ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
              {SUGERENCIAS.map((sugerencia) => (
                <Text
                  key={sugerencia}
                  variant="footnote"
                  tone="accent"
                  onPress={() => setName(sugerencia)}
                  style={[styles.chip, { borderColor: colors.border }]}>
                  {sugerencia}
                </Text>
              ))}
            </ScrollView>
          ) : null}

          {cargado ? <ActionPlanEditor value={body} onChange={setBody} /> : null}

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Guardar"
            onPress={() => void guardar()}
            disabled={!completo}
            loading={saving}
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  nameInput: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: 17,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  chipsRow: { flexGrow: 0 },
  chip: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    marginRight: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
});
