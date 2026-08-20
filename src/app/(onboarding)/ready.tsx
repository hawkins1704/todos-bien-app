import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { ensureInitialLocation } from '@/lib/alert-response';
import { updateMySettings } from '@/lib/api';
import { syncPushToken } from '@/lib/notifications';
import { syncMe } from '@/lib/sync';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export default function OnboardingReadyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, status } = useTheme();
  const { userId, markOnboardingComplete } = useAuth();
  const { refresh } = useAppData();

  const [finishing, setFinishing] = useState<'drill' | 'home' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = async (next: 'drill' | 'home') => {
    if (!userId || finishing) return;
    setFinishing(next);
    setError(null);

    try {
      await updateMySettings(userId, { onboardingCompletedAt: new Date().toISOString() });

      // Red de seguridad: normalmente la posición ya se tomó al conceder el
      // permiso. Esto cubre el caso de que ahí no hubiera fix (sin señal,
      // permiso concedido después). Es idempotente.
      await ensureInitialLocation().catch(() => false);

      await syncMe(userId);

      // Sale sin ruido si falta el permiso o las credenciales. Si acá no queda
      // registrado, lo recoge el refresco (ver syncPushToken).
      await syncPushToken(userId).catch(() => false);

      markOnboardingComplete();
      await refresh();

      router.replace(next === 'drill' ? '/drill' : '/');
    } catch {
      setError('No pudimos terminar la configuración. Revisa tu conexión.');
      setFinishing(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xxl, paddingBottom: insets.bottom + Spacing.xl },
        ]}>
        <View style={[styles.hero, { backgroundColor: status.safe.soft }]}>
          <MaterialIcons name="check-circle" size={56} color={status.safe.base} />
        </View>

        <Text variant="title" center>
          Ya está todo listo
        </Text>
        <Text variant="body" tone="secondary" center>
          Ahora la parte que de verdad importa: practicarlo una vez, sin apuro, para que el día
          que pase no sea la primera vez que ves esta pantalla.
        </Text>

        <Card>
          <View style={styles.cardHeader}>
            <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
              <MaterialIcons name="school" size={22} color={colors.accent} />
            </View>
            <Text variant="headline" style={styles.flex}>
              Tu primer simulacro
            </Text>
          </View>

          <Text variant="subhead" tone="secondary" style={styles.cardBody}>
            Es un recorrido completo: llega la alerta, reportas tu estado y ves el dashboard tal
            como se vería de verdad. Todo va marcado como SIMULACRO, y puedes hacerlo en modo
            silencioso para no avisarle a nadie.
          </Text>
        </Card>

        {error ? (
          <Text variant="footnote" tone="danger" center>
            {error}
          </Text>
        ) : null}

        <Button
          title="Hacer el simulacro"
          onPress={() => void finish('drill')}
          loading={finishing === 'drill'}
          disabled={finishing !== null}
          size="lg"
        />

        <Button
          title="Después, llévame a la app"
          onPress={() => void finish('home')}
          loading={finishing === 'home'}
          disabled={finishing !== null}
          variant="ghost"
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    height: 108,
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    width: 108,
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  cardBody: { marginTop: Spacing.md },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  flex: { flex: 1 },
});
