import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { ensureInitialLocation } from '@/lib/alert-response';
import { updateMySettings } from '@/lib/api';
import {
  getPermissionLevel,
  requestBackgroundPermission,
  requestForegroundPermission,
  type LocationPermissionLevel,
} from '@/lib/location';
import { getNotificationPermission, requestNotificationPermission } from '@/lib/notifications';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function OnboardingPermissionsScreen() {
  const router = useRouter();
  const { colors, status } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [locationLevel, setLocationLevel] = useState<LocationPermissionLevel>('none');
  const [notificationsGranted, setNotificationsGranted] = useState(false);
  const [busy, setBusy] = useState<'location' | 'notifications' | null>(null);

  useEffect(() => {
    void getPermissionLevel().then(setLocationLevel);
    void getNotificationPermission().then(setNotificationsGranted);
  }, []);

  const askLocation = async () => {
    setBusy('location');
    try {
      // Primero primer plano, después segundo plano: el orden lo exige el SO.
      const foreground = await requestForegroundPermission();
      if (!foreground) {
        setLocationLevel('none');
        return;
      }

      await requestBackgroundPermission();
      const level = await getPermissionLevel();
      setLocationLevel(level);
      if (userId) await updateMySettings(userId, { locationPermissionLevel: level });

      // Conceder el permiso no guarda ninguna posición: es solo el derecho a
      // leer el GPS. Sin una primera lectura, `user_status.latitude` queda NULL
      // y la regla del radio de get_active_alert() nunca puede evaluarse, así
      // que la persona solo recibiría alertas por la regla nacional (mag ≥ 6.0).
      // Se toma acá, en el momento del consentimiento, para cubrir también a
      // quien abandona el onboarding más adelante. Sin await: no debe demorar
      // la pantalla.
      void ensureInitialLocation();
    } finally {
      setBusy(null);
    }
  };

  const askNotifications = async () => {
    setBusy('notifications');
    try {
      setNotificationsGranted(await requestNotificationPermission());
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen tone="plain">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}>
        <OnboardingStep
          step={2}
          title="Dos permisos, y te explico exactamente para qué"
          subtitle="Ninguno se usa para nada distinto de lo que dice acá."
        />

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <MaterialIcons name="location-on" size={22} color={colors.accent} />
            </View>
            <View style={styles.cardTitle}>
              <Text variant="headline">Ubicación</Text>
              {locationLevel === 'background' ? (
                <Text variant="footnote" style={{ color: status.safe.strong }}>
                  Listo · se capturará al ocurrir un sismo
                </Text>
              ) : locationLevel === 'foreground' ? (
                <Text variant="footnote" style={{ color: status.helping.strong }}>
                  Solo mientras usas la app
                </Text>
              ) : (
                <Text variant="footnote" tone="tertiary">
                  Sin conceder
                </Text>
              )}
            </View>
          </View>

          <Text variant="subhead" tone="secondary" style={styles.explainer}>
            La app toma tu ubicación{' '}
            <Text variant="subhead" weight="700">
              una sola vez, en el momento en que ocurre un sismo en tu zona
            </Text>
            , y se la muestra únicamente a los contactos que tú aceptaste.
          </Text>

          <View style={[styles.promise, { backgroundColor: colors.surfaceSunken }]}>
            <MaterialIcons name="do-not-disturb-on" size={16} color={colors.textSecondary} />
            <Text variant="footnote" tone="secondary" style={styles.promiseText}>
              No te rastreamos el resto del tiempo. La app nunca registra tu recorrido ni
              guarda un historial de dónde estuviste.
            </Text>
          </View>

          <Text variant="caption" tone="tertiary" style={styles.why}>
            Pedimos el permiso &quot;siempre&quot; porque un sismo casi nunca te agarra con la
            app abierta. Sin ese permiso solo podríamos mostrar dónde estabas la última vez
            que la abriste.
          </Text>

          {locationLevel === 'background' ? null : (
            <Button
              title={locationLevel === 'none' ? 'Permitir ubicación' : 'Permitir siempre'}
              onPress={() => void askLocation()}
              loading={busy === 'location'}
              variant="secondary"
              style={styles.cardAction}
            />
          )}

          {locationLevel === 'foreground' ? (
            <Pressable
              onPress={() => void Linking.openSettings()}
              accessibilityRole="button"
              style={({ pressed }) => (pressed ? styles.pressed : null)}>
              <Text variant="caption" tone="accent" center weight="600">
                Si el sistema ya no vuelve a preguntar, actívalo en Ajustes
              </Text>
            </Pressable>
          ) : null}
        </Card>

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <MaterialIcons name="notifications-active" size={22} color={colors.accent} />
            </View>
            <View style={styles.cardTitle}>
              <Text variant="headline">Notificaciones</Text>
              <Text
                variant="footnote"
                style={{
                  color: notificationsGranted ? status.safe.strong : colors.textTertiary,
                }}>
                {notificationsGranted ? 'Listo' : 'Sin conceder'}
              </Text>
            </View>
          </View>

          <Text variant="subhead" tone="secondary" style={styles.explainer}>
            Te avisamos solo cuando pasa algo que necesitas saber: un contacto marcó que
            necesita ayuda, te escribió, o aceptó tu solicitud.
          </Text>

          <Text variant="caption" tone="tertiary" style={styles.why}>
            No mandamos una notificación por cada sismo que ocurre, ni cuando alguien marca
            que está bien. Puedes apagar cada tipo por separado en Ajustes.
          </Text>

          {notificationsGranted ? null : (
            <Button
              title="Permitir notificaciones"
              onPress={() => void askNotifications()}
              loading={busy === 'notifications'}
              variant="secondary"
              style={styles.cardAction}
            />
          )}
        </Card>

        <Button title="Continuar" onPress={() => router.push('/contacts')} size="lg" />

        {locationLevel !== 'background' ? (
          <Text variant="caption" tone="tertiary" center>
            Puedes continuar sin darlos y activarlos después desde Ajustes.
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  cardTitle: { flex: 1, gap: 1 },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  explainer: { marginTop: Spacing.md },
  promise: {
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  promiseText: { flex: 1 },
  why: { marginTop: Spacing.md },
  cardAction: { marginTop: Spacing.lg },
  pressed: { opacity: 0.6 },
});
