import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { OnboardingStep } from '@/components/onboarding-step';
import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAuth } from '@/context/auth';
import { updateMyProfile, updateMySettings } from '@/lib/api';
import { KV, kvGet } from '@/lib/db/kv';
import { normalizeAndHash } from '@/lib/phone';
import { syncMe } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { MyProfile } from '@/types/domain';

export default function OnboardingProfileScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void kvGet<MyProfile>(KV.myProfile).then((profile) => {
      if (profile?.displayName) setDisplayName(profile.displayName);
      if (profile?.avatarUrl) setAvatarUrl(profile.avatarUrl);
    });
  }, []);

  const nameOk = displayName.trim().length >= 2;

  const pickAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });

    if (!result.canceled && result.assets[0]) setAvatarUrl(result.assets[0].uri);
  };

  const submit = async () => {
    if (!nameOk || !userId || saving) return;

    setSaving(true);
    setError(null);

    try {
      await updateMyProfile(userId, { displayName: displayName.trim(), avatarUrl });

      const trimmedPhone = phone.trim();
      if (trimmedPhone) {
        const normalized = await normalizeAndHash(trimmedPhone, 'PE');
        if (!normalized) {
          setError('Ese número no parece válido. Revísalo o déjalo en blanco por ahora.');
          setSaving(false);
          return;
        }
        // El hash es lo que permite que te encuentren tus contactos y que se
        // resuelvan las invitaciones que te mandaron antes de instalar la app.
        await updateMySettings(userId, {
          phoneE164: normalized.e164,
          phoneHash: normalized.hash,
        });
      }

      await syncMe(userId);
      router.push('/permissions');
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
    <Screen tone="plain">
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
          ]}
          keyboardShouldPersistTaps="handled">
          <OnboardingStep
            step={1}
            title="¿Cómo te van a ver?"
            subtitle="Tu círculo te va a reconocer por este nombre y esta foto."
          />

          <Pressable
            onPress={() => void pickAvatar()}
            accessibilityRole="button"
            accessibilityLabel="Elegir foto de perfil"
            style={({ pressed }) => [styles.avatarPicker, pressed ? styles.pressed : null]}>
            <Avatar
              displayName={displayName || '?'}
              avatarUrl={avatarUrl}
              size={92}
              status={null}
            />
            <Text variant="footnote" tone="accent" weight="600">
              {avatarUrl ? 'Cambiar foto' : 'Agregar foto (opcional)'}
            </Text>
          </Pressable>

          <View style={styles.field}>
            <Text variant="footnote" tone="secondary" weight="600">
              NOMBRE
            </Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
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
          </View>

          <View style={styles.field}>
            <Text variant="footnote" tone="secondary" weight="600">
              TELÉFONO
            </Text>
            <TextInput
              value={phone}
              onChangeText={(text) => {
                setPhone(text);
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
              irreversible, nunca como número visible para otras personas.
            </Text>
          </View>

          {error ? (
            <Text variant="footnote" tone="danger">
              {error}
            </Text>
          ) : null}

          <Button
            title="Continuar"
            onPress={() => void submit()}
            disabled={!nameOk}
            loading={saving}
            size="lg"
            style={styles.cta}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  avatarPicker: { alignItems: 'center', gap: Spacing.sm },
  field: { gap: Spacing.xs },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: 17,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  cta: { marginTop: Spacing.sm },
  pressed: { opacity: 0.7 },
});
