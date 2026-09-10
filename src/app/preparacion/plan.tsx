import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModuloBloqueado } from '@/components/centro-bloqueado';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { fetchHouseholdPlan, fetchPreparedness, saveHouseholdPlan } from '@/lib/api';
import { esRechazoDeModeracion } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const MAX_PUNTO = 200;
const MAX_CUERPO = 1000;

/**
 * El plan del hogar: dónde se encuentran y qué hace cada quien.
 *
 * ## Dos cosas que lo distinguen del plan personal
 *
 * 1. **Lo edita cualquier integrante**, no solo el dueño. Un plan que solo puede
 *    tocar una persona no es de la casa. Es una excepción deliberada al «manda
 *    el dueño» de los grupos (0034), y vale solo para esta fila.
 * 2. **No viaja a tus contactos.** Vive en `action_plans` con `group_id`, y
 *    `get_circle()` excluye esas filas: el punto de encuentro de tu casa no
 *    llega a la caché de gente que no vive ahí.
 *
 * El punto de encuentro es una columna aparte y no una frase adentro del cuerpo
 * porque el progreso necesita saber si existe. Sigue siendo **texto libre**: el
 * selector en mapa está descartado por decisión, no pospuesto (ESTADO §1.2.2).
 */
export default function PlanDelHogarScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAuth();

  const [hogar, setHogar] = useState<{ id: string; premium: boolean } | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [punto, setPunto] = useState('');
  const [cuerpo, setCuerpo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sucio, setSucio] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const p = await fetchPreparedness();
      if (!p) return;
      setHogar({ id: p.householdId, premium: p.premium });

      const plan = await fetchHouseholdPlan(p.householdId);
      // No se pisa lo que la persona está escribiendo si vuelve a enfocar.
      if (plan && !sucio) {
        setPlanId(plan.id);
        setPunto(plan.meetingPoint ?? '');
        setCuerpo(plan.body);
      }
    } catch (caught) {
      if (__DEV__) console.warn('[plan del hogar] no se pudo cargar', caught);
    } finally {
      setCargando(false);
    }
  }, [sucio]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const puedeEditar = hogar?.premium ?? false;

  const guardar = useCallback(async () => {
    if (!hogar || !userId) return;
    setGuardando(true);
    try {
      await saveHouseholdPlan(
        hogar.id,
        userId,
        { name: 'Plan del hogar', meetingPoint: punto, body: cuerpo },
        planId,
      );
      setSucio(false);
      await cargar();
      Alert.alert('Guardado', 'Tu casa ya puede verlo.');
    } catch (caught) {
      // El filtro de contenido rechaza con 23514 y `hint = 'moderacion'`. Se
      // distingue del resto para poder decir POR QUÉ, y no «error al guardar».
      if (esRechazoDeModeracion(caught)) {
        Alert.alert(
          'No podemos publicar eso',
          'Los términos no permiten insultos, discriminación ni amenazas. Reescríbelo y vuelve a intentar.',
        );
      } else {
        if (__DEV__) console.warn('[plan del hogar] no se pudo guardar', caught);
        Alert.alert('No se pudo guardar', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setGuardando(false);
    }
  }, [cargar, cuerpo, hogar, planId, punto, userId]);

  if (cargando) return <Screen />;

  if (!hogar) {
    return (
      <Screen>
        <View style={styles.vacio}>
          <Text variant="callout" center>
            Primero arma tu hogar en el Centro de Preparación.
          </Text>
        </View>
      </Screen>
    );
  }

  // Con el Premium vencido no se muestra el plan. En uso normal no se llega acá
  // —el Centro está velado y no ofrece la tarjeta— pero sí por la pila de
  // navegación, si vence estando dentro.
  if (!hogar.premium) {
    return (
      <Screen>
        <ModuloBloqueado />
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}
          keyboardShouldPersistTaps="handled">
          <Card>
            <Text variant="headline">¿Dónde se encuentran?</Text>
            <Text variant="footnote" tone="secondary" style={styles.ayuda}>
              Un sitio afuera, que todos conozcan y al que se pueda llegar caminando. Si tu casa
              queda inaccesible, es donde se buscan.
            </Text>
            <TextInput
              value={punto}
              onChangeText={(t) => {
                setPunto(t);
                setSucio(true);
              }}
              editable={puedeEditar}
              placeholder="La puerta del parque, en la esquina de la avenida"
              placeholderTextColor={colors.textTertiary}
              maxLength={MAX_PUNTO}
              multiline
              style={[
                styles.entrada,
                { backgroundColor: colors.surfaceSunken, borderColor: colors.border, color: colors.text },
              ]}
            />
          </Card>

          <Card>
            <Text variant="headline">El resto del plan</Text>
            <Text variant="footnote" tone="secondary" style={styles.ayuda}>
              Quién recoge a quién, a quién se llama fuera de la ciudad, qué se cierra antes de
              salir. Lo ve toda tu casa.
            </Text>
            <TextInput
              value={cuerpo}
              onChangeText={(t) => {
                setCuerpo(t);
                setSucio(true);
              }}
              editable={puedeEditar}
              placeholder={'Cortar el gas y el agua antes de salir.\nLlamar a la tía Carmen en Arequipa.'}
              placeholderTextColor={colors.textTertiary}
              maxLength={MAX_CUERPO}
              multiline
              style={[
                styles.entrada,
                styles.alto,
                { backgroundColor: colors.surfaceSunken, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Text variant="caption" tone="tertiary">
              {cuerpo.length} / {MAX_CUERPO}
            </Text>
          </Card>

          {puedeEditar ? (
            <Button
              title="Guardar"
              size="lg"
              loading={guardando}
              disabled={!sucio}
              onPress={() => void guardar()}
            />
          ) : (
            <Card tone="sunken">
              <Text variant="footnote" tone="secondary">
                Tu hogar no tiene Premium: pueden leer el plan, pero no cambiarlo.
              </Text>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alto: { minHeight: 140 },
  ayuda: { marginBottom: Spacing.md, marginTop: Spacing.xs },
  content: { gap: Spacing.md, padding: Spacing.lg },
  entrada: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 64,
    padding: Spacing.md,
    textAlignVertical: 'top',
  },
  vacio: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
});
