import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { StatusChip } from '@/components/status-chip';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { respondToConnection } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { effectiveStatus, isAlertActive, liveQuakeStatus, wasAlertedFor } from '@/lib/quakes';
import { Radius, Spacing, tabScreenBottomInset } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { CircleMember } from '@/types/domain';

/**
 * El filtro solo existe mientras haya una alerta propia activa. Fuera de ella
 * no hay «zona» de la que hablar, y un selector con dos opciones vacías es peor
 * que no tenerlo.
 */
type Filtro = 'zona' | 'fuera' | 'todos';

export default function CircleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { accepted, incomingRequests, outgoingRequests, activeQuake, refresh } = useAppData();

  const { refreshing, onRefresh } = usePullToRefresh(refresh);
  const [responding, setResponding] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('zona');
  const alertActive = isAlertActive(activeQuake);
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
          { paddingTop: insets.top + Spacing.md, paddingBottom: tabScreenBottomInset(insets.bottom) + Spacing.xl },
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
            Tu círculo
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
                    ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                    : null,
                ]}>
                <View style={styles.rowTop}>
                  <Avatar
                    displayName={member.displayName}
                    size={44}
                    status={null}
                  />
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
            {(
              [
                { key: 'zona' as const, label: 'En la zona', total: enZona.length },
                { key: 'fuera' as const, label: 'Fuera', total: fuera.length },
                { key: 'todos' as const, label: 'Todos', total: accepted.length },
              ]
            ).map((opcion) => {
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
                    activo ? { backgroundColor: colors.surface, borderColor: colors.border } : null,
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
                  ? 'A nadie de tu círculo le llegó esta alerta. El sismo no llegó hasta donde están.'
                  : 'A todos los de tu círculo les llegó esta alerta.'}
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
              contactos no aparecen en el círculo de ella.
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
                <Avatar
                  displayName={member.displayName}
                  size={36}
                  status={null}
                  dimmed
                />
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
      </ScrollView>
    </Screen>
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
        first ? null : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
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
        <Text variant="callout" weight="500" numberOfLines={1}>
          {member.displayName}
        </Text>

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
  header: { alignItems: 'center', flexDirection: 'row' },
  flex: { flex: 1 },
  sectionHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.sm },
  requestRow: { gap: Spacing.md, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
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
  segmented: { borderRadius: Radius.md, flexDirection: 'row', gap: 2, padding: 3 },
  segment: {
    borderColor: 'transparent',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: Spacing.sm,
  },
  segmentInner: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs, justifyContent: 'center' },
  filtroVacio: { paddingBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  emptyBody: { marginTop: Spacing.xs },
  emptyAction: { marginTop: Spacing.lg },
  pressed: { opacity: 0.6 },
});
