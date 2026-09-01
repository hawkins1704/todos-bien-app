import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  deleteConversation,
  leaveGroupConversation,
  readCachedConversations,
  syncConversations,
  type ConversationSummary,
} from '@/lib/chat';
import { timeAgo } from '@/lib/format';
import { Radius, Spacing, tabScreenBottomInset } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * El conmutador de raíz de Chats.
 *
 * Desde la 0034, «Grupales» son **los chats de tus grupos** y nada más: no se
 * pueden crear desde acá porque un grupo es gente + un chat, una sola cosa, y se
 * arma en Mi red. Antes eran dos objetos distintos que la gente llamaba igual.
 */
type Vista = 'individuales' | 'grupales';

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { accepted, groups } = useAppData();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [vista, setVista] = useState<Vista>('individuales');

  const load = useCallback(async () => {
    setConversations(await readCachedConversations());
    if (!userId) return;
    try {
      setConversations(await syncConversations(userId));
    } catch {
      // Sin red seguimos con lo cacheado.
    }
  }, [userId]);

  const { refreshing, onRefresh } = usePullToRefresh(load);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const nombrePorUsuario = useMemo(
    () => new Map(accepted.map((m) => [m.userId, m.displayName])),
    [accepted],
  );

  /**
   * Las individuales que EXISTEN, no la red entera.
   *
   * Antes esta lista pintaba a todos tus contactos aunque nunca les hubieras
   * escrito, así que «Chats» se leía como un directorio y no como una bandeja.
   * Ahora una conversación aparece cuando existe, igual que las grupales.
   *
   * Se descartan además las que no se pueden nombrar: si la persona ya no está
   * en tu red, la conversación quedó cerrada y una fila «Sin nombre» que no
   * abre nada es peor que no mostrarla.
   */
  const individuales = useMemo(
    () =>
      conversations.filter(
        (c) =>
          c.kind === 'direct' &&
          !c.hidden &&
          c.otherUserId !== null &&
          nombrePorUsuario.has(c.otherUserId),
      ),
    [conversations, nombrePorUsuario],
  );

  /**
   * Las grupales, con las que todavía no tienen ningún mensaje ARRIBA.
   *
   * La caché ordena por `last_message_at DESC NULLS LAST`, que mandaría al fondo
   * justo el grupo que acabas de crear, que es el que estás buscando.
   */
  const grupales = useMemo(
    () =>
      conversations
        .filter((c) => c.kind === 'group' && !c.hidden)
        .sort((a, b) => Number(a.lastMessageAt != null) - Number(b.lastMessageAt != null)),
    [conversations],
  );

  /** Los grupos vigentes, para saber si una grupal todavía tiene grupo detrás. */
  const gruposPorId = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);

  /**
   * Eliminar un chat, para los dos tipos.
   *
   * Se llama «Eliminar chat» y no «Sacar de mi lista» —como decía antes— porque
   * eso último no significa nada para quien lo lee: nadie sabe qué es «la
   * lista». Lo que la persona quiere hacer es lo que hace WhatsApp, y ahora la
   * app hace lo mismo: los mensajes se borran de este teléfono de verdad.
   *
   * El aviso sigue diciendo la mitad que no se ve, porque es un objeto de dos:
   * del otro lado no se borra nada. Ver `deleteConversation` en lib/chat.
   */
  const confirmarEliminar = (conversation: ConversationSummary, nombre: string) => {
    Alert.alert(
      `¿Eliminar el chat con ${nombre}?`,
      'Se borran los mensajes de este teléfono. En el teléfono de la otra persona siguen ahí, y si te vuelve a escribir el chat aparece de nuevo, con los mensajes nuevos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await deleteConversation(conversation.id);
              await load();
            })();
          },
        },
      ],
    );
  };

  /** Mantener presionado un chat directo. La única acción es eliminarlo. */
  const opcionesDirecto = (conversation: ConversationSummary, nombre: string) => {
    Alert.alert(nombre, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar chat',
        style: 'destructive',
        onPress: () => confirmarEliminar(conversation, nombre),
      },
    ]);
  };

  /**
   * Mantener presionada una grupal.
   *
   * Hay dos clases y el menú cambia, porque las acciones posibles son distintas:
   *
   * - **Con grupo detrás** (lo normal desde la 0034): «Ver el grupo» lleva a
   *   donde se cambia el nombre, se ve quién está, se suma gente y se sale. Acá
   *   no se ofrece nada de eso, o habría dos lugares para lo mismo.
   * - **Suelta**, de las creadas antes de la 0034: no hay grupo al que ir, así
   *   que conserva su «Salir». Sin eso serían inabandonables.
   */
  const opcionesGrupal = (conversation: ConversationSummary) => {
    const nombre = conversation.title ?? 'Conversación';
    const grupo = conversation.groupId ? gruposPorId.get(conversation.groupId) : undefined;

    const eliminar = {
      text: 'Eliminar chat',
      style: 'destructive' as const,
      onPress: () =>
        // Eliminar no es salir: sigues adentro y los demás te siguen viendo.
        Alert.alert(
          `¿Eliminar el chat de «${nombre}»?`,
          grupo
            ? 'Se borran los mensajes de este teléfono. Sigues en el grupo: si alguien escribe, el chat aparece de nuevo. Para dejar el grupo del todo, entra a «Ver el grupo».'
            : 'Se borran los mensajes de este teléfono. Sigues siendo integrante: si alguien escribe, la conversación aparece de nuevo.',
          [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Eliminar',
              style: 'destructive',
              onPress: () => {
                void (async () => {
                  await deleteConversation(conversation.id);
                  await load();
                })();
              },
            },
          ],
        ),
    };

    if (grupo) {
      Alert.alert(nombre, undefined, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Ver el grupo', onPress: () => router.push(`/group/${grupo.id}`) },
        eliminar,
      ]);
      return;
    }

    Alert.alert(nombre, undefined, [
      { text: 'Cancelar', style: 'cancel' },
      eliminar,
      {
        text: 'Salir de la conversación',
        style: 'destructive',
        onPress: () =>
          Alert.alert(
            `¿Salir de «${nombre}»?`,
            'Dejas de recibir sus mensajes y pierdes el acceso a los anteriores. Los demás siguen conversando, y para volver alguien tiene que sumarte de nuevo.',
            [
              { text: 'Cancelar', style: 'cancel' },
              {
                text: 'Salir',
                style: 'destructive',
                onPress: () => {
                  void (async () => {
                    if (!userId) return;
                    try {
                      await leaveGroupConversation(conversation.id, userId);
                    } catch {
                      Alert.alert('No se pudo salir', 'Revisa tu conexión e intenta de nuevo.');
                    } finally {
                      await load();
                    }
                  })();
                },
              },
            ],
          ),
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: tabScreenBottomInset(insets.bottom) + Spacing.xl,
          },
        ]}
        refreshControl={
          // El spinner se ancla al borde del ScrollView, que acá empieza en y=0
          // (debajo del status bar). Sin este offset queda tapado por el reloj.
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={insets.top}
            tintColor={colors.textSecondary}
          />
        }>
        <View style={styles.header}>
          <Text variant="title2" style={styles.flex}>
            Chats
          </Text>
          {/* El + hace una cosa sola: abrir un chat con alguien de tu red. Lo
              grupal ya no se crea desde acá — nace con el grupo, en Mi red —,
              así que en esa pestaña el botón lleva allá. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              vista === 'grupales' ? 'Armar un grupo' : 'Nueva conversación'
            }
            hitSlop={8}
            onPress={() => router.push(vista === 'grupales' ? '/circle' : '/new-chat')}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <MaterialIcons
              name={vista === 'grupales' ? 'group-add' : 'add-comment'}
              size={24}
              color={colors.accent}
            />
          </Pressable>
        </View>

        {/* Individuales / Grupales.
            «Grupales» son los chats de tus grupos, uno por grupo. Ya no hay dos
            cosas que se llamen igual: desde la 0034 el grupo y su conversación
            son el mismo objeto, y esta lista es una vista de aquello. */}
        <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]}>
          {(
            [
              { key: 'individuales' as const, label: 'Individuales', total: individuales.length },
              { key: 'grupales' as const, label: 'Grupales', total: grupales.length },
            ] as const
          ).map((opcion) => {
            const activo = vista === opcion.key;

            return (
              <Pressable
                key={opcion.key}
                onPress={() => setVista(opcion.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={`${opcion.label}, ${opcion.total}`}
                style={[
                  styles.segment,
                  activo ? { backgroundColor: colors.surface, borderColor: colors.border } : null,
                ]}>
                <View style={styles.segmentInner}>
                  <Text variant="subhead" weight={activo ? '600' : '400'}>
                    {opcion.label}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {opcion.total}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {vista === 'individuales' ? (
          individuales.length === 0 ? (
            <>
              <Card>
                <Text variant="headline">Todavía no has hablado con nadie</Text>
                <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
                  {accepted.length === 0
                    ? 'Agrega contactos a tu red y vas a poder escribirles desde acá.'
                    : 'Puedes escribirle a cualquier persona de tu red, sin depender de que WhatsApp esté funcionando.'}
                </Text>
              </Card>
              {accepted.length > 0 ? (
                <Button
                  title="Nueva conversación"
                  icon="add-comment"
                  variant="outline"
                  onPress={() => router.push('/new-chat')}
                />
              ) : null}
            </>
          ) : (
            <Card padded={false}>
              {individuales.map((conversation, index) => {
                const nombre = nombrePorUsuario.get(conversation.otherUserId!) ?? 'Sin nombre';

                return (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    label={nombre}
                    first={index === 0}
                    onPress={() => router.push(`/chat/${conversation.id}`)}
                    onLongPress={() => opcionesDirecto(conversation, nombre)}
                    leading={<Avatar displayName={nombre} size={44} status={null} />}
                  />
                );
              })}
            </Card>
          )
        ) : grupales.length === 0 ? (
          <>
            <Card>
              <Text variant="headline">Todavía no tienes grupos</Text>
              <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
                Un grupo es gente + un chat. Sirve para hablar con varios a la vez sin depender de
                que WhatsApp esté funcionando, y en un sismo la Home te dice cuántos de cada grupo
                ya se reportaron.
              </Text>
            </Card>
            {/* El chat grupal ya no se crea desde acá: nace con el grupo. El
                botón lleva a donde se arma, en vez de dejar la pantalla sin
                salida. */}
            <Button
              title="Armar un grupo"
              icon="groups"
              variant="outline"
              onPress={() => router.push('/circle')}
            />
          </>
        ) : (
          <Card padded={false}>
            {grupales.map((conversation, index) => (
              <ConversationRow
                key={conversation.id}
                conversation={conversation}
                label={conversation.title ?? 'Sin nombre'}
                first={index === 0}
                onPress={() => router.push(`/chat/${conversation.id}`)}
                onLongPress={() => opcionesGrupal(conversation)}
                leading={
                  <View style={[styles.groupIcon, { backgroundColor: colors.accentSoft }]}>
                    <MaterialIcons name="groups" size={20} color={colors.accent} />
                  </View>
                }
              />
            ))}
          </Card>
        )}

        <Text variant="caption" tone="tertiary" style={styles.nota}>
          Mantén presionada una conversación para ver sus opciones.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function ConversationRow({
  conversation,
  label,
  first,
  leading,
  onPress,
  onLongPress,
}: {
  conversation: ConversationSummary;
  label: string;
  first: boolean;
  leading: React.ReactNode;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();

  const unread =
    conversation.lastMessageAt != null &&
    (conversation.lastReadAt == null ||
      Date.parse(conversation.lastMessageAt) > Date.parse(conversation.lastReadAt));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Mantén presionado para ver opciones"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        first ? null : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
        pressed ? { backgroundColor: colors.surfaceSunken } : null,
      ]}>
      {leading}

      <View style={styles.rowCopy}>
        <Text variant="callout" weight={unread ? '700' : '500'} numberOfLines={1}>
          {label}
        </Text>
        <Text variant="caption" tone="tertiary">
          {conversation.lastMessageAt
            ? `Último mensaje ${timeAgo(conversation.lastMessageAt)}`
            : 'Sin mensajes todavía'}
        </Text>
      </View>

      {unread ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
      <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  segmented: { borderRadius: Radius.md, flexDirection: 'row', gap: 2, padding: 3 },
  segment: {
    borderColor: 'transparent',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: Spacing.sm,
  },
  segmentInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  groupIcon: {
    alignItems: 'center',
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  rowCopy: { flex: 1, gap: 2 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  emptyBody: { marginTop: Spacing.xs },
  nota: { paddingHorizontal: Spacing.xs },
});
