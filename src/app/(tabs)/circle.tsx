import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { usePaywall } from '@/hooks/use-paywall';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import {
  createGroup,
  DuplicateGroupNameError,
  GroupLimitError,
  respondToConnection,
} from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { effectiveStatus, isAlertActive, liveQuakeStatus, wasAlertedFor } from '@/lib/quakes';
import { Radius, Spacing, tabScreenBottomInset } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { FREE_GROUP_LIMIT, type CircleMember } from '@/types/domain';

/**
 * El filtro solo existe mientras haya una alerta propia activa. Fuera de ella
 * no hay «zona» de la que hablar, y un selector con dos opciones vacías es peor
 * que no tenerlo.
 */
type Filtro = 'zona' | 'fuera' | 'todos';

/** El conmutador de raíz de la pantalla (migraciones 0031 y 0034). */
type Vista = 'red' | 'grupos';

export default function CircleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { accepted, groups, incomingRequests, outgoingRequests, activeQuake, refresh } =
    useAppData();

  const { refreshing, onRefresh } = usePullToRefresh(refresh);
  const [responding, setResponding] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('zona');
  const [vista, setVista] = useState<Vista>('red');
  const alertActive = isAlertActive(activeQuake);

  // Al volver a esta pestaña se refresca sola.
  //
  // Sin esto, quitar o aceptar a alguien desde su ficha dejaba la lista con lo
  // de antes hasta que alguien tirara de ella a mano: el `refresh()` que dispara
  // la ficha corre, pero cuando vuelve ya nadie estaba mirando esta pantalla y
  // el siguiente cambio —el que hace el OTRO teléfono— no tiene quién lo traiga.
  // Mismo patrón que Chats, Noticias y la ficha de contacto.
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const activeQuakeId = alertActive ? (activeQuake?.id ?? null) : null;

  const { enZona, fuera } = useMemo(() => {
    const dentro: CircleMember[] = [];
    const afuera: CircleMember[] = [];
    for (const m of accepted) {
      (wasAlertedFor(m, activeQuakeId) ? dentro : afuera).push(m);
    }
    return { enZona: dentro, fuera: afuera };
  }, [accepted, activeQuakeId]);

  // Sin alerta activa el filtro no se aplica aunque haya quedado elegido de una
  // alerta anterior: la pantalla vuelve sola a ser la lista completa.
  const visibles = !alertActive
    ? accepted
    : filtro === 'zona'
      ? enZona
      : filtro === 'fuera'
        ? fuera
        : accepted;

  const respond = async (connectionId: string, accept: boolean) => {
    setResponding(connectionId);
    try {
      await respondToConnection(connectionId, accept);
    } catch (error) {
      // `42501` de `respond_to_connection` significa una sola cosa: la solicitud
      // ya no está `pending`. Casi siempre es benigno —un toque doble que se
      // coló entre el `setResponding` y el re-render, o la respondiste desde el
      // otro dispositivo, o la retiraron—, así que alarmar con un diálogo sería
      // mentir sobre algo que ya salió bien. El `refresh` de abajo deja la
      // pantalla mostrando la verdad, que es lo único que hacía falta.
      //
      // Antes esto no tenía `catch`: el error escapaba como promesa no
      // capturada y, de paso, se llevaba puesto el `refresh`. Por eso aceptar
      // una solicitud dejaba la lista sin actualizar y tiraba un error en
      // consola. Encontrado el 2026-08-28.
      const code = (error as { code?: unknown } | null)?.code;
      if (code !== '42501') {
        Alert.alert('No se pudo responder', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      // Siempre, haya fallado o no: la lista tiene que terminar reflejando lo
      // que dice el servidor.
      await refresh();
      setResponding(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.md,
            paddingBottom: tabScreenBottomInset(insets.bottom) + Spacing.xl,
          },
        ]}
        refreshControl={
          // El spinner se ancla al borde del ScrollView, que acá empieza en y=0
          // (debajo del status bar). Sin este offset queda tapado por el reloj.
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={insets.top}
            tintColor={colors.textSecondary}
          />
        }>
        <View style={styles.header}>
          <Text variant="title2" style={styles.flex}>
            Mi red
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Agregar contactos"
            hitSlop={8}
            onPress={() => router.push('/add-contacts')}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <MaterialIcons name="person-add-alt" size={24} color={colors.accent} />
          </Pressable>
        </View>

        {/* El conmutador de raíz: toda la red, o los grupos. Va SIEMPRE visible
            —a diferencia del filtro de alerta de más abajo, que solo existe
            mientras hay una alerta— porque armar grupos es algo que se hace en
            calma, no durante un sismo. */}
        <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]}>
          {[
            {
              key: 'red' as const,
              label: 'Toda mi red',
              total: accepted.length,
            },
            {
              key: 'grupos' as const,
              label: 'Mis grupos',
              total: groups.length,
            },
          ].map((opcion) => {
            const activo = vista === opcion.key;

            return (
              <Pressable
                key={opcion.key}
                onPress={() => setVista(opcion.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={`${opcion.label}, ${opcion.total}`}
                style={[
                  styles.segment,
                  activo
                    ? {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      }
                    : null,
                ]}>
                <View style={styles.segmentInner}>
                  <Text variant="subhead" weight={activo ? '600' : '400'}>
                    {opcion.label}
                  </Text>
                  <Text variant="caption" tone="tertiary">
                    {opcion.total}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {vista === 'grupos' ? (
          <GroupsView
            onOpen={(groupId) => router.push(`/group/${groupId}`)}
            onCreated={(groupId) => router.push(`/group/${groupId}`)}
          />
        ) : (
          <>
            {incomingRequests.length > 0 ? (
              <Card padded={false}>
                <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
                  TE QUIEREN AGREGAR
                </Text>

                {incomingRequests.map((member, index) => (
                  <View
                    key={member.connectionId}
                    style={[
                      styles.requestRow,
                      index > 0
                        ? {
                            borderTopColor: colors.border,
                            borderTopWidth: StyleSheet.hairlineWidth,
                          }
                        : null,
                    ]}>
                    <View style={styles.rowTop}>
                      <Avatar displayName={member.displayName} size={44} status={null} />
                      <View style={styles.rowCopy}>
                        <Text variant="callout" weight="500" numberOfLines={1}>
                          {member.displayName}
                        </Text>
                        <Text variant="caption" tone="tertiary">
                          Solicitó {timeAgo(member.connectionCreatedAt)}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.requestActions}>
                      <Button
                        title="Aceptar"
                        onPress={() => void respond(member.connectionId, true)}
                        loading={responding === member.connectionId}
                        style={styles.flex}
                      />
                      <Button
                        title="Rechazar"
                        onPress={() => void respond(member.connectionId, false)}
                        disabled={responding === member.connectionId}
                        variant="secondary"
                        style={styles.flex}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {/*
          El filtro aparece SOLO con una alerta propia activa, que es el único
          momento en que la distinción existe. Es la misma pantalla de siempre
          el resto del tiempo: no se le agrega un control a una lista de cuatro
          personas para que se vea completa.
        */}
            {alertActive && accepted.length > 0 ? (
              <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]}>
                {[
                  {
                    key: 'zona' as const,
                    label: 'En la zona',
                    total: enZona.length,
                  },
                  {
                    key: 'fuera' as const,
                    label: 'Fuera',
                    total: fuera.length,
                  },
                  {
                    key: 'todos' as const,
                    label: 'Todos',
                    total: accepted.length,
                  },
                ].map((opcion) => {
                  const activo = filtro === opcion.key;

                  return (
                    <Pressable
                      key={opcion.key}
                      onPress={() => setFiltro(opcion.key)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: activo }}
                      accessibilityLabel={`${opcion.label}, ${opcion.total} ${
                        opcion.total === 1 ? 'persona' : 'personas'
                      }`}
                      style={[
                        styles.segment,
                        activo
                          ? {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            }
                          : null,
                      ]}>
                      <View style={styles.segmentInner}>
                        <Text variant="subhead" weight={activo ? '600' : '400'}>
                          {opcion.label}
                        </Text>
                        <Text variant="caption" tone="tertiary">
                          {opcion.total}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            {accepted.length > 0 ? (
              <Card padded={false}>
                <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
                  {visibles.length} {visibles.length === 1 ? 'PERSONA' : 'PERSONAS'}
                </Text>

                {visibles.length === 0 ? (
                  <Text variant="subhead" tone="secondary" style={styles.filtroVacio}>
                    {filtro === 'zona'
                      ? 'A nadie de tu red le llegó esta alerta. El sismo no llegó hasta donde están.'
                      : 'A todos los de tu red les llegó esta alerta.'}
                  </Text>
                ) : (
                  visibles.map((member, index) => (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      activeQuakeId={activeQuakeId}
                      showStatus={alertActive}
                      first={index === 0}
                      onPress={() => router.push(`/contact/${member.userId}`)}
                    />
                  ))
                )}
              </Card>
            ) : (
              <Card>
                <Text variant="headline">Todavía no tienes a nadie</Text>
                <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
                  Las conexiones son de a dos y no se contagian: si agregas a tu mamá, tus otros
                  contactos no aparecen en la red de ella.
                </Text>
                <Button
                  title="Agregar contactos"
                  onPress={() => router.push('/add-contacts')}
                  style={styles.emptyAction}
                />
              </Card>
            )}

            {outgoingRequests.length > 0 ? (
              <Card padded={false}>
                <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
                  ESPERANDO RESPUESTA
                </Text>
                {outgoingRequests.map((member) => (
                  <View key={member.connectionId} style={styles.rowTop}>
                    <Avatar displayName={member.displayName} size={36} status={null} dimmed />
                    <View style={styles.rowCopy}>
                      <Text variant="subhead" numberOfLines={1}>
                        {member.displayName}
                      </Text>
                      <Text variant="caption" tone="tertiary">
                        Enviada {timeAgo(member.connectionCreatedAt)}
                      </Text>
                    </View>
                    <MaterialIcons name="schedule" size={18} color={colors.textTertiary} />
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * La lista de grupos, con el alta.
 *
 * Muestra DOS cosas en una sola lista: los que creaste y aquellos donde te
 * metieron. No van separados a propósito — para quien mira, un grupo es un
 * grupo; la diferencia recién importa cuando intenta editarlo, y ahí la pantalla
 * de detalle la explica. Lo único que se marca acá es de quién es.
 *
 * El tope —2 gratis, ilimitados con Premium— lo hace cumplir un disparador y
 * cuenta **los que creaste**: los ajenos no ocupan cupo, o alguien podría
 * dejarte sin poder crear los tuyos con solo sumarte a los suyos.
 *
 * **El botón de crear se ve siempre**, con tope alcanzado o no; al tocarlo con
 * el cupo lleno se abre el paywall. Mismo criterio que la pestaña Global de
 * Noticias y que los planes de acción (ESTADO §1.9.1.0).
 */
function GroupsView({
  onOpen,
  onCreated,
}: {
  onOpen: (groupId: string) => void;
  onCreated: (groupId: string) => void;
}) {
  const { colors } = useTheme();
  const { userId } = useAuth();
  const { accepted, groups, mySettings, refresh } = useAppData();
  const { abrirPaywall, abriendo, disponible } = usePaywall();

  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [guardando, setGuardando] = useState(false);

  const esPremium = mySettings?.isPremium ?? false;
  const propios = groups.filter((g) => g.isOwner).length;
  const puedeCrear = esPremium || propios < FREE_GROUP_LIMIT;

  /**
   * Lo que pasa al tocar «Nuevo grupo» con el cupo lleno. Solo puede pasar sin
   * Premium: con Premium no hay tope, así que no hay nada que ofrecer.
   */
  const ofrecerPremium = async () => {
    if (!disponible) {
      Alert.alert(
        `Tu plan permite ${FREE_GROUP_LIMIT} grupos`,
        'Las suscripciones todavía no están habilitadas en esta versión.',
      );
      return;
    }

    const resultado = await abrirPaywall();

    if (resultado === 'listo') {
      setCreando(true);
    } else if (resultado === 'pendiente') {
      Alert.alert(
        'Tu compra quedó registrada',
        'Puede tardar unos minutos en activarse. Si no la ves, cierra y vuelve a abrir la app.',
      );
    } else if (resultado === 'error') {
      Alert.alert('No pudimos abrir la tienda', 'Revisa tu conexión e intenta de nuevo.');
    }
  };

  const crear = async () => {
    const limpio = nombre.trim();
    if (limpio.length === 0 || !userId) return;

    setGuardando(true);
    try {
      const nuevoId = await createGroup(limpio, groups.length);
      await refresh();
      setNombre('');
      setCreando(false);
      onCreated(nuevoId);
    } catch (error) {
      if (error instanceof GroupLimitError) {
        Alert.alert(
          'Llegaste al tope de grupos',
          `Tu plan permite ${FREE_GROUP_LIMIT}. Con Premium no hay límite.`,
        );
      } else if (error instanceof DuplicateGroupNameError) {
        Alert.alert('Ya tienes un grupo con ese nombre', 'Elige otro para no confundirlos.');
      } else {
        Alert.alert('No se pudo crear', 'Revisa tu conexión e intenta de nuevo.');
      }
    } finally {
      setGuardando(false);
    }
  };

  // Sin red no se puede armar un grupo: sus integrantes salen de tus contactos
  // aceptados. Pero si YA te metieron en uno, ese sí se muestra.
  if (accepted.length === 0 && groups.length === 0) {
    return (
      <Card>
        <Text variant="headline">Primero, tu red</Text>
        <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
          Los grupos se arman con gente que ya está en tu red. Agrega a alguien y vuelve.
        </Text>
      </Card>
    );
  }

  return (
    <>
      {groups.length > 0 ? (
        <Card padded={false}>
          {groups.map((grupo, index) => {
            // Los demás: el dueño se cuenta, pero uno mismo no. «Casa · 3
            // personas» tiene que significar tres además de ti.
            const otros = grupo.members.filter((m) => m.userId !== userId);
            const fuera = otros.filter((m) => !m.inMyNetwork).length;

            return (
              <Pressable
                key={grupo.id}
                accessibilityRole="button"
                accessibilityLabel={`${grupo.name}, ${otros.length} ${
                  otros.length === 1 ? 'persona' : 'personas'
                }`}
                onPress={() => onOpen(grupo.id)}
                style={({ pressed }) => [
                  styles.grupoFila,
                  index > 0
                    ? {
                        borderTopColor: colors.border,
                        borderTopWidth: StyleSheet.hairlineWidth,
                      }
                    : null,
                  pressed ? styles.pressed : null,
                ]}>
                <View style={[styles.grupoIcono, { backgroundColor: colors.accentSoft }]}>
                  <MaterialIcons name="groups" size={20} color={colors.accent} />
                </View>

                <View style={styles.flex}>
                  <Text variant="callout" weight="500" numberOfLines={1}>
                    {grupo.name}
                  </Text>
                  <Text variant="caption" tone="tertiary" numberOfLines={1}>
                    {otros.length === 0
                      ? 'Sin nadie todavía'
                      : `${otros.length} ${otros.length === 1 ? 'persona' : 'personas'}`}
                    {grupo.isOwner ? '' : ' · lo creó otra persona'}
                  </Text>

                  {/* El aviso que hace que la red se teja sola. Va acá y no solo
                      adentro para que se vea sin entrar: son personas de las que
                      NO vas a saber nada en un sismo. */}
                  {fuera > 0 ? (
                    <Text variant="caption" tone="accent" weight="600" numberOfLines={1}>
                      {fuera === 1 ? '1 persona no está' : `${fuera} personas no están`} en tu red
                    </Text>
                  ) : null}
                </View>

                <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
              </Pressable>
            );
          })}
        </Card>
      ) : (
        <Card>
          <Text variant="headline">Todavía no tienes grupos</Text>
          <Text variant="subhead" tone="secondary" style={styles.emptyBody}>
            Un grupo es gente + un chat. Durante un sismo la pantalla te dice «faltan 2 de Casa» en
            vez de una lista de {accepted.length} caras.
          </Text>
        </Card>
      )}

      {creando ? (
        <Card>
          <Text variant="footnote" tone="secondary" weight="600">
            NOMBRE DEL GRUPO
          </Text>
          <TextInput
            value={nombre}
            onChangeText={setNombre}
            maxLength={30}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => void crear()}
            placeholder="Casa, Familia, Trabajo…"
            placeholderTextColor={colors.textTertiary}
            style={[styles.input, { borderColor: colors.border, color: colors.text }]}
          />
          {/* La advertencia va pegada al campo, que es donde se decide: el
              nombre deja de ser privado en cuanto entre alguien. */}
          <Text variant="caption" tone="tertiary" style={styles.avisoNombre}>
            Este nombre lo van a ver todos los que metas.
          </Text>
          <View style={styles.crearAcciones}>
            <Button
              title="Cancelar"
              variant="ghost"
              onPress={() => {
                setCreando(false);
                setNombre('');
              }}
              style={styles.flex}
            />
            <Button
              title="Crear"
              loading={guardando}
              disabled={nombre.trim().length === 0}
              onPress={() => void crear()}
              style={styles.flex}
            />
          </View>
        </Card>
      ) : (
        <Button
          title="Nuevo grupo"
          icon="add"
          variant="outline"
          loading={abriendo}
          onPress={() => (puedeCrear ? setCreando(true) : void ofrecerPremium())}
        />
      )}

      <Text variant="caption" tone="tertiary" style={styles.nota}>
        Un grupo lo ven todos los que están adentro, con su nombre y su lista. Cada uno tiene su
        chat en la pestaña Chats.
      </Text>
    </>
  );
}

function MemberRow({
  member,
  activeQuakeId,
  showStatus,
  first,
  onPress,
}: {
  member: CircleMember;
  activeQuakeId: string | null;
  showStatus: boolean;
  first: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  // Sin alerta propia el anillo igual aparece si a esta persona la alcanzó un
  // sismo que sigue vivo (ver `liveQuakeStatus`).
  const status = showStatus ? effectiveStatus(member, activeQuakeId) : liveQuakeStatus(member);
  // Con alerta activa, `null` significa que a esta persona el sismo no le
  // llegó. Acá sí se dice con palabras: esta pantalla se lee, no se ojea, y
  // un avatar apagado sin explicación es una pregunta sin responder.
  const fueraDeLaZona = showStatus && status === null;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.memberRow,
        first
          ? null
          : {
              borderTopColor: colors.border,
              borderTopWidth: StyleSheet.hairlineWidth,
            },
        pressed ? { backgroundColor: colors.surfaceSunken } : null,
      ]}>
      <Avatar
        displayName={member.displayName}
        size={44}
        status={status}
        showStatusBadge={status !== null}
        dimmed={fueraDeLaZona}
      />

      <View style={styles.rowCopy}>
        <View style={styles.nombreLinea}>
          <Text variant="callout" weight="500" numberOfLines={1} style={styles.flex}>
            {member.displayName}
          </Text>

          {/* El distintivo de «no le llega nada» (deuda 1.14, migración 0039).
              Va pegado al nombre y no en la línea de abajo porque no es una
              novedad de hoy: es una condición de la persona, y compite con el
              estado por el mismo renglón. El detalle, con qué hacer al
              respecto, está en su ficha. */}
          {!member.receivesNotifications ? (
            <MaterialIcons
              name="notifications-off"
              size={16}
              color={colors.textTertiary}
              accessibilityLabel="No recibe notificaciones"
            />
          ) : null}
        </View>

        {status !== null ? (
          <View style={styles.statusLine}>
            <StatusChip status={status} short size="sm" />
            {member.isDrill ? (
              <Text variant="caption" tone="accent" weight="600">
                simulacro
              </Text>
            ) : null}
          </View>
        ) : fueraDeLaZona ? (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            El sismo no llegó hasta donde está
          </Text>
        ) : (
          <Text variant="caption" tone="tertiary" numberOfLines={1}>
            {member.locationAt
              ? `Última ubicación ${timeAgo(member.locationAt)}`
              : 'Sin ubicación registrada'}
          </Text>
        )}
      </View>

      <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  nombreLinea: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row' },
  flex: { flex: 1 },
  sectionHeader: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  requestRow: {
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  requestActions: { flexDirection: 'row', gap: Spacing.sm },
  rowTop: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  memberRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  rowCopy: { flex: 1, gap: 2 },
  statusLine: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  segmented: {
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: 2,
    padding: 3,
  },
  segment: {
    borderColor: 'transparent',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: Spacing.sm,
  },
  segmentInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  filtroVacio: { paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  emptyBody: { marginTop: Spacing.xs },
  emptyAction: { marginTop: Spacing.lg },
  pressed: { opacity: 0.6 },
  grupoFila: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  grupoIcono: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  avisoNombre: { marginTop: Spacing.sm },
  input: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  crearAcciones: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  nota: { paddingHorizontal: Spacing.xs },
});
