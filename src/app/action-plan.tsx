import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { usePaywall } from '@/hooks/use-paywall';
import { deleteActionPlan, fetchMyActionPlans } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { syncMe } from '@/lib/sync';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import {
  FREE_ACTION_PLAN_LIMIT,
  PREMIUM_ACTION_PLAN_LIMIT,
  type ActionPlan,
} from '@/types/domain';

/**
 * Lista de planes de acción (migración 0024).
 *
 * **Por qué el botón de agregar se ve siempre**, incluso con el tope alcanzado:
 * una función que no se ve no la compra nadie. Es el mismo patrón que la pestaña
 * Global de Noticias, que se muestra con candado en vez de esconderse, y que el
 * «Nuevo grupo» de Mi red. Al tocarlo con el tope lleno se abre el paywall,
 * que es donde la explicación tiene sentido: la persona ya intentó hacer algo.
 *
 * El tope lo hace cumplir el servidor. Lo de acá es la explicación, no el
 * candado: si esta pantalla se equivoca, el INSERT falla igual.
 */
export default function ActionPlanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { mySettings, refresh } = useAppData();
  const { abrirPaywall, abriendo, disponible } = usePaywall();

  const [plans, setPlans] = useState<ActionPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);

  const isPremium = mySettings?.isPremium ?? false;
  const tope = isPremium ? PREMIUM_ACTION_PLAN_LIMIT : FREE_ACTION_PLAN_LIMIT;
  const puedeAgregar = plans !== null && plans.length < tope;

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      setPlans(await fetchMyActionPlans(userId));
    } catch {
      setError('No pudimos cargar tus planes. Revisa tu conexión.');
    }
  }, [userId]);

  // `useFocusEffect` y no `useEffect`: al volver del editor la pantalla se
  // vuelve a enfocar pero no se remonta, así que un efecto con dependencias
  // estables no corre de nuevo y la lista se queda con lo de antes — el plan
  // recién creado no aparecía hasta cerrar y reabrir la pantalla entera.
  //
  // Mismo patrón que Chats y Noticias.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  /**
   * Lo que pasa al tocar «Agregar un plan» con el tope alcanzado. Mismo criterio
   * que en Mi red: con Premium el tope es el tope y hay que decirlo; sin Premium
   * se abre el paywall, y si la compra sale bien se entra directo al editor,
   * que es lo que la persona estaba intentando hacer.
   */
  const ofrecerPremium = async () => {
    if (isPremium) {
      Alert.alert(
        `Llegaste a ${PREMIUM_ACTION_PLAN_LIMIT} planes`,
        'Es el máximo. Borra uno que ya no uses para poder agregar otro.',
      );
      return;
    }

    if (!disponible) {
      Alert.alert(
        `Tu plan permite ${FREE_ACTION_PLAN_LIMIT} ${FREE_ACTION_PLAN_LIMIT === 1 ? 'plan' : 'planes'}`,
        'Las suscripciones todavía no están habilitadas en esta versión.',
      );
      return;
    }

    const resultado = await abrirPaywall();

    if (resultado === 'listo') {
      router.push('/action-plan/nuevo');
    } else if (resultado === 'pendiente') {
      Alert.alert(
        'Tu compra quedó registrada',
        'Puede tardar unos minutos en activarse. Si no la ves, cierra y vuelve a abrir la app.',
      );
    } else if (resultado === 'error') {
      Alert.alert('No pudimos abrir la tienda', 'Revisa tu conexión e intenta de nuevo.');
    }
  };

  const confirmarBorrado = (plan: ActionPlan) => {
    Alert.alert('Borrar este plan', `Se borra «${plan.name}» y tus contactos dejan de verlo.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            // Borrar encadena cuatro esperas —el DELETE, la relectura, `syncMe`
            // y el refresco entero—, así que sin esta marca la fila se quedaba
            // quieta un par de segundos y parecía que el toque no había hecho
            // nada.
            setBorrando(plan.id);
            try {
              await deleteActionPlan(plan.id);
              await cargar();
              // Igual que al guardar: el espejo en `profiles.action_plan`
              // cambió, y de ahí sale el aviso de la Home. Borrar el último
              // plan tiene que devolver ese aviso a la pantalla.
              if (userId) await syncMe(userId);
              await refresh();
            } catch {
              setError('No pudimos borrarlo. Intenta de nuevo.');
            } finally {
              setBorrando(null);
            }
          })();
        },
      },
    ]);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Mis planes de acción' }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Text variant="body" tone="secondary">
          Qué vas a hacer si tiembla. Tus contactos los ven cuando tocan tu foto, junto con tu
          última ubicación.
        </Text>

        {plans === null ? (
          <Text variant="footnote" tone="tertiary">
            Cargando…
          </Text>
        ) : plans.length === 0 ? (
          <Card tone="sunken">
            <Text variant="callout" weight="600">
              Todavía no tienes ninguno
            </Text>
            <Text variant="footnote" tone="secondary" style={styles.gapTop}>
              Un plan corto y fácil de recordar vale más que uno perfecto que nadie repasa.
            </Text>
          </Card>
        ) : (
          plans.map((plan) => (
            <Card key={plan.id} padded={false}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Editar el plan ${plan.name}`}
                onPress={() => router.push(`/action-plan/${plan.id}`)}
                style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}>
                <View style={styles.flex}>
                  <Text variant="callout" weight="600">
                    {plan.name}
                  </Text>
                  <Text variant="footnote" tone="secondary" numberOfLines={2} style={styles.gapTop}>
                    {plan.body}
                  </Text>
                  {plan.updatedAt ? (
                    <Text variant="caption" tone="tertiary" style={styles.gapTop}>
                      Actualizado {timeAgo(plan.updatedAt)}
                    </Text>
                  ) : null}
                </View>
                <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Borrar el plan ${plan.name}`}
                accessibilityState={{ busy: borrando === plan.id }}
                disabled={borrando === plan.id}
                onPress={() => confirmarBorrado(plan)}
                style={({ pressed }) => [
                  styles.borrar,
                  { borderTopColor: colors.border },
                  pressed || borrando === plan.id ? styles.pressed : null,
                ]}>
                {borrando === plan.id ? (
                  <ActivityIndicator size="small" color={colors.danger} />
                ) : (
                  <MaterialIcons name="delete-outline" size={18} color={colors.danger} />
                )}
                <Text variant="footnote" tone="danger">
                  {borrando === plan.id ? 'Borrando…' : 'Borrar'}
                </Text>
              </Pressable>
            </Card>
          ))
        )}

        {error ? (
          <Text variant="footnote" tone="danger">
            {error}
          </Text>
        ) : null}

        {plans !== null ? (
          <Button
            title="Agregar un plan"
            size="lg"
            loading={abriendo}
            onPress={() =>
              puedeAgregar ? router.push('/action-plan/nuevo') : void ofrecerPremium()
            }
          />
        ) : null}

        {/* El motivo, al lado del botón que ya está a la vista. Es la pantalla
            donde la función se entiende sola: la persona ya escribió un plan y
            acaba de darse cuenta de que le falta el del trabajo. Sin botón de
            venta propio — el de arriba abre el paywall. */}
        {plans !== null && !puedeAgregar && !isPremium ? (
          <Card tone="sunken">
            <Text variant="callout" weight="600">
              ¿Un plan para cada situación?
            </Text>
            <Text variant="footnote" tone="secondary" style={styles.gapTop}>
              No es lo mismo que tiemble estando en casa que en el trabajo o con los chicos en el
              colegio. Con Premium guardas hasta {PREMIUM_ACTION_PLAN_LIMIT}, cada uno con su
              nombre, y tu red ve el que corresponde.
            </Text>
          </Card>
        ) : null}

        {plans !== null && !puedeAgregar && isPremium ? (
          <Text variant="caption" tone="tertiary">
            Llegaste a {PREMIUM_ACTION_PLAN_LIMIT} planes, el máximo. Borra uno para agregar otro.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  flex: { flex: 1 },
  gapTop: { marginTop: Spacing.xs },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  borrar: {
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
  },
  pressed: { opacity: 0.6 },
});
