import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Clipboard from 'expo-clipboard';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { DrillTag } from '@/components/drill-banner';
import { LocationMap } from '@/components/location-map';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  addGroupMember,
  blockConnection,
  removeConnection,
  removeGroupMember,
} from '@/lib/api';
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
  const { colors, status: statusColors } = useTheme();
  const { activeQuake, groups, refresh, lastCircleSync } = useAppData();

  /** Solo los grupos que creaste: son los únicos donde puedes tocar la lista. */
  const misGrupos = useMemo(() => groups.filter((g) => g.isOwner), [groups]);
  const { refreshing, onRefresh } = usePullToRefresh(refresh);

  const [member, setMember] = useState<CircleMember | null>(null);
  const [buscado, setBuscado] = useState(false);
  const [opening, setOpening] = useState(false);
  const [grupoOcupado, setGrupoOcupado] = useState<string | null>(null);
  const [saliendo, setSaliendo] = useState(false);

  /**
   * Poner o sacar a esta persona de un grupo tuyo, sin salir de su ficha.
   *
   * Escribe y refresca, sin botón de guardar: las dos operaciones son
   * idempotentes (agregar dos veces no duplica por la clave primaria compuesta,
   * quitar dos veces no falla), así que un toque repetido deja el mismo estado.
   *
   * Ojo con lo que esto significa desde la 0034: el grupo es compartido, así que
   * meter a alguien acá **lo mete en un chat donde los demás lo van a ver**. No
   * es la etiqueta privada que era antes.
   */
  const alternarGrupo = useCallback(
    async (groupId: string, dentro: boolean) => {
      if (!id) return;
      setGrupoOcupado(groupId);
      try {
        if (dentro) await removeGroupMember(groupId, id);
        else await addGroupMember(groupId, id);
      } catch {
        Alert.alert('No se pudo guardar', 'Revisa tu conexión e intenta de nuevo.');
      } finally {
        await refresh();
        setGrupoOcupado(null);
      }
    },
    [id, refresh],
  );

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
            {buscado ? 'Esta persona ya no está en tu red.' : 'Cargando…'}
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
  const hasLocation = member.latitude != null && member.longitude != null && ubicacionVigente;

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
            //
            // El `saliendo` es lo que llena el hueco entre el toque y el
            // `router.back()`: sin él la ficha se queda igual mientras espera al
            // servidor y parece que el «Quitar» no hizo nada. Y el `catch` es lo
            // que faltaba: sin red la promesa se rompía en silencio y la persona
            // se quedaba mirando una pantalla que no cambiaba nunca.
            setSaliendo(true);
            void removeConnection(member.connectionId)
              .then(() => {
                router.back();
                void refresh();
              })
              .catch(() => {
                setSaliendo(false);
                Alert.alert('No se pudo quitar', 'Revisa tu conexión e intenta de nuevo.');
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

          {member.isDrill ? <DrillTag /> : null}

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

        {/* El aviso va ARRIBA de todo lo demás, y es un estado permanente y no
            una notificación (deuda 1.14, migración 0039).

            Si esta persona no tiene ningún dispositivo registrado, no le llega
            la alerta de sismo — y tampoco se dispara nunca «no responde» por
            ella, porque su entrega cierra como `no_token` y el aviso de silencio
            solo mira las enviadas. O sea que **el silencio de la app coincide
            con el silencio de quien más te preocuparía**, y durante el sismo no
            hay nada que se pueda decir sin mentir: no está callada, está
            incomunicada.

            Por eso se dice acá y ahora, un martes cualquiera, que es cuando
            todavía se puede hacer algo: escribirle. */}
        {!member.receivesNotifications ? (
          <Card>
            <View style={styles.aviso}>
              {/* `error-outline` y no `notifications-off`: la campana tachada es
                  el símbolo de «lo silencié yo», y acá es al revés. Cambiado
                  junto con el de la pestaña Red, que decía lo mismo mal. */}
              <MaterialIcons name="error-outline" size={18} color={statusColors.helping.strong} />
              <View style={styles.flex}>
                <Text variant="callout" weight="600">
                  No recibe notificaciones
                </Text>
                {/* Habla del EFECTO y no de la causa: el servidor sabe que no
                    hay a dónde mandar, pero no sabe por qué —permiso denegado,
                    teléfono nuevo, o una reinstalación sin abrir la app—.
                    Adivinar haría que la mitad de los consejos fueran malos. */}
                <Text variant="footnote" tone="secondary" style={styles.gapTop}>
                  Las notificaciones de Todos Bien no están llegando a su teléfono, así que{' '}
                  <Text variant="footnote" weight="600">
                    no va a recibir el aviso de un sismo
                  </Text>
                  . Escríbele y pídele que abra la app.
                </Text>
              </View>
            </View>
          </Card>
        ) : null}

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
                    void Clipboard.setStringAsync(`${member.latitude},${member.longitude}`)
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
                    ? {
                        borderTopColor: colors.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                        paddingTop: Spacing.md,
                      }
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

        {/* Los grupos, desde acá.
            Se puede llegar al mismo resultado desde «Mis grupos», pero este es
            el camino natural cuando ya estás mirando a la persona: acabas de
            aceptar a alguien y lo ubicas sin salir de su ficha.

            🔴 Solo los que CREASTE. En un grupo ajeno no puedes tocar la lista
            —solo su dueño puede (0034)—, y un chip que no responde al toque es
            peor que no mostrarlo. Ese grupo aparece igual, en Mi red. */}
        {misGrupos.length > 0 ? (
          <Card>
            <Text variant="footnote" tone="secondary" weight="600">
              SUS GRUPOS
            </Text>

            <View style={styles.gruposFila}>
              {misGrupos.map((grupo) => {
                const dentro = grupo.members.some((m) => m.userId === member.userId);
                const ocupado = grupoOcupado === grupo.id;

                return (
                  <Pressable
                    key={grupo.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: dentro, busy: ocupado }}
                    accessibilityLabel={grupo.name}
                    disabled={ocupado}
                    onPress={() => void alternarGrupo(grupo.id, dentro)}
                    style={({ pressed }) => [
                      styles.grupoChip,
                      {
                        // `accent` sobre `accentSoft` es la combinación de chip
                        // del sistema de color, medida en 4.57:1 (tokens.ts).
                        backgroundColor: dentro ? colors.accentSoft : colors.surfaceSunken,
                        borderColor: dentro ? colors.accentSoft : colors.border,
                      },
                      pressed || ocupado ? { opacity: 0.6 } : null,
                    ]}>
                    {/* Mismo criterio que en el detalle del grupo: el toque
                        escribe en el servidor y refresca, así que sin señal el
                        segundo de espera se lee como que no pasó nada. */}
                    {ocupado ? (
                      <ActivityIndicator size="small" color={colors.textSecondary} />
                    ) : (
                      <MaterialIcons
                        name={dentro ? 'check' : 'add'}
                        size={14}
                        color={dentro ? colors.accent : colors.textSecondary}
                      />
                    )}
                    <Text
                      variant="footnote"
                      weight={dentro ? '600' : '400'}
                      style={dentro ? { color: colors.accent } : null}>
                      {grupo.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Esta línea decía lo contrario hasta la 0034 —«solo tú los ves»—
                y ahora sería mentira. Un grupo se comparte, y meter a alguien es
                una acción que se nota. */}
            <Text variant="caption" tone="tertiary" style={styles.gapTop}>
              {member.displayName} va a ver el grupo, a los demás integrantes y su chat.
            </Text>
          </Card>
        ) : null}

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
          disabled={saliendo}
          accessibilityRole="button"
          accessibilityState={{ busy: saliendo }}
          style={({ pressed }) => [
            styles.remove,
            pressed || saliendo ? styles.pressed : null,
          ]}>
          <Text variant="footnote" tone="danger" center weight="600">
            {saliendo ? 'Quitando…' : 'Quitar de mi red'}
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
  content: {
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
  },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  hero: { alignItems: 'center', gap: Spacing.sm },
  gapTop: { marginTop: Spacing.xs },
  gruposFila: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  grupoChip: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  locationActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  flex: { flex: 1 },
  aviso: { flexDirection: 'row', gap: Spacing.sm },
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
