import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import {
  openDirectConversation,
  readCachedConversations,
  syncConversations,
  type ConversationSummary,
} from '@/lib/chat';
import { timeAgo } from '@/lib/format';
import { Spacing, TabBarExtraInset } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function ChatsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { accepted } = useAppData();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const load = useCallback(async () => {
    setConversations(await readCachedConversations());
    if (!userId) return;
    try {
      setConversations(await syncConversations(userId));
    } catch {
      // Sin red seguimos con lo cacheado.
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const conversationByUser = new Map(
    conversations.filter((c) => c.otherUserId).map((c) => [c.otherUserId!, c]),
  );

  const openWith = async (otherUserId: string) => {
    setOpening(otherUserId);
    try {
      const id = await openDirectConversation(otherUserId);
      router.push(`/chat/${id}`);
    } finally {
      setOpening(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + TabBarExtraInset + Spacing.xl },
        ]}
        refreshControl={
          // El spinner se ancla al borde del ScrollView, que acá empieza en y=0
          // (debajo del status bar). Sin este offset queda tapado por el reloj.
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
            progressViewOffset={insets.top}
            tintColor={colors.textSecondary}
          />
        }>
        <Text variant="title2">Chats</Text>

        {accepted.length === 0 ? (
          <Card>
            <Text variant="headline">Sin nadie con quien chatear</Text>
            <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
              Puedes escribirle a cualquier persona de tu círculo, sin depender de que WhatsApp
              esté funcionando.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            {accepted.map((member, index) => {
              const conversation = conversationByUser.get(member.userId);
              const unread =
                conversation?.lastMessageAt != null &&
                (conversation.lastReadAt == null ||
                  Date.parse(conversation.lastMessageAt) > Date.parse(conversation.lastReadAt));

              return (
                <Pressable
                  key={member.userId}
                  onPress={() => void openWith(member.userId)}
                  disabled={opening === member.userId}
                  accessibilityRole="button"
                  style={({ pressed }) => [
                    styles.row,
                    index > 0
                      ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                      : null,
                    pressed ? { backgroundColor: colors.surfaceSunken } : null,
                  ]}>
                  <Avatar
                    displayName={member.displayName}
                    size={44}
                    status={null}
                  />

                  <View style={styles.rowCopy}>
                    <Text variant="callout" weight={unread ? '700' : '500'} numberOfLines={1}>
                      {member.displayName}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {conversation?.lastMessageAt
                        ? `Último mensaje ${timeAgo(conversation.lastMessageAt)}`
                        : 'Sin mensajes todavía'}
                    </Text>
                  </View>

                  {unread ? <View style={[styles.dot, { backgroundColor: colors.accent }]} /> : null}
                  <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
                </Pressable>
              );
            })}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowCopy: { flex: 1, gap: 2 },
  dot: { borderRadius: 4, height: 8, width: 8 },
  emptyBody: { marginTop: Spacing.xs },
});
