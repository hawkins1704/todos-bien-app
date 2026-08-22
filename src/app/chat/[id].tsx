import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DrillBanner } from '@/components/drill-banner';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { useDrill } from '@/context/drill';
import {
  markConversationRead,
  readCachedMessages,
  sendMessage,
  syncMessages,
  type ChatMessage,
} from '@/lib/chat';
import { elapsedShort } from '@/lib/format';
import { setOpenConversation } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import { flushOutbox } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { isDrilling } = useDrill();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    if (!conversationId) return;
    setMessages(await readCachedMessages(conversationId));
    try {
      await syncMessages(conversationId);
      setMessages(await readCachedMessages(conversationId));
    } catch {
      // Sin red mostramos lo que ya está cacheado.
    }
  }, [conversationId]);

  useEffect(() => {
    // load() empieza leyendo la caché de SQLite, así que el setState cae en un
    // microtask posterior, no en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    if (conversationId && userId) void markConversationRead(conversationId, userId);
  }, [load, conversationId, userId]);

  // Mientras esta conversación esté en pantalla, sus mensajes no interrumpen con
  // un banner: la persona los está leyendo. Se limpia al salir para que vuelvan
  // a avisar. Ver `setNotificationHandler` en lib/notifications.
  useEffect(() => {
    setOpenConversation(conversationId ?? null);
    return () => setOpenConversation(null);
  }, [conversationId]);

  // Realtime solo acá: el chat tiene carga normal. El pico de lecturas del
  // dashboard post-sismo NO usa Realtime a propósito (spec §16.2).
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          void load();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, load]);

  const send = async () => {
    const body = draft.trim();
    if (!body || !conversationId || !userId) return;

    setDraft('');
    await sendMessage({ conversationId, senderId: userId, body, isDrill: isDrilling });

    // La burbuja aparece ya, con el reloj de pendiente: eso es lo optimista.
    setMessages(await readCachedMessages(conversationId));

    // Y el reloj se apaga en cuanto el servidor la acepta, sin depender de que
    // el eco de Realtime llegue. Si no hay red, `flushOutbox` vuelve sin
    // haberla subido y el reloj se queda puesto — que es la verdad.
    await flushOutbox();
    setMessages(await readCachedMessages(conversationId));
  };

  return (
    <Screen tone="plain">
      <Stack.Screen options={{ title: 'Chat' }} />
      {isDrilling ? <DrillBanner /> : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          inverted
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="callout" tone="tertiary" center>
                Todavía no hay mensajes.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.senderId === userId;

            return (
              <View style={[styles.bubbleRow, mine ? styles.mineRow : styles.theirsRow]}>
                <View
                  style={[
                    styles.bubble,
                    {
                      backgroundColor: mine ? colors.accent : colors.surfaceSunken,
                      borderBottomRightRadius: mine ? Radius.sm : Radius.lg,
                      borderBottomLeftRadius: mine ? Radius.lg : Radius.sm,
                    },
                  ]}>
                  {item.isDrill ? (
                    <View style={styles.drillTag}>
                      <DrillBanner compact />
                    </View>
                  ) : null}

                  <Text variant="body" style={{ color: mine ? colors.accentText : colors.text }}>
                    {item.body}
                  </Text>

                  <View style={styles.meta}>
                    <Text
                      variant="caption"
                      style={{ color: mine ? colors.accentText : colors.textTertiary, opacity: 0.8 }}>
                      {elapsedShort(item.createdAt)}
                    </Text>
                    {item.pending ? (
                      <MaterialIcons
                        name="schedule"
                        size={11}
                        color={mine ? colors.accentText : colors.textTertiary}
                      />
                    ) : null}
                  </View>
                </View>
              </View>
            );
          }}
        />

        <View
          style={[
            styles.composer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: insets.bottom + Spacing.sm,
            },
          ]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Escribe un mensaje"
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={2000}
            accessibilityLabel="Mensaje"
            style={[
              styles.input,
              { backgroundColor: colors.surfaceSunken, borderColor: colors.border, color: colors.text },
            ]}
          />

          <Pressable
            onPress={() => void send()}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel="Enviar mensaje"
            style={({ pressed }) => [
              styles.sendButton,
              { backgroundColor: draft.trim() ? colors.accent : colors.border },
              pressed ? styles.pressed : null,
            ]}>
            <MaterialIcons
              name="arrow-upward"
              size={22}
              color={draft.trim() ? colors.accentText : colors.textTertiary}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.lg },
  empty: { paddingVertical: Spacing.xxl, transform: [{ scaleY: -1 }] },
  bubbleRow: { flexDirection: 'row' },
  mineRow: { justifyContent: 'flex-end' },
  theirsRow: { justifyContent: 'flex-start' },
  bubble: {
    borderRadius: Radius.lg,
    gap: 2,
    maxWidth: '82%',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  drillTag: { marginBottom: Spacing.xs },
  meta: { alignItems: 'center', alignSelf: 'flex-end', flexDirection: 'row', gap: 3 },
  composer: {
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  input: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    fontSize: 17,
    maxHeight: 120,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  sendButton: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  pressed: { opacity: 0.7 },
});
