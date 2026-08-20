import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { AuthScreen } from '@/components/auth/auth-screen';
import { CodeInput } from '@/components/auth/code-input';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { AUTH_CODE_LENGTH } from '@/lib/config';
import { Spacing } from '@/theme/tokens';

const RESEND_SECONDS = 45;

/**
 * Solo se llega acá si el proyecto tiene "Confirm email" prendido en Supabase.
 * Con la confirmación apagada, crear la cuenta devuelve sesión al instante y
 * esta pantalla nunca aparece.
 */
export default function ConfirmEmailScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { confirmEmailCode, resendConfirmation } = useAuth();

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
    if (value.length !== AUTH_CODE_LENGTH || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      // Al confirmar queda sesión abierta y el guardia manda al onboarding.
      await confirmEmailCode(email, value);
    } catch (caught) {
      setError(authErrorMessage(caught));
      setCode('');
      inputRef.current?.focus();
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setError(null);
    try {
      await resendConfirmation(email);
      setCooldown(RESEND_SECONDS);
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  };

  return (
    <AuthScreen
      icon="mark-email-read"
      title="Confirma tu correo"
      subtitle={
        <Text variant="body" tone="secondary">
          Mandamos un código de {AUTH_CODE_LENGTH} dígitos a{' '}
          <Text variant="body" weight="600">
            {email}
          </Text>
          . Escríbelo para terminar de crear tu cuenta.
        </Text>
      }>
      <CodeInput
        ref={inputRef}
        value={code}
        onChange={(digits) => {
          setCode(digits);
          setError(null);
        }}
        onComplete={(digits) => void submit(digits)}
        invalid={Boolean(error)}
        autoFocus
      />

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        title="Confirmar"
        onPress={() => void submit(code)}
        disabled={code.length !== AUTH_CODE_LENGTH}
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

      <Text variant="caption" tone="tertiary" center style={styles.spam}>
        Si no llega, revisa la carpeta de spam.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  spam: { marginTop: Spacing.xs },
  pressed: { opacity: 0.6 },
});
