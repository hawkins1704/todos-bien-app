import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
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
import { effectiveStatus, isAlertActive } from '@/lib/quakes';
import { Spacing, TabBarExtraInset, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { CircleMember } from '@/types/domain';

export default function CircleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { accepted, incomingRequests, outgoingRequests, activeQuake, refresh } = useAppData();

  const { refreshing, onRefresh } = usePullToRefresh(refresh);
  const [responding, setResponding] = useState<string | null>(null);
  const alertActive = isAlertActive(activeQuake);

  const respond = async (connectionId: string, accept: boolean) => {
    setResponding(connectionId);
    try {
      await respondToConnection(connectionId, accept);
      await refresh();
    } finally {
      setResponding(null);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.md, paddingBottom: insets.bottom + TabBarExtraInset + Spacing.xl },
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

        {accepted.length > 0 ? (
          <Card padded={false}>
            <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
              {accepted.length} {accepted.length === 1 ? 'PERSONA' : 'PERSONAS'}
            </Text>

            {accepted.map((member, index) => (
              <MemberRow
                key={member.userId}
                member={member}
                activeQuakeId={alertActive ? (activeQuake?.id ?? null) : null}
                showStatus={alertActive}
                first={index === 0}
                onPress={() => router.push(`/contact/${member.userId}`)}
              />
            ))}
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
  const status = effectiveStatus(member, activeQuakeId) as StatusKey;

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
        status={showStatus ? status : null}
        showStatusBadge={showStatus}
      />

      <View style={styles.rowCopy}>
        <Text variant="callout" weight="500" numberOfLines={1}>
          {member.displayName}
        </Text>

        {showStatus ? (
          <View style={styles.statusLine}>
            <StatusChip status={status} short size="sm" />
            {member.isDrill ? (
              <Text variant="caption" tone="accent" weight="600">
                simulacro
              </Text>
            ) : null}
          </View>
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
  emptyBody: { marginTop: Spacing.xs },
  emptyAction: { marginTop: Spacing.lg },
  pressed: { opacity: 0.6 },
});
