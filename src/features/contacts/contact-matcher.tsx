import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Share, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { matchContacts, requestConnection } from '@/lib/api';
import { shareAppMessage } from '@/lib/config';
import {
  buildHashEntries,
  getContactsPermission,
  readDeviceContacts,
  requestContactsPermission,
} from '@/lib/contacts';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { ContactMatch } from '@/types/domain';

type Phase = 'idle' | 'denied' | 'scanning' | 'done';

/**
 * Flujo de detección de contactos (spec §3).
 *
 * Es el MISMO componente en el onboarding y en "agregar contactos" desde la app
 * ya andando, como pide la spec: un solo flujo, no dos implementaciones.
 */
export function ContactMatcher({ onChanged }: { onChanged?: () => void }) {
  const { colors, status } = useTheme();
  const { myProfile, refresh } = useAppData();

  const [phase, setPhase] = useState<Phase>('idle');
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [scanned, setScanned] = useState(0);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(async () => {
    setError(null);

    const alreadyGranted = await getContactsPermission();
    const granted = alreadyGranted || (await requestContactsPermission());

    if (!granted) {
      setPhase('denied');
      return;
    }

    setPhase('scanning');

    try {
      const contacts = await readDeviceContacts();
      setScanned(contacts.length);

      const entries = await buildHashEntries(contacts);
      const found = await matchContacts(
        entries.map((e) => ({ hash: e.hash, localName: e.localName })),
      );

      setMatches(found);
      setPhase('done');
    } catch (caught) {
      // El `catch` mudo que había acá fue medio bug: la pantalla decía "intenta
      // de nuevo" ante un fallo que no se arreglaba reintentando nunca, y el
      // motivo no aparecía en ningún lado del cliente.
      console.warn('[contactos] falló la revisión de la agenda', caught);
      setError('No pudimos revisar tu agenda. Intenta de nuevo.');
      setPhase('idle');
    }
  }, []);

  const connect = async (match: ContactMatch) => {
    setSending(match.userId);
    try {
      await requestConnection(match.userId);
      setSent((current) => new Set(current).add(match.userId));
      await refresh();
      onChanged?.();
    } catch {
      setError('No se pudo enviar la solicitud. Revisa tu conexión.');
    } finally {
      setSending(null);
    }
  };

  /**
   * Compartir la app, sin código de invitación.
   *
   * No hay nada que pedirle al servidor: el vínculo lo resuelve el match de
   * agenda cuando la otra persona se registra con su número, así que compartir
   * es solo el empujón para que la instale. Antes esto generaba un código y
   * podía fallar por red; ahora no puede fallar.
   */
  const shareApp = async () => {
    await Share.share({
      message: shareAppMessage(myProfile?.displayName || 'Alguien'),
    });
  };

  const pending = matches.filter((m) => m.connectionStatus === null && !sent.has(m.userId));
  const already = matches.filter((m) => m.connectionStatus !== null || sent.has(m.userId));

  return (
    <View style={styles.wrapper}>
      {phase === 'idle' ? (
        <Card>
          <View style={[styles.icon, { backgroundColor: colors.accentSoft }]}>
            <MaterialIcons name="contacts" size={24} color={colors.accent} />
          </View>

          <Text variant="headline" style={styles.gapTop}>
            Busca quién de tu agenda ya usa la app
          </Text>
          <Text variant="subhead" tone="secondary" style={styles.gapTopSm}>
            Antes de que el teléfono te pregunte: cada número de tu agenda se convierte en un
            código irreversible{' '}
            <Text variant="subhead" weight="700">
              dentro de tu propio teléfono
            </Text>
            . Lo único que enviamos son esos códigos. Tu lista de contactos nunca se sube ni se
            guarda en nuestros servidores.
          </Text>

          <Button
            title="Revisar mi agenda"
            onPress={() => void scan()}
            variant="secondary"
            style={styles.gapTopLg}
          />
        </Card>
      ) : null}

      {phase === 'denied' ? (
        <Card>
          <Text variant="headline">Sin acceso a la agenda</Text>
          <Text variant="subhead" tone="secondary" style={styles.gapTopSm}>
            Sin este permiso no podemos decirte quiénes de tu agenda ya usan la app. Todavía
            puedes conectarte: comparte la app, y quien la instale te va a encontrar por tu
            número y podrá enviarte la solicitud.
          </Text>
          <Pressable
            onPress={() => void Linking.openSettings()}
            accessibilityRole="button"
            style={({ pressed }) => [styles.gapTop, pressed ? styles.pressed : null]}>
            <Text variant="footnote" tone="accent" weight="600">
              Abrir Ajustes para permitirlo
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {phase === 'scanning' ? (
        <Card>
          <View style={styles.scanning}>
            <ActivityIndicator color={colors.accent} />
            <Text variant="callout" tone="secondary">
              {scanned > 0 ? `Procesando ${scanned} contactos…` : 'Leyendo tu agenda…'}
            </Text>
          </View>
        </Card>
      ) : null}

      {phase === 'done' ? (
        <>
          {pending.length > 0 ? (
            <Card padded={false}>
              <Text variant="headline" style={styles.listHeader}>
                Ya usan Todos Bien
              </Text>

              {pending.map((match, index) => (
                <View
                  key={match.userId}
                  style={[
                    styles.row,
                    index > 0
                      ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                      : null,
                  ]}>
                  <Avatar
                    displayName={match.displayName}
                    size={40}
                    status={null}
                  />
                  <View style={styles.rowCopy}>
                    <Text variant="callout" weight="500" numberOfLines={1}>
                      {match.displayName}
                    </Text>
                    {match.localName !== match.displayName ? (
                      <Text variant="caption" tone="tertiary" numberOfLines={1}>
                        En tu agenda: {match.localName}
                      </Text>
                    ) : null}
                  </View>
                  <Button
                    title="Agregar"
                    onPress={() => void connect(match)}
                    loading={sending === match.userId}
                    variant="secondary"
                    fullWidth={false}
                  />
                </View>
              ))}
            </Card>
          ) : (
            <Card>
              <Text variant="headline">Ninguno de tus contactos la tiene todavía</Text>
              <Text variant="subhead" tone="secondary" style={styles.gapTopSm}>
                Es normal al principio. Invita a las personas que más te importan: la app solo
                sirve si ellas también están.
              </Text>
            </Card>
          )}

          {already.length > 0 ? (
            <Card padded={false}>
              <Text variant="footnote" tone="secondary" weight="600" style={styles.listHeader}>
                YA CONECTADOS O CON SOLICITUD ENVIADA
              </Text>
              {/*
                A quien bloqueaste se le pone etiqueta propia. Antes caía en
                esta lista con el mismo tilde verde que un contacto aceptado,
                así que veías a alguien que bloqueaste listado como si
                estuvieran conectados.

                Del OTRO lado no hay etiqueta y no puede haberla: `blockedByMe`
                solo llega en `true` a quien bloqueó (ver `match-contacts`).
                Quien fue bloqueado sigue viendo la fila genérica, sin razón —
                un bloqueo que se anuncia no protege, invita a buscar otra vía.
              */}
              {already.map((match) => (
                <View key={match.userId} style={styles.row}>
                  <Avatar
                    displayName={match.displayName}
                    size={32}
                    status={null}
                    dimmed={match.blockedByMe}
                  />
                  <View style={styles.rowCopy}>
                    <Text variant="subhead" numberOfLines={1}>
                      {match.displayName}
                    </Text>
                    {match.blockedByMe ? (
                      <Text variant="caption" tone="tertiary">
                        Lo bloqueaste · puedes deshacerlo en Ajustes
                      </Text>
                    ) : null}
                  </View>
                  {match.blockedByMe ? (
                    <MaterialIcons name="block" size={20} color={colors.textTertiary} />
                  ) : (
                    <MaterialIcons name="check" size={20} color={status.safe.base} />
                  )}
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      <Card>
        <Text variant="headline">Invitar a alguien que no la tiene</Text>
        <Text variant="subhead" tone="secondary" style={styles.gapTopSm}>
          Comparte la app por WhatsApp, mensaje o correo. Cuando la instale y se registre con su
          número, aparece acá al revisar tu agenda y le envías la solicitud.
        </Text>
        <Button
          title="Compartir Todos Bien"
          icon="ios-share"
          onPress={() => void shareApp()}
          variant="secondary"
          style={styles.gapTopLg}
        />
      </Card>

      {error ? (
        <Text variant="footnote" tone="danger" center>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.lg },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  gapTop: { marginTop: Spacing.md },
  gapTopSm: { marginTop: Spacing.xs },
  gapTopLg: { marginTop: Spacing.lg },
  scanning: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  listHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowCopy: { flex: 1, gap: 1 },
  pressed: { opacity: 0.6 },
});
