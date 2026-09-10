import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModuloBloqueado } from '@/components/centro-bloqueado';
import { Card } from '@/components/ui/card';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import {
  addHouseholdRole,
  deleteHouseholdRole,
  esTareaRepetida,
  fetchHouseholdRoles,
  fetchPreparedness,
} from '@/lib/api';
import { esRechazoDeModeracion } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { ROLE_SUGGESTIONS, type HouseholdRole } from '@/types/domain';

const MAX_TAREA = 40;

/**
 * Quién hace qué cuando tiemble.
 *
 * **Varias tareas por persona** (migración 0052). La primera versión permitía
 * una sola, con el argumento de que repartir con varias etiquetas por cabeza
 * «deja de ser un reparto». En una casa real no se sostiene: el mismo que cierra
 * el gas es el que carga al bebé, y obligar a elegir una sola convierte el
 * módulo en una etiqueta decorativa.
 *
 * Lo que sí se impide es la misma tarea repetida en la misma persona — índice
 * único en el servidor, no una comprobación de esta pantalla.
 *
 * Las sugerencias son eso: hay un campo libre al lado. Una lista cerrada dejaría
 * afuera a quien tiene un abuelo postrado o tres gatos.
 *
 * ⚠️ El progreso del hogar cuenta **personas con al menos una tarea**, no
 * tareas. Una casa donde el papá tiene cinco y nadie más tiene ninguna no está
 * repartida.
 */
export default function RolesScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { groups } = useAppData();

  const [hogar, setHogar] = useState<{ id: string; premium: boolean } | null>(null);
  const [roles, setRoles] = useState<HouseholdRole[]>([]);
  const [editando, setEditando] = useState<string | null>(null);
  const [borrador, setBorrador] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const p = await fetchPreparedness();
      if (!p) return;
      setHogar({ id: p.householdId, premium: p.premium });
      setRoles(await fetchHouseholdRoles(p.householdId));
    } catch (caught) {
      if (__DEV__) console.warn('[roles] no se pudo cargar', caught);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const puedeEditar = hogar?.premium ?? false;
  const integrantes = groups.find((g) => g.id === hogar?.id)?.members ?? [];

  const agregar = useCallback(
    async (memberId: string, label: string) => {
      if (!hogar) return;
      const limpio = label.trim();
      if (!limpio) return;

      try {
        const suyas = roles.filter((r) => r.memberId === memberId).length;
        await addHouseholdRole(hogar.id, memberId, limpio, suyas);
        setBorrador('');
        await cargar();
      } catch (caught) {
        if (esTareaRepetida(caught)) {
          Alert.alert('Ya la tiene', `«${limpio}» ya está asignada a esta persona.`);
        } else if (esRechazoDeModeracion(caught)) {
          Alert.alert(
            'No podemos publicar eso',
            'Los términos no permiten insultos, discriminación ni amenazas.',
          );
        } else {
          if (__DEV__) console.warn('[roles] no se pudo agregar', caught);
          Alert.alert('No se pudo guardar', 'Revisa tu conexión e intenta de nuevo.');
        }
      }
    },
    [cargar, hogar, roles],
  );

  const quitar = useCallback(
    async (roleId: string) => {
      try {
        await deleteHouseholdRole(roleId);
        await cargar();
      } catch (caught) {
        if (__DEV__) console.warn('[roles] no se pudo quitar', caught);
        Alert.alert('No se pudo quitar', 'Revisa tu conexión e intenta de nuevo.');
      }
    },
    [cargar],
  );

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

  // Con el Premium vencido no se muestran las tareas. En uso normal no se llega
  // acá —el Centro está velado y no ofrece la tarjeta— pero sí por la pila de
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
          <Text variant="footnote" tone="secondary">
            En una emergencia nadie improvisa bien. Que cada uno sepa de antemano sus tareas es la
            diferencia entre una casa que sale ordenada y una que se busca a gritos.
          </Text>

          {integrantes.map((m) => {
            const suyas = roles.filter((r) => r.memberId === m.userId);
            const abierto = editando === m.userId;

            return (
              <Card key={m.userId}>
                <View style={styles.encabezado}>
                  <View style={styles.flex}>
                    <Text variant="callout" weight="600">
                      {m.displayName}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {suyas.length === 0
                        ? 'Sin tareas'
                        : `${suyas.length} ${suyas.length === 1 ? 'tarea' : 'tareas'}`}
                    </Text>
                  </View>

                  {puedeEditar ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Agregar una tarea a ${m.displayName}`}
                      accessibilityState={{ expanded: abierto }}
                      hitSlop={8}
                      onPress={() => {
                        setEditando(abierto ? null : m.userId);
                        setBorrador('');
                      }}
                      style={({ pressed }) => (pressed ? styles.presionada : null)}>
                      <MaterialIcons
                        name={abierto ? 'close' : 'add-circle-outline'}
                        size={24}
                        color={colors.accent}
                      />
                    </Pressable>
                  ) : null}
                </View>

                {suyas.length > 0 ? (
                  <View style={styles.tareas}>
                    {suyas.map((r) => (
                      <View
                        key={r.id}
                        style={[styles.tarea, { backgroundColor: colors.accentSoft }]}>
                        <Text variant="footnote" tone="accent" weight="500">
                          {r.label}
                        </Text>
                        {puedeEditar ? (
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar «${r.label}» a ${m.displayName}`}
                            hitSlop={8}
                            onPress={() => void quitar(r.id)}>
                            <MaterialIcons name="close" size={15} color={colors.accent} />
                          </Pressable>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ) : null}

                {abierto ? (
                  <View style={styles.editor}>
                    {/* Las sugerencias asignan de un toque: es el camino de
                        siempre y no debería costar escribir nada. El campo de
                        abajo existe para la casa que no se parece a ninguna
                        lista. Ya asignadas no se ofrecen. */}
                    <View style={styles.sugerencias}>
                      {ROLE_SUGGESTIONS.filter((s) => !suyas.some((r) => r.label === s)).map((s) => (
                        <Pressable
                          key={s}
                          accessibilityRole="button"
                          accessibilityLabel={`Asignar «${s}» a ${m.displayName}`}
                          onPress={() => void agregar(m.userId, s)}
                          style={({ pressed }) => [
                            styles.chip,
                            { backgroundColor: colors.surfaceSunken },
                            pressed ? styles.presionada : null,
                          ]}>
                          <MaterialIcons name="add" size={13} color={colors.textSecondary} />
                          <Text variant="caption" tone="secondary">
                            {s}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.filaEntrada}>
                      <TextInput
                        value={borrador}
                        onChangeText={setBorrador}
                        placeholder="…o escribe otra"
                        placeholderTextColor={colors.textTertiary}
                        maxLength={MAX_TAREA}
                        returnKeyType="done"
                        onSubmitEditing={() => void agregar(m.userId, borrador)}
                        style={[
                          styles.entrada,
                          {
                            backgroundColor: colors.surfaceSunken,
                            borderColor: colors.border,
                            color: colors.text,
                          },
                        ]}
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Agregar la tarea escrita"
                        disabled={!borrador.trim()}
                        onPress={() => void agregar(m.userId, borrador)}
                        style={({ pressed }) => [
                          styles.agregar,
                          {
                            backgroundColor: borrador.trim() ? colors.accent : colors.surfaceSunken,
                          },
                          pressed ? styles.presionada : null,
                        ]}>
                        <MaterialIcons
                          name="check"
                          size={20}
                          color={borrador.trim() ? colors.accentText : colors.textTertiary}
                        />
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </Card>
            );
          })}

          {puedeEditar ? null : (
            <Card tone="sunken">
              <Text variant="footnote" tone="secondary">
                Tu hogar no tiene Premium: pueden ver las tareas, pero no cambiarlas.
              </Text>
            </Card>
          )}
        </ScrollView>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  agregar: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  chip: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  content: { gap: Spacing.md, padding: Spacing.lg },
  editor: { gap: Spacing.md, marginTop: Spacing.md },
  encabezado: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  entrada: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 16,
    padding: Spacing.md,
  },
  filaEntrada: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  presionada: { opacity: 0.6 },
  sugerencias: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  tarea: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  tareas: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.md },
  vacio: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
});
