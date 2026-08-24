import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { SubscriptionManager } from '@/components/subscription-manager';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { updateMyProfile, updateMySettings } from '@/lib/api';
import { formatE164ForDisplay, normalizeAndHash } from '@/lib/phone';
import { syncMe } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Detalle de la cuenta: los datos que el onboarding pide una sola vez pero que
 * después no había forma de cambiar (nombre y teléfono), más el plan.
 */
export default function AccountScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { myProfile, mySettings, refresh } = useAppData();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Lo guardado se deriva en cada render y solo se guarda en estado lo EDITADO
  // (`undefined` = sin tocar). Así los campos se llenan solos cuando terminan de
  // cargar los datos, pero un sync de fondo no pisa lo que la persona escribió.
  const guardado = {
    name: myProfile?.displayName ?? '',
    phone: formatE164ForDisplay(mySettings?.phoneE164 ?? null),
  };

  const [nameEdit, setNameEdit] = useState<string>();
  const [phoneEdit, setPhoneEdit] = useState<string>();

  const displayName = nameEdit ?? guardado.name;
  const phone = phoneEdit ?? guardado.phone;

  const nameOk = displayName.trim().length >= 2;
  const cambiado = displayName !== guardado.name || phone !== guardado.phone;

  const isPremium = mySettings?.isPremium ?? false;

  const guardar = async () => {
    if (!nameOk || !userId || saving) return;

    setSaving(true);
    setError(null);

    try {
      await updateMyProfile(userId, { displayName: displayName.trim() });

      const escrito = phone.trim();

      if (!escrito) {
        // Vaciar el campo borra el número de verdad. Es una decisión con
        // consecuencia real (deja de aparecer en la agenda de otros), por eso
        // el campo lo dice y no se hace en silencio.
        if (mySettings?.phoneE164) {
          await updateMySettings(userId, { phoneE164: null, phoneHash: null });
        }
      } else {
        const normalizado = await normalizeAndHash(escrito, mySettings?.countryCode ?? 'PE');
        if (!normalizado) {
          setError('Ese número no parece válido. Revísalo o déjalo en blanco.');
          setSaving(false);
          return;
        }
        // Solo se escribe si de verdad cambió: reescribir el hash por nada haría
        // pasar al usuario por el índice único de `phone_hash` sin motivo.
        if (normalizado.e164 !== mySettings?.phoneE164) {
          await updateMySettings(userId, {
            phoneE164: normalizado.e164,
            phoneHash: normalizado.hash,
          });
        }
      }

      await syncMe(userId);
      await refresh();
      router.back();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      setError(
        message.includes('duplicate') || message.includes('user_settings_phone_hash_key')
          ? 'Ese número ya está registrado en otra cuenta.'
          : 'No pudimos guardar tus datos. Revisa tu conexión.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Mi cuenta' }} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + Spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <View style={styles.avatarPreview}>
            <Avatar displayName={displayName || '?'} size={92} status={null} />
          </View>

          <View style={styles.field}>
            <Text variant="footnote" tone="secondary" weight="600">
              NOMBRE
            </Text>
            <TextInput
              value={displayName}
              onChangeText={(text) => {
                setNameEdit(text);
                setError(null);
              }}
              placeholder="María Fernández"
              placeholderTextColor={colors.textTertiary}
              autoCapitalize="words"
              autoComplete="name"
              maxLength={60}
              accessibilityLabel="Nombre"
              style={[
                styles.input,
                { backgroundColor: colors.surfaceSunken, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Text variant="caption" tone="tertiary">
              Así te ve tu círculo.
            </Text>
          </View>

          <View style={styles.field}>
            <Text variant="footnote" tone="secondary" weight="600">
              TELÉFONO
            </Text>
            <TextInput
              value={phone}
              onChangeText={(text) => {
                setPhoneEdit(text);
                setError(null);
              }}
              placeholder="987 654 321"
              placeholderTextColor={colors.textTertiary}
              keyboardType="phone-pad"
              inputMode="tel"
              autoComplete="tel"
              accessibilityLabel="Número de teléfono"
              style={[
                styles.input,
                { backgroundColor: colors.surfaceSunken, borderColor: colors.border, color: colors.text },
              ]}
            />
            <Text variant="caption" tone="tertiary">
              Sirve para que tus contactos te encuentren. Se guarda convertido en un código
              irreversible, nunca como número visible para otras personas. Si lo dejas en blanco
              dejarán de encontrarte por número.
            </Text>
          </View>

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Guardar cambios"
            onPress={() => void guardar()}
            disabled={!nameOk || !cambiado}
            loading={saving}
            size="lg"
          />

          <View style={styles.seccion}>
            <Text variant="caption" tone="secondary" weight="600" style={styles.seccionTitulo}>
              SUSCRIPCIÓN
            </Text>

            <Card>
              <View style={styles.plan}>
                <View
                  style={[
                    styles.planIcon,
                    { backgroundColor: isPremium ? colors.accentSoft : colors.surfaceSunken },
                  ]}>
                  <MaterialIcons
                    name={isPremium ? 'workspace-premium' : 'lock-open'}
                    size={22}
                    color={isPremium ? colors.accent : colors.textSecondary}
                  />
                </View>
                <View style={styles.flex}>
                  <Text variant="headline">
                    {isPremium ? 'Todos Bien Premium' : 'Plan gratuito'}
                  </Text>
                  <Text variant="footnote" tone="secondary">
                    {isPremium
                      ? 'Tu suscripción está activa.'
                      : 'Estás usando la versión gratuita.'}
                  </Text>
                </View>
              </View>

              <View style={styles.ctaGap}>
                <SubscriptionManager />
              </View>
            </Card>
          </View>

          <View style={styles.seccion}>
            <Text variant="caption" tone="secondary" weight="600" style={styles.seccionTitulo}>
              SEGURIDAD
            </Text>

            <Card padded={false}>
              <FilaAccion
                icon="key"
                titulo="Cambiar contraseña"
                onPress={() => router.push('/change-password')}
              />
              {/* Borrar la cuenta va acá, visible y sin esconderse detrás de un
                  correo de soporte: la guía 5.1.1(v) de Apple pide que se pueda
                  hacer desde adentro de la app, y esconderlo es causal de
                  rechazo tanto como no tenerlo. */}
              <FilaAccion
                icon="delete-forever"
                titulo="Borrar mi cuenta"
                destructivo
                primera={false}
                onPress={() => router.push('/delete-account')}
              />
            </Card>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

/** Fila de acción dentro de una Card, con chevron. */
function FilaAccion({
  icon,
  titulo,
  onPress,
  destructivo = false,
  primera = true,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  titulo: string;
  onPress: () => void;
  destructivo?: boolean;
  primera?: boolean;
}) {
  const { colors } = useTheme();
  const color = destructivo ? colors.danger : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.fila,
        primera ? null : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
        pressed ? { backgroundColor: colors.surfaceSunken } : null,
      ]}>
      <MaterialIcons name={icon} size={22} color={color} />
      <Text variant="callout" weight="500" style={[styles.flex, { color }]}>
        {titulo}
      </Text>
      <MaterialIcons name="chevron-right" size={20} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  avatarPreview: { alignItems: 'center' },
  fila: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  field: { gap: Spacing.xs },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: 17,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  seccion: { gap: Spacing.sm, marginTop: Spacing.sm },
  seccionTitulo: { paddingHorizontal: Spacing.xs },
  plan: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  planIcon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  ctaGap: { marginTop: Spacing.lg },
});
