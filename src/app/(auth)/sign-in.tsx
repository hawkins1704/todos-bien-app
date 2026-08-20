import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { AuthField } from '@/components/auth/auth-field';
import { AuthScreen } from '@/components/auth/auth-screen';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { isEmail } from '@/lib/auth-form';
import { Spacing } from '@/theme/tokens';

export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const passwordRef = useRef<TextInput>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Para entrar no se valida el largo de la contraseña: quien la creó cuando el
  // mínimo era otro tiene que poder seguir entrando.
  const valid = isEmail(email) && password.length > 0;

  const submit = async () => {
    if (!valid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Al abrir sesión, onAuthStateChange dispara la redirección al onboarding
      // o a la Home según corresponda; esta pantalla no navega a mano.
      await signIn(email, password);
    } catch (caught) {
      setError(authErrorMessage(caught));
      setSubmitting(false);
    }
  };

  return (
    <AuthScreen icon="lock" title="Entra a tu cuenta" subtitle="Con tu correo y tu contraseña.">
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
        invalid={Boolean(error)}
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
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={() => void submit()}
        secure
        invalid={Boolean(error)}
      />

      {error ? (
        <Text variant="footnote" tone="danger">
          {error}
        </Text>
      ) : null}

      <Button
        title="Entrar"
        onPress={() => void submit()}
        disabled={!valid}
        loading={submitting}
        size="lg"
        style={styles.cta}
      />

      <Pressable
        onPress={() => router.push('/forgot-password')}
        accessibilityRole="button"
        style={({ pressed }) => (pressed ? styles.pressed : null)}>
        <Text variant="footnote" tone="accent" center weight="600">
          ¿Olvidaste tu contraseña?
        </Text>
      </Pressable>

      <Pressable
        onPress={() => router.push('/sign-up')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.signUp, pressed ? styles.pressed : null]}>
        <Text variant="footnote" tone="secondary" center>
          ¿Todavía no tienes cuenta?{' '}
          <Text variant="footnote" tone="accent" weight="600">
            Crear una
          </Text>
        </Text>
      </Pressable>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  cta: { marginTop: Spacing.sm },
  signUp: { marginTop: Spacing.sm },
  pressed: { opacity: 0.6 },
});
