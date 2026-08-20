import { Stack, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth/auth-field';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { PASSWORD_HINT, passwordProblem } from '@/lib/auth-form';
import { Spacing } from '@/theme/tokens';

/**
 * Cambiar la contraseña con la sesión abierta.
 *
 * Antes el único camino era cerrar sesión y usar "olvidé mi contraseña", que
 * además depende de que llegue un correo. Acá no hace falta correo: la
 * identidad ya está probada por la contraseña actual.
 */
export default function ChangePasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { changePassword } = useAuth();

  const nuevaRef = useRef<TextInput>(null);
  const repetirRef = useRef<TextInput>(null);

  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetir, setRepetir] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problemaNueva = nueva ? passwordProblem(nueva) : null;
  const problemaRepetir = repetir && repetir !== nueva ? 'Las dos contraseñas no coinciden.' : null;
  // Cambiar la contraseña por la misma no cambia nada, y el servidor lo rechaza
  // con `same_password`. Mejor decirlo antes de mandar el viaje.
  const esLaMisma = Boolean(nueva) && nueva === actual ? 'Esa ya es tu contraseña actual.' : null;

  const valido =
    actual.length > 0 &&
    nueva.length > 0 &&
    !problemaNueva &&
    !esLaMisma &&
    repetir === nueva;

  const guardar = async () => {
    if (!valido || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await changePassword(actual, nueva);
      router.back();
      Alert.alert('Contraseña cambiada', 'La próxima vez entra con la contraseña nueva.');
    } catch (caught) {
      setError(authErrorMessage(caught));
      setGuardando(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Cambiar contraseña' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          <Text variant="body" tone="secondary">
            Necesitamos tu contraseña actual para confirmar que eres tú.
          </Text>

          <AuthField
            label="CONTRASEÑA ACTUAL"
            value={actual}
            onChangeText={(text) => {
              setActual(text);
              setError(null);
            }}
            placeholder="Tu contraseña de ahora"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="next"
            onSubmitEditing={() => nuevaRef.current?.focus()}
            secure
            invalid={Boolean(error)}
          />

          <AuthField
            ref={nuevaRef}
            label="CONTRASEÑA NUEVA"
            value={nueva}
            onChangeText={(text) => {
              setNueva(text);
              setError(null);
            }}
            placeholder="Tu contraseña nueva"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            onSubmitEditing={() => repetirRef.current?.focus()}
            secure
            invalid={Boolean(problemaNueva || esLaMisma)}
            hint={problemaNueva ?? esLaMisma ?? PASSWORD_HINT}
          />

          <AuthField
            ref={repetirRef}
            label="REPITE LA CONTRASEÑA NUEVA"
            value={repetir}
            onChangeText={(text) => {
              setRepetir(text);
              setError(null);
            }}
            placeholder="Otra vez"
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={() => void guardar()}
            secure
            invalid={Boolean(problemaRepetir)}
            hint={problemaRepetir ?? undefined}
          />

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Cambiar contraseña"
            onPress={() => void guardar()}
            disabled={!valido}
            loading={guardando}
            size="lg"
            style={styles.cta}
          />

          <Text variant="caption" tone="tertiary">
            Al cambiarla se cierra la sesión en los demás teléfonos donde hayas entrado. En este
            sigues adentro.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  cta: { marginTop: Spacing.sm },
});
