import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { PermissionsChecklist } from '@/components/permissions-checklist';
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
import { formatE164ForDisplay } from '@/lib/phone';
import { syncMe } from '@/lib/sync';
import { Radius, Spacing, tabScreenBottomInset } from '@/theme/tokens';
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
    key: 'connectionRequest',
    title: 'Solicitudes recibidas',
    detail: 'Alguien quiere sumarte a su círculo.',
  },
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
  {
    key: 'contactReported',
    title: 'Alguien reportó que está bien',
    detail: 'Un contacto reportó su estado en un sismo que también te alcanzó a ti.',
  },
];

/**
 * Noticias de sismos, que **no** son alertas (migración 0021).
 *
 * Se listan aparte de las de arriba porque responden a otra pregunta: aquellas
 * son sobre personas, estas sobre sismos que no te tocaron. La alerta de sismo
 * no aparece en ninguna de las dos listas y eso es deliberado — no es una
 * preferencia, es la razón por la que la app existe.
 */
const QUAKE_NEWS_LABELS: {
  key: 'quakeNational' | 'quakeWorldwide';
  title: string;
  detail: string;
  premium: boolean;
}[] = [
  {
    key: 'quakeNational',
    title: 'Sismos en el país',
    detail: 'De magnitud 4,5 o más en el Perú, que no te hayan disparado una alerta.',
    premium: false,
  },
  {
    key: 'quakeWorldwide',
    title: 'Sismos en el mundo',
    detail: 'De magnitud 6,0 o más en cualquier parte del planeta.',
    premium: true,
  },
];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, status } = useTheme();
  const { userId, signOut } = useAuth();
  const { myProfile, mySettings, myStatus, refresh } = useAppData();

  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);

  useEffect(() => {
    if (userId) void fetchNotificationPrefs(userId).then(setPrefs).catch(() => null);
  }, [userId]);

  // Leer y pedir permisos ya no vive acá: lo hace `PermissionsChecklist`, que
  // además los relee al volver de los Ajustes del sistema. Lo único que se
  // queda es esto, que **no es un permiso** sino la ausencia de una posición
  // guardada — puede seguir siendo cierto con todos los permisos concedidos.
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
          { paddingTop: insets.top + Spacing.md, paddingBottom: tabScreenBottomInset(insets.bottom) + Spacing.xl },
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
              Mis planes de acción
            </Text>
            <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
          </Pressable>

          {/* Acá y no en SEGURIDAD: es una lista de personas, como las dos filas
              de arriba. Y tiene que existir en algún lugar visible — un bloqueo
              que no se puede deshacer es una trampa, y la guía 1.2 de App Store
              pide poder administrarlo. */}
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/blocked')}
            style={({ pressed }) => [styles.linkRow, pressed ? styles.pressed : null]}>
            <MaterialIcons name="block" size={20} color={colors.textSecondary} />
            <Text variant="callout" style={styles.flex}>
              Personas bloqueadas
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

          {/* Este texto ya mintió dos veces, así que conviene explicar por qué.
              Nació diciendo «no mandamos notificación cuando alguien marca que
              está bien», y Guardián (0022) lo volvió falso. Se corrigió a «fuera
              de Guardián no avisamos», y la 0027 lo volvió falso otra vez: ahora
              el reporte de un contacto también avisa a quien el mismo sismo
              alcanzó, gratis. Regla para la próxima: la condición es *dónde
              estabas vos*, no *qué plan tenés*. */}
          <Text variant="caption" tone="tertiary" style={styles.note}>
            Si el sismo también te alcanzó a ti, te avisamos cuando alguien de tu círculo
            reporta cómo está. Si no te alcanzó, ese aviso es parte de Guardián.
          </Text>
        </Section>

        <Section title="GUARDIÁN">
          <Card padded={false}>
            <View style={styles.switchRow}>
              <View style={styles.flex}>
                <Text
                  variant="callout"
                  tone={mySettings?.isPremium ? 'primary' : 'tertiary'}>
                  Tembló cerca de mi gente
                </Text>
                <Text variant="caption" tone="tertiary">
                  {mySettings?.isPremium
                    ? 'Te avisamos apenas tiembla cerca de un contacto tuyo, estés donde estés, y otra vez cuando reporta que está bien.'
                    : 'Disponible con Premium.'}
                </Text>
              </View>
              <Switch
                value={mySettings?.isPremium ? (prefs?.guardianAlerts ?? true) : false}
                onValueChange={(value) => void togglePref('guardianAlerts', value)}
                disabled={prefs === null || !mySettings?.isPremium}
              />
            </View>
          </Card>

          {/* El límite se dice acá y no solo en el paywall: es la diferencia
              entre una función que no cubre a alguien y una que parece rota. */}
          <Text variant="caption" tone="tertiary" style={styles.note}>
            Solo alcanza a los contactos que tienen su ubicación activada. De quien no la dio no
            sabemos si el sismo le tocó cerca, y preferimos no decirlo antes que inventarlo.
          </Text>
        </Section>

        <Section title="NOTICIAS DE SISMOS">
          <Card padded={false}>
            {QUAKE_NEWS_LABELS.map((item, index) => {
              const bloqueado = item.premium && !mySettings?.isPremium;

              return (
                <View
                  key={item.key}
                  style={[
                    styles.switchRow,
                    index > 0
                      ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                      : null,
                  ]}>
                  <View style={styles.flex}>
                    <Text variant="callout" tone={bloqueado ? 'tertiary' : 'primary'}>
                      {item.title}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {bloqueado ? 'Disponible con Premium.' : item.detail}
                    </Text>
                  </View>
                  <Switch
                    value={bloqueado ? false : (prefs?.[item.key] ?? true)}
                    onValueChange={(value) => void togglePref(item.key, value)}
                    disabled={prefs === null || bloqueado}
                  />
                </View>
              );
            })}
          </Card>

          {/* La frase que evita el malentendido que originó todo esto: alguien
              que apaga estos dos podría creer que se quedó sin alertas. */}
          <Text variant="caption" tone="tertiary" style={styles.note}>
            Esto es informativo y podés apagarlo sin miedo: la alerta de un sismo que sí te toca
            llega siempre, y es igual en Premium que en la versión gratuita.
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
          <PermissionsChecklist />

          {/* Este aviso NO es por falta de permiso sino por **falta de
              posición**, que son cosas distintas: conceder el permiso no guarda
              ninguna coordenada. Por eso vive fuera de la lista de permisos,
              que podría estar toda en verde y esto seguir siendo cierto. */}
          {sinUbicacion ? (
            <Card>
              <View style={styles.aviso}>
                <MaterialIcons name="warning-amber" size={18} color={status.helping.strong} />
                <Text variant="footnote" tone="secondary" style={styles.flex}>
                  Todavía no tenemos ninguna posición tuya guardada, así que solo podemos avisarte
                  de sismos de magnitud {(mySettings?.alertCountrywideMagnitude ?? 6).toFixed(1)} o
                  más en el país. Los cercanos —los que sí se sienten— no te van a alertar.
                </Text>
              </View>
            </Card>
          ) : (
            <Text variant="caption" tone="tertiary" style={styles.note}>
              La ubicación se toma una vez al conceder el permiso, y después solo cuando hay un
              sismo en tu zona. La app nunca registra tu recorrido.
            </Text>
          )}
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
  // Sin padding ni fondo propios: ahora vive dentro de su propia `Card`, que ya
  // los pone. Antes era un recuadro hundido dentro de la tarjeta de Ubicación.
  aviso: { alignItems: 'flex-start', flexDirection: 'row', gap: Spacing.sm },
  signOut: { paddingVertical: Spacing.md },
  pressed: { opacity: 0.6 },
});
