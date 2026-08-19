import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { AUTH_CODE_LENGTH } from '@/lib/config';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignInScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { sendEmailCode } = useAuth();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = EMAIL_PATTERN.test(email.trim());

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendEmailCode(email);
      router.push({ pathname: '/verify', params: { email: email.trim().toLowerCase() } });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos enviar el código. Intenta de nuevo.',
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen tone="plain">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={[styles.iconWell, { backgroundColor: colors.accentSoft }]}>
            <MaterialIcons name="mail" size={32} color={colors.accent} />
          </View>

          <Text variant="title">Entra con tu correo</Text>
          <Text variant="body" tone="secondary">
            Te mandamos un código de {AUTH_CODE_LENGTH} dígitos. No necesitas recordar ninguna
            contraseña.
          </Text>

          <TextInput
            value={email}
            onChangeText={(text) => {
              setEmail(text);
              setError(null);
            }}
            placeholder="tu@correo.com"
            placeholderTextColor={colors.textTertiary}
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            keyboardType="email-address"
            inputMode="email"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
            accessibilityLabel="Correo electrónico"
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceSunken,
                borderColor: error ? colors.danger : colors.border,
                color: colors.text,
              },
            ]}
          />

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Enviarme el código"
            onPress={() => void submit()}
            disabled={!valid}
            loading={sending}
            size="lg"
          />

          <Text variant="caption" tone="tertiary">
            Más adelante vas a poder entrar también con Apple o Google.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.md, paddingHorizontal: Spacing.xl },
  iconWell: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 60,
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    width: 60,
  },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: 17,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
});
