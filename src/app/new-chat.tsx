import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { openDirectConversation } from '@/lib/chat';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Empezar una conversación con alguien de tu red.
 *
 * **Solo individuales.** Tuvo arriba una fila de «nueva conversación grupal»
 * hasta la 0034; ya no, porque un chat grupal dejó de ser algo que se crea por
 * su cuenta: nace con el grupo, en Mi red → Mis grupos. Esa era exactamente la
 * ambigüedad que la 0034 vino a matar — dos formas de armar «un grupo» que
 * producían objetos distintos con el mismo nombre.
 */
export default function NewChatScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { accepted, refresh } = useAppData();

  const [abriendo, setAbriendo] = useState<string | null>(null);

  const abrirDirecto = async (otherUserId: string) => {
    setAbriendo(otherUserId);
    try {
      const id = await openDirectConversation(otherUserId);
      // `replace` y no `push`: al cerrar el chat se espera volver a Chats, no a
      // la pantalla de elegir con quién hablar.
      router.replace(`/chat/${id}`);
    } catch (error) {
      // Mismo criterio que en la lista de Chats: no se nombra el bloqueo, porque
      // quitar del círculo y bloquear dejan el mismo estado visible y nombrarlo
      // sería avisarle a la persona bloqueada.
      const code = (error as { code?: unknown } | null)?.code;
      Alert.alert(
        'No se pudo abrir el chat',
        code === '42501'
          ? 'Ya no están conectados, así que esta conversación está cerrada.'
          : 'Revisa tu conexión e intenta de nuevo.',
      );
      await refresh();
    } finally {
      setAbriendo(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        {accepted.length === 0 ? (
          <Card>
            <Text variant="headline">Todavía no tienes a nadie</Text>
            <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
              Agrega contactos a tu red y vas a poder escribirles desde acá.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
              DE TU RED
            </Text>

            {accepted.map((member, index) => (
              <Pressable
                key={member.userId}
                accessibilityRole="button"
                accessibilityLabel={member.displayName}
                disabled={abriendo === member.userId}
                onPress={() => void abrirDirecto(member.userId)}
                style={({ pressed }) => [
                  styles.fila,
                  index > 0
                    ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                    : null,
                  pressed ? { backgroundColor: colors.surfaceSunken } : null,
                ]}>
                <Avatar displayName={member.displayName} size={40} status={null} />
                <Text variant="callout" numberOfLines={1} style={styles.flex}>
                  {member.displayName}
                </Text>
                <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
              </Pressable>
            ))}
          </Card>
        )}

        {/* Dónde está lo grupal ahora, dicho en el lugar donde alguien lo va a
            buscar. Sin esta línea, la fila que se quitó arriba se lee como una
            función que desapareció. */}
        <Text variant="caption" tone="tertiary" style={styles.nota}>
          ¿Buscas hablar con varios a la vez? Cada grupo tiene su chat. Ármalo en Mi red → Mis
          grupos.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, padding: Spacing.lg },
  flex: { flex: 1 },
  sectionHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  fila: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  nota: { paddingHorizontal: Spacing.xs },
  emptyBody: { marginTop: Spacing.sm },
});
