import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { AUTH_CODE_LENGTH } from '@/lib/config';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const CODE_LENGTH = AUTH_CODE_LENGTH;
const CODE_PLACEHOLDER = '0'.repeat(CODE_LENGTH);
// Con códigos largos hay que apretar la tipografía para que entren en pantallas chicas.
const CODE_FONT_SIZE = CODE_LENGTH > 6 ? 28 : 32;
const CODE_LETTER_SPACING = CODE_LENGTH > 6 ? 6 : 10;
const RESEND_SECONDS = 45;

export default function VerifyScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { verifyEmailCode, sendEmailCode } = useAuth();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      // Al verificar, onAuthStateChange dispara la redirección al onboarding.
      await verifyEmailCode(email, value);
    } catch {
      setError('Ese código no es válido o ya venció. Revisa el correo o pide uno nuevo.');
      setCode('');
      inputRef.current?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await sendEmailCode(email);
      setCooldown(RESEND_SECONDS);
    } catch {
      setError('No pudimos reenviar el código. Intenta en un momento.');
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
          <Text variant="title">Revisa tu correo</Text>
          <Text variant="body" tone="secondary">
            Mandamos un código de {CODE_LENGTH} dígitos a{' '}
            <Text variant="body" weight="600">
              {email}
            </Text>
            .
          </Text>

          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={(text) => {
              const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
              setCode(digits);
              setError(null);
              if (digits.length === CODE_LENGTH) void submit(digits);
            }}
            placeholder={CODE_PLACEHOLDER}
            placeholderTextColor={colors.textTertiary}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            autoFocus
            maxLength={CODE_LENGTH}
            accessibilityLabel="Código de verificación"
            style={[
              styles.input,
              {
                backgroundColor: colors.surfaceSunken,
                borderColor: error ? colors.danger : colors.border,
                color: colors.text,
                fontSize: CODE_FONT_SIZE,
                letterSpacing: CODE_LETTER_SPACING,
              },
            ]}
          />

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Verificar"
            onPress={() => void submit(code)}
            disabled={code.length !== CODE_LENGTH}
            loading={verifying}
            size="lg"
          />

          <Pressable
            onPress={() => void resend()}
            disabled={cooldown > 0}
            accessibilityRole="button"
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <Text variant="footnote" tone={cooldown > 0 ? 'tertiary' : 'accent'} center weight="600">
              {cooldown > 0 ? `Reenviar código en ${cooldown}s` : 'Reenviar código'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.md, paddingHorizontal: Spacing.xl },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontWeight: '600',
    marginTop: Spacing.md,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },
  pressed: { opacity: 0.6 },
});
