import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeyboardAvoider } from '@/components/ui/keyboard-avoider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { REPORT_REASONS, blockConnection, submitReport, type ReportReason } from '@/lib/api';
import { readCircleMember } from '@/lib/db/circle';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Denunciar contenido de otra persona.
 *
 * Existe por la guía 1.2 de App Store Review, que exige poder denunciar y
 * bloquear en cualquier app donde alguien vea texto escrito por otro. Acá eso
 * son los mensajes del chat y el mensaje del estado.
 *
 * **Denunciar y quitar del círculo son dos cosas distintas y las dos hacen
 * falta.** Quitar corta el vínculo ya mismo y es lo único que tiene efecto
 * inmediato; denunciar deja el registro para que lo revisemos. Por eso, al
 * terminar, la pantalla ofrece quitar a la persona en el mismo gesto: quien
 * denuncia normalmente quiere las dos, y obligarlo a buscar la segunda en otra
 * pantalla es pedirle un trámite en el peor momento.
 */
export default function ReportScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { refresh } = useAppData();

  const { userId, name, conversationId, messageId, preview } = useLocalSearchParams<{
    userId: string;
    name?: string;
    conversationId?: string;
    messageId?: string;
    preview?: string;
  }>();

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nombreDelCirculo, setNombreDelCirculo] = useState<string | null>(null);

  // Desde el chat no viene el nombre —la burbuja solo sabe quién la mandó—, así
  // que se busca en la caché local. Es una lectura de SQLite, no de red.
  useEffect(() => {
    if (name || !userId) return;
    void readCircleMember(userId)
      .then((member) => setNombreDelCirculo(member?.displayName ?? null))
      .catch(() => setNombreDelCirculo(null));
  }, [name, userId]);

  const displayName = name?.trim() || nombreDelCirculo || 'esta persona';

  /**
   * Al terminar se ofrece **bloquear**, no quitar del círculo.
   *
   * Quien acaba de denunciar por acoso no quiere «dejar de compartir su
   * ubicación»: quiere que la otra persona no le pueda escribir más. Quitar no
   * hace eso —la conversación existente sigue abierta y puede mandar solicitud
   * de nuevo—; bloquear sí (migración 0021).
   *
   * No hace falta comprobar si hay conexión: `block_connection()` funciona
   * igual con vínculo, con solicitud pendiente o sin nada.
   */
  const offerBlock = () => {
    Alert.alert(
      'Gracias, recibimos tu denuncia',
      `La revisamos en menos de 24 horas. Si no quieres que ${displayName} vuelva a contactarte, puedes bloquearla ahora: no va a poder escribirte ni enviarte solicitudes.`,
      [
        { text: 'Solo denunciar', style: 'cancel', onPress: () => router.back() },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () => {
            void blockConnection(userId)
              .then(refresh)
              .then(() => router.back())
              .catch(() =>
                Alert.alert(
                  'La denuncia se envió, pero no pudimos bloquear',
                  'Puedes bloquear a esta persona desde su perfil en tu círculo.',
                  [{ text: 'Listo', onPress: () => router.back() }],
                ),
              );
          },
        },
      ],
    );
  };

  const send = async () => {
    if (!reason || !userId || sending) return;

    setSending(true);
    setError(null);

    try {
      await submitReport({
        reportedUserId: userId,
        reason,
        detail: detail.trim() || null,
        conversationId: conversationId ?? null,
        messageId: messageId ?? null,
      });
      offerBlock();
    } catch {
      setError('No pudimos enviar la denuncia. Revisa tu conexión e intenta de nuevo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Denunciar' }} />

      <KeyboardAvoider style={styles.flex}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          <Text variant="body" tone="secondary">
            Cuéntanos qué pasó con {displayName}. Revisamos todas las denuncias en menos de 24
            horas y tomamos medidas sobre las cuentas que incumplan los términos.
          </Text>

          {preview ? (
            <Card>
              <Text variant="footnote" tone="secondary" weight="600">
                MENSAJE QUE ESTÁS DENUNCIANDO
              </Text>
              <Text variant="body" style={styles.gapTop} numberOfLines={6}>
                “{preview}”
              </Text>
            </Card>
          ) : null}

          <Card padded={false}>
            {REPORT_REASONS.map((option, index) => {
              const selected = reason === option.key;

              return (
                <Pressable
                  key={option.key}
                  onPress={() => setReason(option.key)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.reason,
                    index > 0
                      ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                      : null,
                    pressed ? styles.pressed : null,
                  ]}>
                  <MaterialIcons
                    name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={selected ? colors.accent : colors.textTertiary}
                  />
                  <Text variant="callout" style={styles.flex}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </Card>

          <View style={styles.detail}>
            <Text variant="footnote" tone="secondary" weight="600">
              QUÉ PASÓ (OPCIONAL)
            </Text>
            <TextInput
              value={detail}
              onChangeText={setDetail}
              placeholder="Agrega lo que nos ayude a entender el caso"
              placeholderTextColor={colors.textTertiary}
              multiline
              maxLength={1000}
              accessibilityLabel="Detalle de la denuncia"
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceSunken,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
            />
          </View>

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Enviar denuncia"
            onPress={() => void send()}
            disabled={!reason}
            loading={sending}
            size="lg"
          />

          <Text variant="caption" tone="tertiary">
            Si hay una emergencia en curso, no nos escribas a nosotros: llama a los bomberos
            (116), a la policía (105) o al SAMU (106).
          </Text>
        </ScrollView>
      </KeyboardAvoider>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  gapTop: { marginTop: Spacing.xs },
  reason: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  detail: { gap: Spacing.xs },
  input: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    minHeight: 96,
    padding: Spacing.md,
    textAlignVertical: 'top',
  },
  pressed: { opacity: 0.6 },
});
