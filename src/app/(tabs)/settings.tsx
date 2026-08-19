import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  AppState,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import {
  fetchNotificationPrefs,
  updateMySettings,
  updateNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/api';
import { syncLocationPermission } from '@/lib/alert-response';
import {
  getPermissionState,
  requestBackgroundPermission,
  requestForegroundPermission,
  type LocationPermissionState,
} from '@/lib/location';
import { formatE164ForDisplay } from '@/lib/phone';
import { syncMe } from '@/lib/sync';
import { Radius, Spacing, TabBarExtraInset } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { FREE_DRILL_LIMIT } from '@/types/domain';

const RADIUS_OPTIONS = [50, 100, 150, 300];
const MAGNITUDE_OPTIONS = [4.0, 4.5, 5.0, 5.5];

const NOTIFICATION_LABELS: { key: keyof NotificationPrefs; title: string; detail: string }[] = [
  {
    key: 'contactNeedsHelp',
    title: 'Alguien necesita ayuda',
    detail: 'Un contacto marcó que necesita ayuda.',
  },
  { key: 'contactMessage', title: 'Mensajes', detail: 'Un contacto te escribió por chat.' },
  {
    key: 'connectionAccepted',
    title: 'Solicitudes aceptadas',
    detail: 'Alguien aceptó tu solicitud de conexión.',
  },
  {
    key: 'contactNotResponding',
    title: 'Contacto sin responder',
    detail: 'Un contacto no actualizó su estado un rato después de una alerta.',
  },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, status } = useTheme();
  const { userId, signOut } = useAuth();
  const { myProfile, mySettings, myStatus, refresh } = useAppData();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [locationState, setLocationState] = useState<LocationPermissionState | null>(null);
  const [askingLocation, setAskingLocation] = useState(false);

  useEffect(() => {
    if (userId) void fetchNotificationPrefs(userId).then(setPrefs).catch(() => null);
  }, [userId]);

  const readLocationState = useCallback(() => {
    void getPermissionState().then(setLocationState);
  }, []);

  // Se relee al volver a la app, no solo al montar: el camino más común para
  // conceder el permiso es salir a los Ajustes del sistema y volver, y en ese
  // viaje la pantalla nunca se desmonta ni pierde el foco.
  useEffect(() => {
    readLocationState();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') readLocationState();
    });
    return () => subscription.remove();
  }, [readLocationState]);

  const askLocation = async () => {
    setAskingLocation(true);
    try {
      // El orden lo exige el SO: primer plano antes que segundo plano.
      if ((await requestForegroundPermission()) === true) await requestBackgroundPermission();

      readLocationState();
      // Escribe el nivel nuevo y toma la primera posición si todavía no había.
      if (userId) await syncLocationPermission(userId);
      await refresh();
    } finally {
      setAskingLocation(false);
    }
  };

  // Mientras se lee el permiso del SO se muestra el último nivel conocido, para
  // que la tarjeta no parpadee en "Sin conceder" durante el primer render.
  const locationLevel = locationState?.level ?? mySettings?.locationPermissionLevel ?? 'none';
  const puedePreguntar = locationState?.canAskAgain ?? true;
  const sinUbicacion = myStatus?.latitude == null || myStatus?.longitude == null;

  const setAlertSetting = async (patch: { alertRadiusKm?: number; alertMinMagnitude?: number }) => {
    if (!userId) return;
    await updateMySettings(userId, patch);
    await syncMe(userId);
    await refresh();
  };

  const togglePref = async (key: keyof NotificationPrefs, value: boolean) => {
    if (!userId || !prefs) return;
    setPrefs({ ...prefs, [key]: value });
    try {
      await updateNotificationPrefs(userId, { [key]: value });
    } catch {
      setPrefs({ ...prefs, [key]: !value });
    }
  };

  const confirmSignOut = () => {
    Alert.alert('Cerrar sesión', 'Se borra la copia local de tus datos en este teléfono.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + TabBarExtraInset + Spacing.xl },
        ]}>
        <Text variant="title2">Ajustes</Text>

        <Card>
          {/* Todo el bloque de perfil abre el detalle de cuenta: es donde se
              editan nombre, foto y teléfono, y donde se ve el plan. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Ver y editar mi cuenta"
            onPress={() => router.push('/account')}
            style={({ pressed }) => [styles.profile, pressed ? styles.pressed : null]}>
            <Avatar
              displayName={myProfile?.displayName ?? '?'}
              avatarUrl={myProfile?.avatarUrl}
              size={56}
              status={null}
            />
            <View style={styles.flex}>
              <Text variant="headline" numberOfLines={1}>
                {myProfile?.displayName || 'Sin nombre'}
              </Text>
              <Text variant="footnote" tone="secondary">
                {formatE164ForDisplay(mySettings?.phoneE164 ?? null) || 'Sin teléfono registrado'}
              </Text>
              <Text variant="caption" tone="accent" weight="600" style={styles.gapTop}>
                {mySettings?.isPremium ? 'Premium' : 'Plan gratuito'}
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/action-plan')}
            style={({ pressed }) => [styles.linkRow, pressed ? styles.pressed : null]}>
            <MaterialIcons name="event-note" size={20} color={colors.textSecondary} />
            <Text variant="callout" style={styles.flex}>
              Mi plan de acción
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
          </Pressable>
        </Card>

        <Section title="CUÁNDO AVISARME DE UN SISMO">
          <Card padded={false}>
            <View style={styles.settingBlock}>
              <Text variant="callout" weight="500">
                Radio alrededor de tu ubicación
              </Text>
              <Text variant="footnote" tone="secondary">
                Te avisamos si tiembla dentro de este radio con magnitud{' '}
                {(mySettings?.alertMinMagnitude ?? 4.5).toFixed(1)} o más.
              </Text>
              <Segmented
                options={RADIUS_OPTIONS.map((km) => ({ value: km, label: `${km} km` }))}
                value={mySettings?.alertRadiusKm ?? 150}
                onChange={(km) => void setAlertSetting({ alertRadiusKm: km })}
              />
            </View>

            <View
              style={[
                styles.settingBlock,
                { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
              ]}>
              <Text variant="callout" weight="500">
                Magnitud mínima
              </Text>
              <Text variant="footnote" tone="secondary">
                Además, siempre te avisamos de cualquier sismo de magnitud{' '}
                {(mySettings?.alertCountrywideMagnitude ?? 6).toFixed(1)} o más en el país, sin
                importar dónde estés.
              </Text>
              <Segmented
                options={MAGNITUDE_OPTIONS.map((m) => ({ value: m, label: m.toFixed(1) }))}
                value={mySettings?.alertMinMagnitude ?? 4.5}
                onChange={(m) => void setAlertSetting({ alertMinMagnitude: m })}
              />
            </View>
          </Card>
        </Section>

        <Section title="NOTIFICACIONES">
          <Card padded={false}>
            {NOTIFICATION_LABELS.map((item, index) => (
              <View
                key={item.key}
                style={[
                  styles.switchRow,
                  index > 0
                    ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                    : null,
                ]}>
                <View style={styles.flex}>
                  <Text variant="callout">{item.title}</Text>
                  <Text variant="caption" tone="tertiary">
                    {item.detail}
                  </Text>
                </View>
                <Switch
                  value={prefs?.[item.key] ?? true}
                  onValueChange={(value) => void togglePref(item.key, value)}
                  disabled={prefs === null}
                />
              </View>
            ))}
          </Card>

          <Text variant="caption" tone="tertiary" style={styles.note}>
            No mandamos notificación por cada sismo que ocurre, ni cuando alguien marca que está
            bien. Solo por lo que necesitas saber.
          </Text>
        </Section>

        <Section title="PRÁCTICA">
          <Card>
            <Text variant="callout" weight="500">
              Simulacros completados
            </Text>
            <Text variant="footnote" tone="secondary" style={styles.gapTop}>
              {mySettings?.drillsCompleted ?? 0} de{' '}
              {mySettings?.isPremium ? 'ilimitados' : FREE_DRILL_LIMIT}
            </Text>
            <Pressable
              onPress={() => router.push('/drill')}
              accessibilityRole="button"
              style={({ pressed }) => [styles.gapTopLg, pressed ? styles.pressed : null]}>
              <Text variant="footnote" tone="accent" weight="600">
                Hacer un simulacro
              </Text>
            </Pressable>
          </Card>
        </Section>

        <Section title="PERMISOS">
          <Card>
            <View style={styles.permisoHeader}>
              <Text variant="callout" weight="500" style={styles.flex}>
                Ubicación
              </Text>
              <Text
                variant="footnote"
                weight="600"
                style={{
                  color:
                    locationLevel === 'background'
                      ? status.safe.strong
                      : locationLevel === 'foreground'
                        ? status.helping.strong
                        : colors.textTertiary,
                }}>
                {locationLevel === 'background'
                  ? 'Siempre'
                  : locationLevel === 'foreground'
                    ? 'Solo con la app abierta'
                    : 'Sin conceder'}
              </Text>
            </View>

            {/* La advertencia se muestra por FALTA DE POSICIÓN, no por falta de
                permiso. Son cosas distintas y la que rompe las alertas es la
                primera: conceder el permiso no guarda ninguna coordenada. */}
            {sinUbicacion ? (
              <View style={[styles.aviso, { backgroundColor: colors.surfaceSunken }]}>
                <MaterialIcons name="warning-amber" size={18} color={status.helping.strong} />
                <Text variant="footnote" tone="secondary" style={styles.flex}>
                  No tenemos tu ubicación, así que solo podemos avisarte de sismos de magnitud{' '}
                  {(mySettings?.alertCountrywideMagnitude ?? 6).toFixed(1)} o más en el país. Los
                  sismos cercanos —los que sí se sienten— no te van a alertar, y tu círculo no
                  puede ver dónde estabas.
                </Text>
              </View>
            ) : (
              <Text variant="footnote" tone="secondary">
                La ubicación se toma una sola vez, cuando ocurre un sismo en tu zona. La app nunca
                registra tu recorrido.
              </Text>
            )}

            {locationLevel === 'background' ? null : puedePreguntar ? (
              <Button
                title={locationLevel === 'none' ? 'Permitir ubicación' : 'Permitir siempre'}
                onPress={() => void askLocation()}
                loading={askingLocation}
                variant="secondary"
                style={styles.gapTopLg}
              />
            ) : (
              // El SO ya no vuelve a preguntar: un botón que abre un diálogo
              // inexistente sería peor que mandar directo a los Ajustes.
              <Pressable
                onPress={() => void Linking.openSettings()}
                accessibilityRole="button"
                style={({ pressed }) => [styles.gapTopLg, pressed ? styles.pressed : null]}>
                <Text variant="footnote" tone="accent" weight="600">
                  El sistema ya no vuelve a preguntar · actívalo en Ajustes
                </Text>
              </Pressable>
            )}
          </Card>
        </Section>

        <Card>
          <Text variant="caption" tone="tertiary">
            Todos Bien se ofrece tal cual, sin garantía de disponibilidad continua, y no
            reemplaza a los canales oficiales de emergencia: bomberos, PNP e INDECI.
          </Text>
        </Card>

        <Pressable
          onPress={confirmSignOut}
          accessibilityRole="button"
          style={({ pressed }) => [styles.signOut, pressed ? styles.pressed : null]}>
          <Text variant="callout" tone="danger" center weight="600">
            Cerrar sesión
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="caption" tone="secondary" weight="600" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Segmented<T extends number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.label}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            style={[
              styles.segment,
              selected ? { backgroundColor: colors.surface, borderColor: colors.border } : null,
            ]}>
            <Text variant="footnote" weight={selected ? '600' : '400'} center>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  flex: { flex: 1 },
  profile: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  linkRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
  },
  section: { gap: Spacing.sm },
  sectionTitle: { paddingHorizontal: Spacing.xs },
  settingBlock: { gap: Spacing.xs, padding: Spacing.lg },
  switchRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  segmented: {
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: 2,
    marginTop: Spacing.md,
    padding: 3,
  },
  segment: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
    flex: 1,
    paddingVertical: Spacing.sm,
  },
  note: { paddingHorizontal: Spacing.xs },
  gapTop: { marginTop: Spacing.xs },
  gapTopLg: { marginTop: Spacing.lg },
  permisoHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    marginBottom: Spacing.md,
  },
  aviso: {
    alignItems: 'flex-start',
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: Spacing.sm,
    padding: Spacing.md,
  },
  signOut: { paddingVertical: Spacing.md },
  pressed: { opacity: 0.6 },
});
