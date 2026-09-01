import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import {
  addGroupMember,
  deleteGroup,
  DuplicateGroupNameError,
  removeGroupMember,
  renameGroup,
  requestConnection,
} from '@/lib/api';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Detalle de un grupo: nombre, quiénes están, y las salidas.
 *
 * **Un grupo es gente + un chat, y se comparte** (migración 0034). Todo lo que
 * se toca acá lo ven los demás, y por eso cada acción lo dice antes de hacerse.
 * Reemplazó a dos pantallas: el «círculo» privado y la información de una
 * conversación grupal, que eran el mismo objeto con dos caras.
 *
 * ## Las dos caras de esta pantalla
 *
 * **Si lo creaste**, puedes todo: renombrar, sumar, sacar y borrar.
 * **Si te metieron**, ves lo mismo y puedes irte. Nada más.
 *
 * Es asimétrico a propósito y el porqué está en la 0034: sin dueño, cualquiera
 * podría vaciar de golpe el grupo donde una familia se está coordinando después
 * de un sismo.
 *
 * ## 🔴 El aviso que no es decorativo
 *
 * Un integrante que no está en tu red aparece marcado. **No vas a ver su estado
 * ni su ubicación en un sismo**, porque las conexiones son de a dos y no se
 * contagian. No es algo que se pueda arreglar del lado del servidor: hacerlo
 * transitivo permitiría que alguien te metiera en un grupo y le diera tu
 * ubicación a un desconocido.
 *
 * Lo que sí se puede es ofrecer el atajo, y es lo que convierte al grupo en una
 * presentación en vez de una etiqueta.
 */
export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { accepted, groups, refresh } = useAppData();

  const group = groups.find((g) => g.id === id) ?? null;

  const [nombre, setNombre] = useState(group?.name ?? '');
  const [editandoNombre, setEditandoNombre] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [invitado, setInvitado] = useState<Set<string>>(() => new Set());

  const { dentro, porAgregar } = useMemo(() => {
    if (!group) return { dentro: [], porAgregar: [] };
    const ids = new Set(group.members.map((m) => m.userId));
    return {
      // El dueño primero, y uno mismo al final: la lista se lee para saber
      // quién más está.
      dentro: group.members,
      porAgregar: accepted.filter((m) => !ids.has(m.userId)),
    };
  }, [accepted, group]);

  const alternarNombre = useCallback(async () => {
    if (!group) return;
    const limpio = nombre.trim();

    if (limpio.length === 0 || limpio === group.name) {
      setNombre(group.name);
      setEditandoNombre(false);
      return;
    }

    setOcupado('nombre');
    try {
      await renameGroup(group.id, limpio);
      await refresh();
      setEditandoNombre(false);
    } catch (error) {
      setNombre(group.name);
      if (error instanceof DuplicateGroupNameError) {
        Alert.alert('Ya tienes un grupo con ese nombre', 'Elige otro para no confundirlos.');
      } else {
        Alert.alert('No se pudo renombrar', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setOcupado(null);
    }
  }, [group, nombre, refresh]);

  const sumar = useCallback(
    async (memberId: string) => {
      if (!group) return;
      setOcupado(memberId);
      try {
        await addGroupMember(group.id, memberId);
        await refresh();
      } catch {
        Alert.alert('No se pudo agregar', 'Revisa tu conexión e intenta de nuevo.');
      } finally {
        setOcupado(null);
      }
    },
    [group, refresh],
  );

  const sacar = useCallback(
    (memberId: string, displayName: string) => {
      if (!group) return;

      Alert.alert(
        `¿Sacar a ${displayName}?`,
        'Sale del grupo y de su chat, y pierde el acceso a los mensajes anteriores. Puedes volver a sumarla cuando quieras.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Sacar',
            style: 'destructive',
            onPress: () => {
              void (async () => {
                setOcupado(memberId);
                try {
                  await removeGroupMember(group.id, memberId);
                  await refresh();
                } catch {
                  Alert.alert('No se pudo sacar', 'Revisa tu conexión e intenta de nuevo.');
                } finally {
                  setOcupado(null);
                }
              })();
            },
          },
        ],
      );
    },
    [group, refresh],
  );

  /**
   * El atajo. Manda la solicitud de conexión sin salir del grupo.
   *
   * `invitado` es local y solo apaga el botón hasta que el otro responda: la
   * solicitud queda pendiente y no hay nada más que mostrar acá. La ficha de la
   * persona en Mi red ya cuenta esa historia entera.
   */
  const agregarARed = useCallback(
    async (memberId: string, displayName: string) => {
      setOcupado(memberId);
      try {
        await requestConnection(memberId);
        setInvitado((previos) => new Set(previos).add(memberId));
        await refresh();
        Alert.alert(
          `Le mandamos la solicitud a ${displayName}`,
          'Cuando la acepte vas a poder ver cómo está en un sismo, y ella a ti.',
        );
      } catch {
        Alert.alert('No se pudo enviar', 'Revisa tu conexión e intenta de nuevo.');
      } finally {
        setOcupado(null);
      }
    },
    [refresh],
  );

  const salir = useCallback(() => {
    if (!group || !userId) return;

    Alert.alert(
      `¿Salir de «${group.name}»?`,
      'Dejas de recibir sus mensajes y pierdes el acceso a los anteriores. Los demás siguen conversando, y para volver tiene que sumarte quien lo creó.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setOcupado('salir');
              try {
                await removeGroupMember(group.id, userId);
                await refresh();
                router.back();
              } catch {
                setOcupado(null);
                Alert.alert('No se pudo salir', 'Revisa tu conexión e intenta de nuevo.');
              }
            })();
          },
        },
      ],
    );
  }, [group, refresh, router, userId]);

  const borrar = useCallback(() => {
    if (!group) return;

    Alert.alert(
      `¿Borrar «${group.name}»?`,
      'Desaparece para todos, junto con su chat y todos sus mensajes. Nadie sale de tu red.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setOcupado('borrar');
              try {
                await deleteGroup(group.id);
                await refresh();
                router.back();
              } catch {
                setOcupado(null);
                Alert.alert('No se pudo borrar', 'Revisa tu conexión e intenta de nuevo.');
              }
            })();
          },
        },
      ],
    );
  }, [group, refresh, router]);

  // El grupo puede no existir: lo borró su dueño, o te sacaron, mientras esta
  // pantalla estaba abierta.
  if (!group) {
    return (
      <Screen>
        <View style={styles.content}>
          <Card>
            <Text variant="headline">Este grupo ya no existe</Text>
            <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
              Puede que lo haya borrado quien lo creó, o que te haya sacado.
            </Text>
            <Button title="Volver" onPress={() => router.back()} style={styles.emptyAction} />
          </Card>
        </View>
      </Screen>
    );
  }

  const fueraDeMiRed = dentro.filter((m) => !m.inMyNetwork).length;

  return (
    <Screen>
      <KeyboardAvoider style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          <Card>
            <Text variant="footnote" tone="secondary" weight="600">
              NOMBRE
            </Text>

            {editandoNombre ? (
              <View style={styles.nombreFila}>
                <TextInput
                  value={nombre}
                  onChangeText={setNombre}
                  maxLength={30}
                  autoFocus
                  editable={ocupado !== 'nombre'}
                  returnKeyType="done"
                  onSubmitEditing={() => void alternarNombre()}
                  onBlur={() => void alternarNombre()}
                  style={[styles.input, { borderColor: colors.border, color: colors.text }]}
                  placeholderTextColor={colors.textTertiary}
                  placeholder="Casa, Familia, Trabajo…"
                />
                {ocupado === 'nombre' ? (
                  <ActivityIndicator size="small" color={colors.accent} />
                ) : null}
              </View>
            ) : (
              <Pressable
                accessibilityRole={group.isOwner ? 'button' : undefined}
                accessibilityLabel={
                  group.isOwner ? `Cambiar el nombre, ahora ${group.name}` : group.name
                }
                disabled={!group.isOwner}
                onPress={() => {
                  setNombre(group.name);
                  setEditandoNombre(true);
                }}
                style={styles.nombreFila}>
                <Text variant="title3" style={styles.flex}>
                  {group.name}
                </Text>
                {group.isOwner ? (
                  <MaterialIcons name="edit" size={18} color={colors.textTertiary} />
                ) : null}
              </Pressable>
            )}

            <Text variant="caption" tone="tertiary" style={styles.gapTop}>
              {group.isOwner
                ? 'Creaste este grupo. El nombre y la lista los ven todos los integrantes.'
                : 'Lo creó otra persona. Solo quien lo creó puede cambiar el nombre y la lista.'}
            </Text>
          </Card>

          <Card padded={false}>
            <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
              EN EL GRUPO · {dentro.length}
            </Text>

            {dentro.map((m, index) => {
              const soyYo = m.userId === userId;
              const trabajando = ocupado === m.userId;

              return (
                <View
                  key={m.userId}
                  style={[
                    styles.miembro,
                    index > 0
                      ? {
                          borderTopColor: colors.border,
                          borderTopWidth: StyleSheet.hairlineWidth,
                        }
                      : null,
                  ]}>
                  <Avatar displayName={m.displayName} size={36} status={null} />

                  <View style={styles.flex}>
                    <Text variant="callout" numberOfLines={1}>
                      {m.displayName}
                      {soyYo ? ' (tú)' : ''}
                    </Text>

                    {m.isOwner ? (
                      <Text variant="caption" tone="tertiary">
                        Creó el grupo
                      </Text>
                    ) : !m.inMyNetwork ? (
                      // 🔴 El aviso central de esta pantalla. Dice la
                      // consecuencia, no la causa: a nadie le importa la
                      // topología de las conexiones, le importa que en un sismo
                      // no va a saber nada de esta persona.
                      <Text variant="caption" tone="accent" weight="600">
                        No está en tu red · no vas a ver cómo está
                      </Text>
                    ) : null}
                  </View>

                  {trabajando ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : !soyYo && !m.inMyNetwork ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Agregar a ${m.displayName} a mi red`}
                      disabled={invitado.has(m.userId)}
                      onPress={() => void agregarARed(m.userId, m.displayName)}
                      hitSlop={8}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: colors.accentSoft,
                          borderColor: colors.accentSoft,
                        },
                        pressed || invitado.has(m.userId) ? styles.pressed : null,
                      ]}>
                      <MaterialIcons
                        name={invitado.has(m.userId) ? 'schedule' : 'person-add-alt'}
                        size={14}
                        color={colors.accent}
                      />
                      <Text variant="caption" weight="600" style={{ color: colors.accent }}>
                        {invitado.has(m.userId) ? 'Enviada' : 'Agregar'}
                      </Text>
                    </Pressable>
                  ) : group.isOwner && !soyYo ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Sacar a ${m.displayName} del grupo`}
                      onPress={() => sacar(m.userId, m.displayName)}
                      hitSlop={8}>
                      <MaterialIcons name="remove-circle-outline" size={22} color={colors.danger} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </Card>

          {/* Solo el dueño suma, y solo de SU red. Es la regla que impide que un
              tercero meta a alguien que vos no conocés. */}
          {group.isOwner && porAgregar.length > 0 ? (
            <Card padded={false}>
              <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
                AGREGAR DE TU RED
              </Text>
              <Text variant="caption" tone="tertiary" style={styles.aviso}>
                Quien entra ve el nombre del grupo, a los demás integrantes, y puede leer todo lo
                que se habló antes.
              </Text>

              {porAgregar.map((m, index) => (
                <Pressable
                  key={m.userId}
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar a ${m.displayName} al grupo`}
                  disabled={ocupado === m.userId}
                  onPress={() => void sumar(m.userId)}
                  style={({ pressed }) => [
                    styles.miembro,
                    index > 0
                      ? {
                          borderTopColor: colors.border,
                          borderTopWidth: StyleSheet.hairlineWidth,
                        }
                      : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <Avatar displayName={m.displayName} size={36} status={null} dimmed />
                  <Text variant="callout" numberOfLines={1} style={styles.flex}>
                    {m.displayName}
                  </Text>
                  <View style={styles.marca}>
                    {ocupado === m.userId ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <MaterialIcons
                        name="add-circle-outline"
                        size={22}
                        color={colors.textTertiary}
                      />
                    )}
                  </View>
                </Pressable>
              ))}
            </Card>
          ) : null}

          {group.conversationId ? (
            <Button
              title="Abrir el chat del grupo"
              icon="chat"
              variant="outline"
              onPress={() => router.push(`/chat/${group.conversationId}`)}
            />
          ) : null}

          {fueraDeMiRed > 0 ? (
            <Text variant="caption" tone="tertiary" style={styles.nota}>
              {fueraDeMiRed === 1
                ? 'Hay 1 persona en este grupo que no está en tu red.'
                : `Hay ${fueraDeMiRed} personas en este grupo que no están en tu red.`}{' '}
              Puedes escribirles acá, pero en un sismo no vas a ver su estado ni su ubicación hasta
              que las agregues.
            </Text>
          ) : null}

          {group.isOwner ? (
            <Button
              title="Borrar grupo"
              variant="danger"
              loading={ocupado === 'borrar'}
              onPress={borrar}
            />
          ) : (
            <Button
              title="Salir del grupo"
              variant="danger"
              loading={ocupado === 'salir'}
              onPress={salir}
            />
          )}
        </ScrollView>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, padding: Spacing.lg },
  flex: { flex: 1 },
  nombreFila: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  input: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 17,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  sectionHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  aviso: { paddingBottom: Spacing.sm, paddingHorizontal: Spacing.lg },
  miembro: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  marca: { alignItems: 'center', justifyContent: 'center', width: 22 },
  chip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  pressed: { opacity: 0.6 },
  nota: { paddingHorizontal: Spacing.xs },
  gapTop: { marginTop: Spacing.sm },
  emptyBody: { marginTop: Spacing.sm },
  emptyAction: { marginTop: Spacing.lg },
});
