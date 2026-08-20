import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthField } from '@/components/auth/auth-field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { authErrorMessage } from '@/lib/auth-errors';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Consecuencia = {
  icon: keyof typeof MaterialIcons.glyphMap;
  texto: string;
};

/**
 * Lo que se pierde, dicho antes y no después.
 *
 * No es relleno legal: dos de estas cuatro cosas sorprenden de verdad. Que se
 * borren los chats **también del otro lado** sale de que `conversations` cascadea
 * por `created_by` (migración 0013), y que la suscripción siga cobrándose sale de
 * que la cobra Apple o Google, no nosotros.
 */
const CONSECUENCIAS: Consecuencia[] = [
  {
    icon: 'group-off',
    texto: 'Desapareces del círculo de tus contactos. Dejan de ver tu estado y tu ubicación.',
  },
  {
    icon: 'chat-bubble-outline',
    texto: 'Se borran tus conversaciones. Las que abriste tú desaparecen también para la otra persona.',
  },
  {
    icon: 'history',
    texto: 'Se borra tu plan de acción, tus simulacros y tu última ubicación registrada.',
  },
  {
    icon: 'block',
    texto: 'No se puede deshacer. Si vuelves, empiezas de cero con una cuenta nueva.',
  },
];

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { deleteAccount } = useAuth();
  const { mySettings } = useAppData();

  const [password, setPassword] = useState('');
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isPremium = mySettings?.isPremium ?? false;

  const confirmar = () => {
    if (!password || borrando) return;

    // Un diálogo del sistema encima del formulario: el botón por sí solo es un
    // toque de distancia de perder la cuenta, y este es el único destructivo
    // irreversible de toda la app.
    Alert.alert(
      '¿Borrar tu cuenta?',
      'Esto borra todos tus datos y no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Borrar cuenta', style: 'destructive', onPress: () => void borrar() },
      ],
    );
  };

  const borrar = async () => {
    setBorrando(true);
    setError(null);
    try {
      // Al terminar no hay a dónde navegar a mano: se cierra la sesión, y el
      // guardia de `_layout` manda a la bienvenida solo.
      await deleteAccount(password);
    } catch (caught) {
      setError(authErrorMessage(caught));
      setBorrando(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Borrar cuenta' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
          keyboardShouldPersistTaps="handled">
          {/* Fondo neutro con el ícono rojo, y no un well rojo: el tema no tiene
              un `dangerSoft` y agregarlo obliga a recalcular contrastes (§1.4.1)
              por un adorno de una sola pantalla. */}
          <View style={[styles.iconWell, { backgroundColor: colors.surfaceSunken }]}>
            <MaterialIcons name="delete-forever" size={30} color={colors.danger} />
          </View>

          <Text variant="title2">Esto borra todo, para siempre</Text>

          <Card>
            <View style={styles.lista}>
              {CONSECUENCIAS.map((item) => (
                <View key={item.icon} style={styles.fila}>
                  <MaterialIcons name={item.icon} size={20} color={colors.textSecondary} />
                  <Text variant="subhead" tone="secondary" style={styles.flex}>
                    {item.texto}
                  </Text>
                </View>
              ))}
            </View>
          </Card>

          {isPremium ? (
            <Card>
              <View style={styles.fila}>
                <MaterialIcons name="credit-card" size={20} color={colors.danger} />
                <View style={styles.flex}>
                  <Text variant="headline">Tu suscripción NO se cancela</Text>
                  <Text variant="subhead" tone="secondary" style={styles.gapTop}>
                    La cobra {Platform.OS === 'ios' ? 'Apple' : 'Google'}, no nosotros, así que
                    borrar la cuenta aquí no la detiene. Cancélala primero desde los ajustes de
                    tu cuenta de {Platform.OS === 'ios' ? 'App Store' : 'Google Play'} o te van a
                    seguir cobrando.
                  </Text>
                  {/* Sin esto, quien borra su cuenta y vuelve aparece como Plan
                      gratuito habiendo pagado: el derecho quedó atado al usuario
                      viejo y solo "Restaurar compras" lo mueve al nuevo. */}
                  <Text variant="subhead" tone="secondary" style={styles.gapTop}>
                    Si más adelante creas otra cuenta y no la cancelaste, recupera lo que pagaste
                    con «Restaurar compras» en Mi cuenta.
                  </Text>
                </View>
              </View>
            </Card>
          ) : null}

          <AuthField
            label="CONFIRMA CON TU CONTRASEÑA"
            value={password}
            onChangeText={(text) => {
              setPassword(text);
              setError(null);
            }}
            placeholder="Tu contraseña"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            secure
            invalid={Boolean(error)}
          />

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Borrar mi cuenta"
            onPress={confirmar}
            disabled={!password}
            loading={borrando}
            variant="danger"
            size="lg"
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  iconWell: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  lista: { gap: Spacing.lg },
  fila: { flexDirection: 'row', gap: Spacing.md },
  gapTop: { marginTop: Spacing.xs },
});
