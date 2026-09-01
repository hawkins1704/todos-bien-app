import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { AuthField } from '@/components/auth/auth-field';
import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { isEmail, PASSWORD_HINT, passwordProblem } from '@/lib/auth-form';
import { Spacing } from '@/theme/tokens';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useAuth();
  const passwordRef = useRef<TextInput>(null);
  const repeatRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Los avisos aparecen recién cuando el campo tiene algo escrito: marcar en
  // rojo un campo vacío que la persona todavía no llenó es ruido, no ayuda.
  const passwordIssue = password ? passwordProblem(password) : null;
  const repeatIssue = repeat && repeat !== password ? 'Las dos contraseñas no coinciden.' : null;

  const valid =
    isEmail(email) && !passwordProblem(password) && password.length > 0 && repeat === password;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await signUp(email, password);

      if (result === 'already-registered') {
        setError('Ese correo ya tiene una cuenta. Entra con tu contraseña.');
        setSubmitting(false);
        return;
      }

      if (result === 'needs-confirmation') {
        router.push({ pathname: '/confirm-email', params: { email: email.trim().toLowerCase() } });
        setSubmitting(false);
        return;
      }

      // 'signed-in': ya hay sesión y el guardia de navegación manda al
      // onboarding solo. No se apaga el loading a propósito, para que el botón
      // no vuelva a habilitarse durante la transición.
    } catch (caught) {
      setError(authErrorMessage(caught));
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen
      icon="person-add"
      title="Crea tu cuenta"
      subtitle="Con tu correo y una contraseña. Nada más.">
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
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus()}
      />

      <AuthField
        ref={passwordRef}
        label="CONTRASEÑA"
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          setError(null);
        }}
        placeholder="Tu contraseña"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        onSubmitEditing={() => repeatRef.current?.focus()}
        secure
        invalid={Boolean(passwordIssue)}
        hint={passwordIssue ?? PASSWORD_HINT}
      />

      <AuthField
        ref={repeatRef}
        label="REPITE LA CONTRASEÑA"
        value={repeat}
        onChangeText={(text) => {
          setRepeat(text);
          setError(null);
        }}
        placeholder="Otra vez"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        secure
        invalid={Boolean(repeatIssue)}
        hint={repeatIssue ?? undefined}
      />

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        title="Crear cuenta"
        onPress={() => void submit()}
        disabled={!valid}
        loading={submitting}
        size="lg"
        style={styles.cta}
      />

      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        style={({ pressed }) => (pressed ? styles.pressed : null)}>
        <Text variant="footnote" tone="secondary" center>
          ¿Ya tienes cuenta?{' '}
          <Text variant="footnote" tone="accent" weight="600">
            Entrar
          </Text>
        </Text>
      </Pressable>

      <Text variant="caption" tone="tertiary" style={styles.legal}>
        Tu correo se usa para entrar y para recuperar la cuenta. No se lo mostramos a nadie de
        tu red.
      </Text>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: Spacing.sm },
  legal: { marginTop: Spacing.sm },
  pressed: { opacity: 0.6 },
});
