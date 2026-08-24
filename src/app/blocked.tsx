import { Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { getBlocked, unblockConnection, type BlockedPerson } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Personas bloqueadas.
 *
 * Existe por dos motivos y los dos importan. El de producto: un bloqueo que no
 * se puede deshacer es una trampa, y bloquear por error en un momento malo es
 * exactamente lo que va a pasar. El de revisión: la guía 1.2 de App Store pide
 * poder bloquear, y un revisor busca dónde se administra eso.
 *
 * La lista se pide al servidor y no sale de la caché local a propósito: un
 * bloqueado **no está en el círculo**, así que no vive en SQLite. Y por eso
 * `get_blocked()` es security definer — la política de `profiles` solo deja ver
 * a los contactos aceptados, y sin eso la lista mostraría nombres vacíos.
 */
export default function BlockedScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { refresh } = useAppData();

  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setPeople(await getBlocked());
      setError(null);
    } catch {
      setError('No pudimos cargar la lista. Revisa tu conexión.');
    }
  }, []);

  useEffect(() => {
    // `load()` arranca con una llamada al servidor, así que el setState cae en
    // un microtask posterior y no en el cuerpo del efecto — el mismo caso que
    // el chat, con la misma excepción.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const confirmUnblock = (person: BlockedPerson) => {
    Alert.alert(
      `Desbloquear a ${person.displayName}`,
      'Va a poder enviarte una solicitud de nuevo. No vuelven a conectarse solos: tendrías que aceptarla.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desbloquear',
          onPress: () => {
            setWorking(person.userId);
            void unblockConnection(person.userId)
              .then(load)
              .then(refresh)
              .catch(() =>
                Alert.alert('No se pudo desbloquear', 'Revisa tu conexión e intenta de nuevo.'),
              )
              .finally(() => setWorking(null));
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Personas bloqueadas' }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        {people === null ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : people.length === 0 ? (
          <Card>
            <Text variant="headline">No bloqueaste a nadie</Text>
            <Text variant="subhead" tone="secondary" style={styles.gapTop}>
              Si alguna vez lo necesitas, está en el perfil de la persona dentro de tu círculo, y
              también al terminar de enviar una denuncia.
            </Text>
          </Card>
        ) : (
          <Card padded={false}>
            {people.map((person, index) => (
              <View
                key={person.userId}
                style={[
                  styles.row,
                  index > 0
                    ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                    : null,
                ]}>
                <Avatar displayName={person.displayName} size={40} status={null} />
                <View style={styles.rowCopy}>
                  <Text variant="callout" weight="500" numberOfLines={1}>
                    {person.displayName}
                  </Text>
                  {person.blockedAt ? (
                    <Text variant="caption" tone="tertiary">
                      Bloqueada {timeAgo(person.blockedAt)}
                    </Text>
                  ) : null}
                </View>
                <Button
                  title="Desbloquear"
                  variant="secondary"
                  fullWidth={false}
                  loading={working === person.userId}
                  onPress={() => confirmUnblock(person)}
                />
              </View>
            ))}
          </Card>
        )}

        {people && people.length > 0 ? (
          <Text variant="footnote" tone="secondary">
            Mientras estén bloqueadas no pueden escribirte, no pueden enviarte solicitudes y no ven
            tu estado ni tu ubicación.
          </Text>
        ) : null}

        {error ? (
          <Text variant="footnote" tone="danger" center>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  center: { alignItems: 'center', paddingVertical: Spacing.xl },
  gapTop: { marginTop: Spacing.xs },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowCopy: { flex: 1, gap: 1 },
});
