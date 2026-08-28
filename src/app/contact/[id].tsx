import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
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
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { blockConnection, removeConnection } from '@/lib/api';
import { openDirectConversation } from '@/lib/chat';
import { readCircleMember } from '@/lib/db/circle';
import { formatAccuracy, formatCoords, isOlderThan, timeAgo } from '@/lib/format';
import { mapsUrl } from '@/lib/location';
import { effectiveStatus, isAlertActive, liveQuakeStatus } from '@/lib/quakes';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { ACTIVE_ALERT_WINDOW_MS, type CircleMember } from '@/types/domain';

export default function ContactDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { activeQuake, refresh, lastCircleSync } = useAppData();
  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const [member, setMember] = useState<CircleMember | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [opening, setOpening] = useState(false);

  // `lastCircleSync` en las dependencias es lo que arregla la ficha congelada:
  // antes esto leía la caché UNA vez al montar y no se volvía a enterar de
  // nada. Aunque la app sincronizara de fondo —al volver del segundo plano, al
  // tirar de la lista, al recibir un push— esta pantalla seguía pintando el
  // estado y la ubicación con los que se abrió. Con la marca de la última
  // sincronización como dependencia, cada sync relee la fila local.
  useEffect(() => {
    if (!id) return;
    void readCircleMember(id).then((fila) => {
      setMember(fila);
      setBuscado(true);
    });
  }, [id, lastCircleSync]);

  // Y al abrir la ficha se pide al servidor, en vez de confiar en lo cacheado:
  // se entra acá justo cuando se quiere saber cómo está alguien AHORA, que es
  // el único momento en que el dato viejo estorba de verdad.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  // «Cargando…» y «ya no está en tu círculo» se veían igual, y son cosas
  // distintas: la segunda pasa al bloquear o quitar a alguien desde el otro
  // teléfono, y dejaba la ficha con un spinner eterno esperando algo que no iba
  // a llegar nunca. `buscado` distingue «todavía no leí la caché» de «la leí y
  // esta persona no está».
  if (!member) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.loading}>
          <Text variant="callout" tone="tertiary" center>
            {buscado ? 'Esta persona ya no está en tu círculo.' : 'Cargando…'}
          </Text>
        </View>
      </Screen>
    );
  }

  const alertActive = isAlertActive(activeQuake);
  const status = effectiveStatus(member, alertActive ? (activeQuake?.id ?? null) : null);
  // `null` con alerta activa = el sismo no le llegó a esta persona. Es la ficha
  // que se abre desde el aviso de Guardián, así que la distinción importa: no
  // es lo mismo «todavía no reporta» que «no le tocó» (migración 0025).
  const fueraDeLaZona = alertActive && status === null;

  // Pasadas las 6 horas, el estado y la ubicación dejan de ser información y
  // pasan a ser historia. «En casa y todos bien» de hace tres días no dice nada
  // de cómo está esa persona hoy, y una coordenada de hace tres días es lo
  // contrario de lo que promete la app: acá no se guarda dónde anda la gente,
  // se guarda dónde estaba cuando hubo un sismo. Mostrarla fuera de ese momento
  // convierte la ficha en un historial de paradero.
  //
  // Durante una alerta propia el estado se muestra siempre, aunque no haya
  // reportado: ahí «sin confirmar» ES la información. Fuera de ella,
  // `liveQuakeStatus` lo muestra solo mientras siga vivo un sismo que alcanzó a
  // esta persona — la misma ventana de 6 h, resuelta con el dato del servidor
  // en vez de con la antigüedad del reporte.
  const ubicacionVigente =
    member.locationAt != null && !isOlderThan(member.locationAt, ACTIVE_ALERT_WINDOW_MS);

  const statusVisible = alertActive ? status : liveQuakeStatus(member);
  const hasLocation =
    member.latitude != null && member.longitude != null && ubicacionVigente;

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
            // Mismo orden que en `confirmBlock`: salir primero (ver el porqué
            // ahí), sincronizar después.
            void removeConnection(member.connectionId).then(() => {
              router.back();
              void refresh();
            });
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
            // Salir PRIMERO, sincronizar después.
            //
            // Antes era `.then(refresh).then(router.back)`, y `refresh` es una
            // sincronización completa —perfil, círculo, tips, alerta, permisos,
            // token de push—. Nada de eso hace falta para irse: el bloqueo ya
            // está hecho en el servidor. Mientras se esperaba, el propio
            // `refresh` reescribía la caché sin esta persona, la ficha releía y
            // se quedaba en «Cargando…» mirando a alguien que acababas de
            // bloquear. Encontrado en Android el 2026-08-28.
            void blockConnection(member.userId)
              .then(() => {
                router.back();
                void refresh();
              })
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
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        <View style={styles.hero}>
          <Avatar
            displayName={member.displayName}
            size={92}
            status={statusVisible}
            dimmed={fueraDeLaZona}
          />
          <Text variant="title2" center>
            {member.displayName}
          </Text>

          {statusVisible !== null ? <StatusChip status={statusVisible} /> : null}

          {fueraDeLaZona ? (
            <Text variant="footnote" tone="tertiary" center>
              El sismo no llegó hasta donde está
            </Text>
          ) : null}

          {member.isDrill ? <DrillBanner compact /> : null}

          {statusVisible !== null && member.reportedAt ? (
            <Text variant="footnote" tone="tertiary">
              Reportó {timeAgo(member.reportedAt)}
            </Text>
          ) : !alertActive ? (
            <Text variant="footnote" tone="tertiary" center>
              Sin novedades. Su estado aparece acá cuando hay un sismo.
            </Text>
          ) : null}
        </View>

        {statusVisible !== null && member.statusMessage ? (
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
          ) : member.locationAt ? (
            // Se dice que existe y cuándo fue, pero no se pinta. Esconderlo sin
            // explicación parecería un error de la app; mostrarlo sería el
            // rastreo que la app promete no hacer.
            <Text variant="subhead" tone="tertiary" style={styles.gapTop}>
              Su última ubicación es de {timeAgo(member.locationAt)}. Solo se guarda durante un
              sismo, así que ya no se muestra.
            </Text>
          ) : (
            <Text variant="subhead" tone="tertiary" style={styles.gapTop}>
              Todavía no hay ubicación registrada de esta persona.
            </Text>
          )}
        </Card>

        {/* Los planes se listan TODOS, con su nombre, y no se elige uno
            «activo»: elegir obligaría a la otra persona a hacer algo en el
            momento del sismo. Con el nombre a la vista, quien lee sabe cuál
            aplica —«En el trabajo» un martes a las 3— sin que nadie toque nada.

            `actionPlans` viene de la caché local, así que esto se lee sin señal.
            El `member.actionPlan` de respaldo cubre a un contacto cuya fila se
            cacheó antes de la v2 del esquema local. */}
        <Card>
          <Text variant="footnote" tone="secondary" weight="600">
            {member.actionPlans.length > 1 ? 'SUS PLANES DE ACCIÓN' : 'SU PLAN DE ACCIÓN'}
          </Text>

          {member.actionPlans.length > 0 ? (
            member.actionPlans.map((plan, index) => (
              <View
                key={plan.id}
                style={[
                  styles.gapTop,
                  index > 0
                    ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.md }
                    : null,
                ]}>
                {member.actionPlans.length > 1 ? (
                  <Text variant="callout" weight="600">
                    {plan.name}
                  </Text>
                ) : null}
                <Text variant="body" style={styles.gapTop}>
                  {plan.body}
                </Text>
                <Text variant="caption" tone="tertiary" style={styles.gapTop}>
                  Actualizado {timeAgo(plan.updatedAt)}
                </Text>
              </View>
            ))
          ) : member.actionPlan?.trim() ? (
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
