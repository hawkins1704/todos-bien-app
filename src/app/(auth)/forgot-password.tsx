import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AuthField } from '@/components/auth/auth-field';
import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { isEmail } from '@/lib/auth-form';
import { AUTH_CODE_LENGTH } from '@/lib/config';
import { Spacing } from '@/theme/tokens';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { requestPasswordReset } = useAuth();

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isEmail(email);

  const submit = async () => {
    if (!valid || sending) return;
    setSending(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      // Supabase responde igual exista o no la cuenta, a propósito: así el
      // formulario no sirve para averiguar quién tiene cuenta en la app. Por eso
      // se avanza siempre, y la pantalla siguiente lo dice con todas las letras.
      router.push({ pathname: '/reset-password', params: { email: email.trim().toLowerCase() } });
    } catch (caught) {
      setError(authErrorMessage(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthScreen
      icon="lock-reset"
      title="Recupera tu cuenta"
      subtitle={`Te mandamos un código de ${AUTH_CODE_LENGTH} dígitos para que puedas poner una contraseña nueva.`}>
      <AuthField
        label="CORREO"
        value={email}
        onChangeText={(text) => {
          setEmail(text);
          setError(null);
        }}
        placeholder="tu@correo.com"
        autoComplete="email"
        keyboardType="email-address"
        inputMode="email"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        invalid={Boolean(error)}
      />

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        title="Mandarme el código"
        onPress={() => void submit()}
        disabled={!valid}
        loading={sending}
        size="lg"
        style={styles.cta}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: Spacing.sm },
});
