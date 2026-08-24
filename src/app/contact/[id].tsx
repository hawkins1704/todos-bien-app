import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { DrillBanner } from '@/components/drill-banner';
import { LocationMap } from '@/components/location-map';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { blockConnection, removeConnection } from '@/lib/api';
import { openDirectConversation } from '@/lib/chat';
import { readCircleMember } from '@/lib/db/circle';
import { formatAccuracy, formatCoords, timeAgo } from '@/lib/format';
import { mapsUrl } from '@/lib/location';
import { effectiveStatus, isAlertActive } from '@/lib/quakes';
import { Spacing, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { CircleMember } from '@/types/domain';

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { activeQuake, refresh } = useAppData();

  const [member, setMember] = useState<CircleMember | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (id) void readCircleMember(id).then(setMember);
  }, [id]);

  if (!member) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.loading}>
          <Text variant="callout" tone="tertiary">
            Cargando…
          </Text>
        </View>
      </Screen>
    );
  }

  const alertActive = isAlertActive(activeQuake);
  const status = effectiveStatus(member, alertActive ? (activeQuake?.id ?? null) : null) as StatusKey;
  const hasLocation = member.latitude != null && member.longitude != null;

  const openChat = async () => {
    setOpening(true);
    try {
      const conversationId = await openDirectConversation(member.userId);
      router.push(`/chat/${conversationId}`);
    } catch {
      Alert.alert('No se pudo abrir el chat', 'Revisa tu conexión e intenta de nuevo.');
    } finally {
      setOpening(false);
    }
  };

  const confirmRemove = () => {
    Alert.alert(
      `Quitar a ${member.displayName}`,
      'Dejan de verse el estado y la ubicación mutuamente. Pueden volver a agregarse después.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: () => {
            void removeConnection(member.connectionId)
              .then(refresh)
              .then(() => router.back());
          },
        },
      ],
    );
  };

  /**
   * Bloquear es lo que hay que ofrecer cuando quitar no alcanza. El texto dice
   * las tres consecuencias porque las tres son distintas de "quitar", y la del
   * chat es la que nadie se imagina: quitar el vínculo **no** cerraba la
   * conversación que ya existía.
   */
  const confirmBlock = () => {
    Alert.alert(
      `Bloquear a ${member.displayName}`,
      'No va a poder escribirte ni volver a enviarte una solicitud, y dejan de verse el estado y la ubicación. Puedes desbloquearla cuando quieras desde Ajustes.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Bloquear',
          style: 'destructive',
          onPress: () => {
            void blockConnection(member.userId)
              .then(refresh)
              .then(() => router.back())
              .catch(() =>
                Alert.alert('No se pudo bloquear', 'Revisa tu conexión e intenta de nuevo.'),
              );
          },
        },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: member.displayName }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <View style={styles.hero}>
          <Avatar
            displayName={member.displayName}
            size={92}
            status={alertActive ? status : null}
          />
          <Text variant="title2" center>
            {member.displayName}
          </Text>

          {alertActive ? <StatusChip status={status} /> : null}

          {member.isDrill ? <DrillBanner compact /> : null}

          {member.reportedAt ? (
            <Text variant="footnote" tone="tertiary">
              Reportó {timeAgo(member.reportedAt)}
            </Text>
          ) : null}
        </View>

        {member.statusMessage ? (
          <Card>
            <Text variant="footnote" tone="secondary" weight="600">
              SU MENSAJE
            </Text>
            <Text variant="body" style={styles.gapTop}>
              “{member.statusMessage}”
            </Text>
          </Card>
        ) : null}

        <Card>
          <Text variant="footnote" tone="secondary" weight="600">
            ÚLTIMA UBICACIÓN REGISTRADA
          </Text>

          {hasLocation ? (
            <>
              <Text variant="body" style={styles.gapTop}>
                {formatCoords(member.latitude!, member.longitude!)}
              </Text>
              <Text variant="footnote" tone="tertiary">
                {timeAgo(member.locationAt)} {formatAccuracy(member.locationAccuracyM)}
              </Text>

              {/*
                Encuadre cerrado, al revés que el del epicentro: acá la pregunta
                no es "a qué distancia pasó" sino "en qué cuadra está", y a esa
                escala el nombre de la calle es la respuesta. Quién mira esto ya
                sabe en qué ciudad vive la persona.
              */}
              <LocationMap
                latitude={member.latitude!}
                longitude={member.longitude!}
                spanKm={3}
                label={`Última ubicación de ${member.displayName}`}
                height={150}
                style={styles.gapTop}
              />

              <View style={styles.locationActions}>
                <Button
                  title="Abrir en Maps"
                  icon="map"
                  variant="secondary"
                  onPress={() =>
                    void Linking.openURL(
                      mapsUrl(
                        member.latitude!,
                        member.longitude!,
                        `Última ubicación de ${member.displayName}`,
                      ),
                    )
                  }
                  style={styles.flex}
                />
                <Pressable
                  onPress={() =>
                    void Clipboard.setStringAsync(
                      `${member.latitude},${member.longitude}`,
                    )
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Copiar coordenadas"
                  style={({ pressed }) => [
                    styles.copyButton,
                    { borderColor: colors.border },
                    pressed ? styles.pressed : null,
                  ]}>
                  <MaterialIcons name="content-copy" size={20} color={colors.textSecondary} />
                </Pressable>
              </View>
            </>
          ) : (
            <Text variant="subhead" tone="tertiary" style={styles.gapTop}>
              Todavía no hay ubicación registrada de esta persona.
            </Text>
          )}
        </Card>

        <Card>
          <Text variant="footnote" tone="secondary" weight="600">
            SU PLAN DE ACCIÓN
          </Text>
          {member.actionPlan?.trim() ? (
            <>
              <Text variant="body" style={styles.gapTop}>
                {member.actionPlan}
              </Text>
              <Text variant="caption" tone="tertiary" style={styles.gapTop}>
                Actualizado {timeAgo(member.actionPlanUpdatedAt)}
              </Text>
            </>
          ) : (
            <Text variant="subhead" tone="tertiary" style={styles.gapTop}>
              Todavía no escribió su plan.
            </Text>
          )}
        </Card>

        <Button title="Abrir chat" icon="chat" onPress={() => void openChat()} loading={opening} />

        {/* Denunciar y quitar, juntos y en ese orden: quien llega hasta acá
            buscando cortar el contacto tiene las dos salidas a la vista, que es
            lo que pide la guía 1.2 de App Store. */}
        <Pressable
          onPress={() =>
            router.push({
              pathname: '/report',
              params: { userId: member.userId, name: member.displayName },
            })
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.remove, pressed ? styles.pressed : null]}>
          <Text variant="footnote" tone="secondary" center weight="600">
            Denunciar a esta persona
          </Text>
        </Pressable>

        <Pressable
          onPress={confirmRemove}
          accessibilityRole="button"
          style={({ pressed }) => [styles.remove, pressed ? styles.pressed : null]}>
          <Text variant="footnote" tone="danger" center weight="600">
            Quitar de mi círculo
          </Text>
        </Pressable>

        <Pressable
          onPress={confirmBlock}
          accessibilityRole="button"
          style={({ pressed }) => [styles.remove, pressed ? styles.pressed : null]}>
          <Text variant="footnote" tone="danger" center weight="600">
            Bloquear a esta persona
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: Spacing.sm },
  gapTop: { marginTop: Spacing.xs },
  locationActions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  flex: { flex: 1 },
  copyButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    width: 48,
  },
  remove: { paddingVertical: Spacing.md },
  pressed: { opacity: 0.6 },
});
