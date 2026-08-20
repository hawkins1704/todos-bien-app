import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, StyleSheet, TextInput } from 'react-native';

import { AuthField } from '@/components/auth/auth-field';
import { AuthScreen } from '@/components/auth/auth-screen';
import { CodeInput } from '@/components/auth/code-input';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { PASSWORD_HINT, passwordProblem } from '@/lib/auth-form';
import { AUTH_CODE_LENGTH } from '@/lib/config';
import { Spacing } from '@/theme/tokens';

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { resetPassword } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordIssue = password ? passwordProblem(password) : null;
  const valid = code.length === AUTH_CODE_LENGTH && password.length > 0 && !passwordIssue;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Verificar el código abre sesión, así que el guardia de navegación saca
      // esta pantalla de encima antes de que termine la escritura. Si algo
      // falla, `resetPassword` cierra la sesión y el aviso va por Alert, que es
      // lo único que sobrevive a la navegación.
      await resetPassword(email, code, password);
    } catch (caught) {
      const message = authErrorMessage(caught);
      setError(message);
      setSubmitting(false);
      Alert.alert('No pudimos cambiar tu contraseña', message);
    }
  };

  return (
    <AuthScreen
      icon="password"
      title="Pon una contraseña nueva"
      subtitle={
        <Text variant="body" tone="secondary">
          Si{' '}
          <Text variant="body" weight="600">
            {email}
          </Text>{' '}
          tiene una cuenta, le llegó un código de {AUTH_CODE_LENGTH} dígitos.
        </Text>
      }>
      <CodeInput
        value={code}
        onChange={(digits) => {
          setCode(digits);
          setError(null);
        }}
        onComplete={() => passwordRef.current?.focus()}
        invalid={Boolean(error)}
        autoFocus
      />

      <AuthField
        ref={passwordRef}
        label="CONTRASEÑA NUEVA"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setError(null);
        }}
        placeholder="Tu contraseña nueva"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        secure
        invalid={Boolean(passwordIssue)}
        hint={passwordIssue ?? PASSWORD_HINT}
      />

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        title="Cambiar contraseña y entrar"
        onPress={() => void submit()}
        disabled={!valid}
        loading={submitting}
        size="lg"
        style={styles.cta}
      />

      <Text variant="caption" tone="tertiary" center style={styles.spam}>
        Si no llega, revisa la carpeta de spam.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: Spacing.sm },
  spam: { marginTop: Spacing.xs },
});
