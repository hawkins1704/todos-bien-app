import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { createInvitation, redeemInvitation } from '@/lib/api';
import { inviteMessage, inviteUrl } from '@/lib/config';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function InviteScreen() {
  const insets = useSafeAreaInsets();
  const { colors, status } = useTheme();
  const { myProfile, refresh } = useAppData();

  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void createInvitation(null, null)
      .then((invitation) => setCode(invitation.code))
      .catch(() => setMessage('No pudimos generar el código. Revisa tu conexión.'));
  }, []);

  const share = async () => {
    if (!code) return;
    await Share.share({ message: inviteMessage(code, myProfile?.displayName || 'Alguien') });
  };

  const copy = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(inviteUrl(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /**
   * Auto-detección desde el portapapeles (spec §3): evita que la persona tenga
   * que escribir el código a mano.
   */
  const pasteAndRedeem = async () => {
    setRedeeming(true);
    setMessage(null);
    try {
      const clipboard = (await Clipboard.getStringAsync()).trim();
      const found = /([A-Z2-9]{8})/.exec(clipboard.toUpperCase());

      if (!found) {
        setMessage('No encontramos ningún código en el portapapeles.');
        return;
      }

      await redeemInvitation(found[1]);
      await refresh();
      setMessage('¡Listo! Ya quedaron conectados.');
    } catch {
      setMessage('Ese código no es válido o ya venció.');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Invitar' }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <Card>
          <Text variant="headline">Tu código de invitación</Text>
          <Text variant="subhead" tone="secondary" style={styles.gapTop}>
            Compártelo con quien quieras agregar. Cuando esa persona lo use, quedan conectados de
            una vez, sin que tengas que aceptar nada.
          </Text>

          <View style={[styles.codeWell, { backgroundColor: colors.surfaceSunken }]}>
            {code ? (
              <Text variant="title" style={styles.code}>
                {code}
              </Text>
            ) : (
              <ActivityIndicator color={colors.accent} />
            )}
          </View>

          <Button
            title="Compartir invitación"
            icon="ios-share"
            onPress={() => void share()}
            disabled={!code}
            style={styles.gapTopLg}
          />

          <Pressable
            onPress={() => void copy()}
            disabled={!code}
            accessibilityRole="button"
            style={({ pressed }) => [styles.copyRow, pressed ? styles.pressed : null]}>
            <MaterialIcons
              name={copied ? 'check' : 'content-copy'}
              size={16}
              color={copied ? status.safe.base : colors.accent}
            />
            <Text
              variant="footnote"
              weight="600"
              style={{ color: copied ? status.safe.strong : colors.accent }}>
              {copied ? 'Link copiado' : 'Copiar link'}
            </Text>
          </Pressable>
        </Card>

        <Card>
          <Text variant="headline">¿Te pasaron un código?</Text>
          <Text variant="subhead" tone="secondary" style={styles.gapTop}>
            Cópialo y toca acá: lo leemos del portapapeles para que no tengas que escribirlo.
          </Text>

          <Button
            title="Usar código del portapapeles"
            icon="content-paste"
            variant="secondary"
            onPress={() => void pasteAndRedeem()}
            loading={redeeming}
            style={styles.gapTopLg}
          />
        </Card>

        {message ? (
          <Text variant="footnote" tone="secondary" center>
            {message}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  gapTop: { marginTop: Spacing.xs },
  gapTopLg: { marginTop: Spacing.lg },
  codeWell: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    justifyContent: 'center',
    marginTop: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  code: { letterSpacing: 6 },
  copyRow: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingTop: Spacing.md,
  },
  pressed: { opacity: 0.6 },
});
