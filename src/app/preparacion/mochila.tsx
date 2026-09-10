import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModuloBloqueado } from '@/components/centro-bloqueado';
import { KitBackpack } from '@/components/kit-backpack';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import {
  addKitItem,
  createKit,
  deleteKit,
  deleteKitItem,
  fetchKits,
  fetchPreparedness,
  setKitItemChecked,
} from '@/lib/api';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { EmergencyKit } from '@/types/domain';

/** Una mochila alcanza para unas cuatro personas; de ahí en adelante se sugiere otra. */
const PERSONAS_POR_MOCHILA = 4;

/**
 * La mochila de emergencia del hogar.
 *
 * **Son varias a propósito.** No se pueden meter veinte litros de agua en una
 * sola, así que una familia grande necesita más de una y la app sugiere cuántas
 * según cuánta gente vive ahí. El progreso suma todas.
 *
 * El contenido inicial lo siembra el servidor con el catálogo del INDECI al
 * crear cada mochila (disparador `emergency_kits_seed`), así que acá nunca se
 * escribe una lista de ítems: marcar es un `update` de una fila que ya existe.
 */
export default function MochilaScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { userId } = useAuth();

  const [hogar, setHogar] = useState<{ id: string; premium: boolean; members: number } | null>(null);
  const [kits, setKits] = useState<EmergencyKit[]>([]);
  const [nuevo, setNuevo] = useState('');
  const [agregandoA, setAgregandoA] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    try {
      const p = await fetchPreparedness();
      if (!p) {
        setHogar(null);
        return;
      }
      setHogar({ id: p.householdId, premium: p.premium, members: p.members });
      setKits(await fetchKits(p.householdId));
    } catch (caught) {
      if (__DEV__) console.warn('[mochila] no se pudo cargar', caught);
    } finally {
      setCargando(false);
    }
  }, []);

  // Al enfocar y no solo al montar: se vuelve acá después de agregar una
  // mochila o de que otro de la casa marque algo.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const puedeEditar = hogar?.premium ?? false;

  const total = kits.reduce((n, k) => n + k.items.length, 0);
  const listos = kits.reduce((n, k) => n + k.items.filter((i) => i.checkedAt).length, 0);
  const pct = total === 0 ? 0 : Math.round((listos / total) * 100);

  const sugeridas = Math.max(1, Math.ceil((hogar?.members ?? 1) / PERSONAS_POR_MOCHILA));
  const faltanMochilas = sugeridas > kits.length;

  const alternar = useCallback(
    async (itemId: string, marcado: boolean) => {
      if (!userId) return;

      // Optimista: el ida y vuelta se siente en un checklist largo.
      setKits((previas) =>
        previas.map((k) => ({
          ...k,
          items: k.items.map((i) =>
            i.id === itemId
              ? { ...i, checkedAt: marcado ? new Date().toISOString() : null, checkedBy: marcado ? userId : null }
              : i,
          ),
        })),
      );

      try {
        const tocó = await setKitItemChecked(itemId, marcado, userId);
        // Sin Premium la RLS deja leer y no escribir, y un `update` sin filas
        // **no lanza error**. Sin este chequeo el ítem se quedaría marcado en
        // pantalla y no en la base.
        if (!tocó) {
          await cargar();
          Alert.alert(
            'Tu hogar no tiene Premium',
            'Pueden ver lo que ya armaron, pero para cambiar la mochila hace falta Premium.',
          );
        }
      } catch (caught) {
        if (__DEV__) console.warn('[mochila] no se pudo marcar', caught);
        await cargar();
      }
    },
    [cargar, userId],
  );

  const agregar = useCallback(
    async (kitId: string) => {
      const label = nuevo.trim();
      if (!label) return;
      const kit = kits.find((k) => k.id === kitId);
      try {
        await addKitItem(kitId, label, (kit?.items.length ?? 0) + 1);
        setNuevo('');
        setAgregandoA(null);
        await cargar();
      } catch (caught) {
        if (__DEV__) console.warn('[mochila] no se pudo agregar', caught);
        Alert.alert('No se pudo agregar', 'Revisa tu conexión e intenta de nuevo.');
      }
    },
    [cargar, kits, nuevo],
  );

  const borrarMochila = useCallback(
    (kitId: string, nombre: string) => {
      Alert.alert(`¿Borrar «${nombre}»?`, 'Se borra con todo lo que tenga marcado.', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteKit(kitId);
                await cargar();
              } catch (caught) {
                if (__DEV__) console.warn('[mochila] no se pudo borrar', caught);
              }
            })();
          },
        },
      ]);
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

  // Con el Premium vencido no se muestra la lista. En uso normal no se llega
  // acá —el Centro está velado y no ofrece la tarjeta— pero sí por la pila de
  // navegación, si vence estando dentro.
  if (!hogar.premium) {
    return (
      <Screen>
        <ModuloBloqueado />
      </Screen>
    );
  }

  const anchoDibujo = Math.min(width - Spacing.lg * 4, 320);

  return (
    <Screen>
      <KeyboardAvoider>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled">
          <Card>
            <View style={styles.dibujo}>
              <KitBackpack value={pct} width={anchoDibujo} />
            </View>
            <Text variant="title3" center>
              {pct}%
            </Text>
            <Text variant="footnote" tone="secondary" center>
              {listos} de {total} cosas listas
              {kits.length > 1 ? ` · ${kits.length} mochilas` : ''}
            </Text>
          </Card>

          {faltanMochilas ? (
            <Card tone="sunken">
              <Text variant="footnote" tone="secondary">
                Son {hogar.members} personas en tu casa. Con una sola mochila no entra el agua de
                todos: te conviene tener {sugeridas}.
              </Text>
            </Card>
          ) : null}

          {kits.map((kit) => (
            <Card key={kit.id} padded={false}>
              {/* Con una sola mochila el nombre no informa nada: la pantalla ya
                  se llama «Mochila de emergencia» y abajo no hay con qué
                  confundirla. Recién con dos hay algo que distinguir. */}
              {kits.length > 1 ? (
                <View style={styles.tituloKit}>
                  <Text variant="headline" style={styles.flex}>
                    {kit.name}
                  </Text>
                  {puedeEditar ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Borrar ${kit.name}`}
                      hitSlop={8}
                      onPress={() => borrarMochila(kit.id, kit.name)}>
                      <MaterialIcons name="delete-outline" size={20} color={colors.textTertiary} />
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              {kit.items.map((item, indice) => {
                const marcado = Boolean(item.checkedAt);
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: marcado }}
                    accessibilityLabel={item.label}
                    disabled={!puedeEditar}
                    onPress={() => void alternar(item.id, !marcado)}
                    onLongPress={
                      puedeEditar && item.isCustom
                        ? () => {
                            void (async () => {
                              await deleteKitItem(item.id);
                              await cargar();
                            })();
                          }
                        : undefined
                    }
                    style={({ pressed }) => [
                      styles.item,
                      // El primer ítem nunca lleva línea arriba: las líneas
                      // SEPARAN ítems, no coronan la lista. Con el título ya la
                      // separa el aire, y sin título quedaba un filete pegado al
                      // borde de la tarjeta.
                      indice === 0
                        ? null
                        : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                      pressed ? styles.presionada : null,
                    ]}>
                    <MaterialIcons
                      name={marcado ? 'check-circle' : 'radio-button-unchecked'}
                      size={22}
                      color={marcado ? colors.accent : colors.textTertiary}
                    />
                    <View style={styles.flex}>
                      <Text variant="callout" tone={marcado ? 'secondary' : 'primary'}>
                        {item.label}
                      </Text>
                      {item.detail ? (
                        <Text variant="caption" tone="tertiary">
                          {item.detail}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}

              {puedeEditar ? (
                agregandoA === kit.id ? (
                  <View style={[
                      styles.item,
                      { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}>
                    <MaterialIcons name="add" size={22} color={colors.textTertiary} />
                    <TextInput
                      autoFocus
                      value={nuevo}
                      onChangeText={setNuevo}
                      placeholder="¿Qué más lleva?"
                      placeholderTextColor={colors.textTertiary}
                      maxLength={60}
                      returnKeyType="done"
                      onSubmitEditing={() => void agregar(kit.id)}
                      onBlur={() => setAgregandoA(null)}
                      style={[styles.entrada, { color: colors.text }]}
                    />
                  </View>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setAgregandoA(kit.id)}
                    style={[
                      styles.item,
                      { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
                    ]}>
                    <MaterialIcons name="add" size={22} color={colors.accent} />
                    <Text variant="callout" tone="accent">
                      Agregar algo
                    </Text>
                  </Pressable>
                )
              ) : null}
            </Card>
          ))}

          {puedeEditar ? (
            <Button
              // «Otra» solo cuando ya hay alguna. Un hogar nace con la suya
              // (migración 0052), pero se puede borrar, y ahí el rótulo mentía.
              title={kits.length === 0 ? 'Armar la mochila' : 'Agregar otra mochila'}
              icon="add"
              variant="outline"
              onPress={() => {
                void (async () => {
                  await createKit(hogar.id, `Mochila ${kits.length + 1}`, kits.length);
                  await cargar();
                })();
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.md, padding: Spacing.lg },
  dibujo: { alignItems: 'center', marginBottom: Spacing.md },
  entrada: { flex: 1, fontSize: 16, paddingVertical: 0 },
  flex: { flex: 1 },
  // 🔴 **Sin `borderTopWidth` acá.** Lo trae cada fila que la necesita, junto con
  // su color. Tenerlo en el estilo base parece más corto y produce una línea
  // NEGRA: la primera fila anulaba solo el color y React Native cae en su color
  // de borde por defecto, que es negro, no el del tema.
  item: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  presionada: { opacity: 0.6 },
  tituloKit: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  vacio: { flex: 1, justifyContent: 'center', padding: Spacing.xl },
});
