import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/avatar';
import { CalmBanner } from '@/components/calm-banner';
import { CircleGrid } from '@/components/circle-grid';
import { ConnectionChip } from '@/components/connection-chip';
import { DrillBanner } from '@/components/drill-banner';
import { MyLocationCard } from '@/components/my-location-card';
import { PreparednessChecklist } from '@/components/preparedness-checklist';
import { QuakeCard } from '@/components/quake-card';
import { StatusPicker } from '@/components/status-picker';
import { TipCard } from '@/components/tip-card';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useDrill } from '@/context/drill';
import { useDailyTip } from '@/hooks/use-daily-tip';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { captureLocationForActiveAlert } from '@/lib/alert-response';
import { isOlderThan, timeAgo } from '@/lib/format';
import { captureLocationOnce } from '@/lib/location';
import { confirmedForQuake, isAlertActive, membersInQuakeZone } from '@/lib/quakes';
import { reportMyStatus } from '@/lib/sync';
import { Radius, Spacing, tabScreenBottomInset, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const SIX_MONTHS_MS = 180 * 24 * 60 * 60 * 1000;

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { isDrilling } = useDrill();

  const {
    accepted,
    groups,
    incomingRequests,
    myProfile,
    mySettings,
    myStatus,
    activeQuake,
    tips,
    lastMonitoringCheck,
    online,
    pendingWrites,
    refresh,
    reloadLocal,
  } = useAppData();

  const { tip, next: nextTip } = useDailyTip(tips);
  const { refreshing, onRefresh } = usePullToRefresh(refresh);
  const [reporting, setReporting] = useState(false);

  const alertActive = isAlertActive(activeQuake);
  const confirmed = confirmedForQuake(accepted, activeQuake?.id ?? null);
  // El denominador del contador son los que SÍ recibieron esta alerta, no el
  // círculo entero. Contar a quien nunca fue alertado inventaba un «faltan N»
  // con gente que no tenía nada que reportar (migración 0025).
  const enZona = membersInQuakeZone(accepted, alertActive ? (activeQuake?.id ?? null) : null);

  /**
   * El desglose por grupo, con el MISMO criterio que el contador de arriba: el
   * denominador es quién de ese grupo recibió esta alerta, no cuánta gente tiene
   * el grupo. Un grupo entero fuera del sismo no aparece (queda en 0 miembros en
   * zona y se filtra), porque no tiene nada que confirmar.
   */
  const resumenGrupos = useMemo(() => {
    const quakeId = alertActive ? (activeQuake?.id ?? null) : null;
    if (!quakeId || enZona.length === 0) return [];

    const enZonaPorId = new Map(enZona.map((m) => [m.userId, m]));

    return groups
      .map((grupo) => {
        // Solo la gente del grupo que además está en TU red: de los demás no
        // hay estado que mostrar, porque las conexiones son de a dos (0034).
        // Por eso el detalle del grupo avisa cuántos quedan fuera de la cuenta.
        const miembros = grupo.members
          .map((m) => enZonaPorId.get(m.userId))
          .filter((m): m is NonNullable<typeof m> => m !== undefined);

        return {
          id: grupo.id,
          name: grupo.name,
          total: miembros.length,
          confirmados: confirmedForQuake(miembros, quakeId),
        };
      })
      .filter((g) => g.total > 0);
  }, [groups, enZona, activeQuake, alertActive]);

  // Con una alerta activa se guarda dónde está la persona sin esperar a que
  // toque nada: si abre la app tras un sismo y no reporta, igual queremos que su
  // círculo pueda ver dónde estaba. La función aplica el jitter de la spec §6 y
  // se desactiva sola si la persona ya reportó para este sismo.
  useEffect(() => {
    if (!alertActive || !activeQuake) return;

    let cancelled = false;
    void captureLocationForActiveAlert(activeQuake)
      .then((captured) => {
        if (captured && !cancelled) void reloadLocal();
      })
      // `captureLocationForActiveAlert` tiene su propio `try/finally` sin
      // `catch`, así que un fallo del GPS sale por acá. Sin este `catch` era una
      // promesa no capturada **en el camino central de la alerta**: no rompe la
      // pantalla, pero ensucia la consola justo cuando se está diagnosticando un
      // sismo real, que es el peor momento para tener ruido.
      .catch(() => {
        // La captura automática es un extra: si falla, la persona sigue
        // pudiendo reportar a mano, que es lo que la pantalla ya ofrece.
      });

    return () => {
      cancelled = true;
    };
  }, [alertActive, activeQuake, reloadLocal]);

  const myEffectiveStatus: StatusKey | null =
    alertActive && myStatus?.quakeEventId !== activeQuake?.id ? null : (myStatus?.status ?? null);

  const report = async (status: StatusKey) => {
    setReporting(true);
    try {
      // La ubicación va en su propio try, y el orden importa: **decir cómo
      // estás pesa más que dónde estás**.
      //
      // `captureLocationOnce` pide permisos y enciende el GPS, así que puede
      // lanzar por su cuenta. Estaba dentro del mismo `try` que el reporte y sin
      // `catch`: si el GPS fallaba, `reportMyStatus` no llegaba a correr nunca,
      // el error escapaba como promesa no capturada, y la persona veía el botón
      // dejar de girar sin ningún aviso. O sea que tocaba «estoy bien» durante
      // un sismo y su círculo seguía sin saber de ella.
      let fix = null;
      try {
        fix = await captureLocationOnce();
      } catch {
        // Sin ubicación se reporta igual. La app ya sabe mostrar «sin ubicación
        // registrada»; lo que no puede es callarse el estado.
      }

      await reportMyStatus({
        status,
        location: fix,
        quakeEventId: activeQuake?.id ?? null,
        isDrill: isDrilling,
      });
      await reloadLocal();
    } catch {
      // `reportMyStatus` escribe local y encola, así que no falla por red. Si
      // igual falla, hay que decirlo: el silencio acá se lee como "ya avisé".
      Alert.alert(
        'No se pudo guardar tu estado',
        'Intenta de nuevo. Si el problema sigue, cierra y vuelve a abrir la app.',
      );
    } finally {
      setReporting(false);
    }
  };

  // Con el simulacro activo el banner es lo primero de la pantalla y se queda
  // con el safe area de arriba, así que el scroll ya no tiene que reservarlo:
  // sumarlo dos veces dejaría un hueco del alto del status bar.
  const topInset = isDrilling ? 0 : insets.top;

  return (
    <Screen>
      {isDrilling ? <DrillBanner topInset /> : null}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: topInset + Spacing.md,
            paddingBottom: tabScreenBottomInset(insets.bottom) + Spacing.xl,
          },
        ]}
        refreshControl={
          // El spinner se ancla al borde del ScrollView, que sin simulacro
          // empieza en y=0. Sin este offset queda tapado por el status bar.
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            progressViewOffset={topInset}
            tintColor={colors.textSecondary}
          />
        }>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text variant="footnote" tone="secondary">
              {greeting()}
            </Text>
            <Text variant="title2">{firstName(myProfile?.displayName)}</Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mi cuenta"
            hitSlop={8}
            onPress={() => router.push('/account')}
            style={({ pressed }) => (pressed ? styles.pressed : null)}>
            <Avatar displayName={myProfile?.displayName ?? '?'} size={42} status={null} />
          </Pressable>
        </View>

        <ConnectionChip online={online} pendingWrites={pendingWrites} />

        {alertActive && activeQuake ? (
          <>
            <QuakeCard quake={activeQuake} tone="alert" />

            <Card>
              <Text variant="headline">Mi estado</Text>
              <Text variant="footnote" tone="secondary" style={styles.subline}>
                {myEffectiveStatus
                  ? `Reportado ${timeAgo(myStatus?.reportedAt)}`
                  : 'Tu red todavía no sabe cómo estás'}
              </Text>

              <View style={styles.picker}>
                <StatusPicker
                  value={myEffectiveStatus}
                  onChange={(status) => void report(status)}
                  disabled={reporting}
                />
              </View>

              {reporting ? (
                <Text variant="caption" tone="tertiary" center style={styles.subline}>
                  Guardando y tomando tu ubicación…
                </Text>
              ) : null}
            </Card>

            {/*
              Durante una alerta la Home muestra SOLO a quienes les llegó el
              sismo, no la red entera.

              El resto no es que "falte": es que no tenía nada que reportar. En
              una pantalla que se mira con el pulso a 120 y en la que cada cara
              es una pregunta sin responder, mezclarlos obliga a hacer un
              descarte mental —"¿este está callado o simplemente no le tocó?"—
              justo cuando nadie está en condiciones de hacerlo. La red
              completa sigue a un toque de distancia, en la pestaña Red.
            */}
            <Card>
              <View style={styles.circleHeader}>
                <Text variant="headline">
                  {enZona.length > 0 ? 'Tu gente en la zona' : 'Tu red'}
                </Text>
                {enZona.length > 0 ? (
                  <Text variant="footnote" tone="secondary" weight="600">
                    {confirmed}/{enZona.length} confirmados
                  </Text>
                ) : null}
              </View>

              {enZona.length === 0 && accepted.length > 0 ? (
                <Text variant="footnote" tone="tertiary" style={styles.circleNote}>
                  A nadie de tu red le llegó esta alerta. El sismo no llegó hasta donde están.
                </Text>
              ) : null}

              {/* El desglose por grupo (migraciones 0031 y 0034).
                  Es la razón de ser de los grupos: «faltan 2 de Casa» y «faltan
                  12 de Amigos» son dos situaciones opuestas, y una lista plana
                  de 24 caras no las distingue en el minuto en que menos
                  capacidad de procesar tienes.

                  Solo se pintan los grupos con alguien EN ZONA: un grupo entero
                  fuera del sismo no tiene nada que confirmar, y listarlo en
                  0/0 sería ruido con forma de dato.

                  Y solo cuenta a la gente del grupo que además está en TU red:
                  del resto no hay estado que mostrar. El detalle del grupo lo
                  avisa y ofrece agregarlos. */}
              {resumenGrupos.length > 0 ? (
                <View style={styles.grupos}>
                  {resumenGrupos.map((g) => (
                    <View key={g.id} style={styles.grupoFila}>
                      <Text variant="footnote" numberOfLines={1} style={styles.flex}>
                        {g.name}
                      </Text>
                      <Text
                        variant="footnote"
                        weight="600"
                        tone={g.confirmados === g.total ? 'secondary' : 'primary'}>
                        {g.confirmados}/{g.total}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <View style={styles.circleBody}>
                {/*
                  Sin nadie en zona se muestra igual la red entera, apagada.
                  Una tarjeta vacía en mitad de un sismo se lee como "no tengo a
                  nadie", que es lo contrario de lo que queremos decir: los
                  tienes, y están fuera del sismo.
                */}
                <CircleGrid
                  members={enZona.length > 0 ? enZona : accepted}
                  activeQuakeId={activeQuake.id}
                  showStatus
                  collapsed
                />
              </View>
            </Card>

            {/*
              Va DESPUÉS de la red, no antes.

              El primer intento la puso entre "Mi estado" y la red, agrupando
              lo que la persona reporta sobre sí misma. Se lee ordenado y estaba
              mal: la tarjeta mide ~326 pt y empujaba la red a y≈877 en un
              iPhone de 852, o sea **completamente fuera de pantalla**. Ver a tu
              gente es el propósito de la app; que exija scroll durante un sismo
              es un error de prioridad, no de estética.

              Comprimirla no alcanzaba: aun borrando el mapa entero la red
              seguía arrancando cerca del borde inferior. El orden era el
              problema. Acá la ubicación asoma bajo la red, que es justo lo
              que se quiere de una acción de seguimiento — la haces minutos
              después de mirar cómo está tu gente, no antes.
            */}
            <MyLocationCard
              myStatus={myStatus}
              activeQuakeId={activeQuake.id}
              effectiveStatus={myEffectiveStatus}
              isDrill={isDrilling}
              onUpdated={reloadLocal}
            />

            {tip ? <TipCard tip={tip} variant="compact" onNext={nextTip} /> : null}
          </>
        ) : (
          <>
            <CalmBanner lastCheck={lastMonitoringCheck} />

            {incomingRequests.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/circle')}
                style={({ pressed }) => [
                  styles.requests,
                  { backgroundColor: colors.accentSoft },
                  pressed ? styles.pressed : null,
                ]}>
                <MaterialIcons name="person-add" size={20} color={colors.accent} />
                <Text variant="subhead" tone="accent" weight="600" style={styles.flex}>
                  {incomingRequests.length === 1
                    ? '1 solicitud de conexión'
                    : `${incomingRequests.length} solicitudes de conexión`}
                </Text>
                <MaterialIcons name="chevron-right" size={20} color={colors.accent} />
              </Pressable>
            ) : null}

            <PreparednessChecklist
              actionPlan={myProfile?.actionPlan ?? null}
              actionPlanUpdatedAt={myProfile?.actionPlanUpdatedAt ?? null}
              circleSize={accepted.length}
              drillsCompleted={mySettings?.drillsCompleted ?? 0}
            />

            <Reminder
              actionPlanUpdatedAt={myProfile?.actionPlanUpdatedAt ?? null}
              hasPlan={Boolean(myProfile?.actionPlan?.trim())}
              drillsCompleted={mySettings?.drillsCompleted ?? 0}
              sinUbicacion={myStatus?.latitude == null || myStatus?.longitude == null}
              magnitudNacional={mySettings?.alertCountrywideMagnitude ?? 6}
            />

            <Card>
              <View style={styles.circleHeader}>
                <Text variant="headline">Tu red</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Agregar contactos"
                  hitSlop={8}
                  onPress={() => router.push('/add-contacts')}
                  style={({ pressed }) => (pressed ? styles.pressed : null)}>
                  <MaterialIcons name="person-add-alt" size={22} color={colors.accent} />
                </Pressable>
              </View>
              <View style={styles.circleBody}>
                <CircleGrid members={accepted} activeQuakeId={null} showStatus={false} collapsed />
              </View>
            </Card>

            {tip ? <TipCard tip={tip} variant="expanded" onNext={nextTip} /> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/**
 * Recordatorio puntual y discreto (spec §5.2): aparece solo si hay algo real
 * que recordar, y desaparece en cuanto se resuelve. Nada de insistir.
 */
function Reminder({
  actionPlanUpdatedAt,
  hasPlan,
  drillsCompleted,
  sinUbicacion,
  magnitudNacional,
}: {
  actionPlanUpdatedAt: string | null;
  hasPlan: boolean;
  drillsCompleted: number;
  sinUbicacion: boolean;
  magnitudNacional: number;
}) {
  const { colors } = useTheme();
  const router = useRouter();

  const planStale = hasPlan && isOlderThan(actionPlanUpdatedAt, SIX_MONTHS_MS);

  // La ubicación va primero: sin ella la app no cumple lo que promete, y a
  // diferencia del resto la persona no tiene forma de notarlo sola. Se calla en
  // el segundo en que hay una posición guardada, como los demás recordatorios.
  const message = sinUbicacion
    ? {
        text: `Sin tu ubicación solo te avisamos de sismos de magnitud ${magnitudNacional.toFixed(1)} o más.`,
        href: '/settings' as const,
      }
    : !hasPlan
      ? {
          text: 'Todavía no escribiste tu plan de acción.',
          href: '/action-plan' as const,
        }
      : drillsCompleted === 0
        ? {
            text: 'Nunca hiciste un simulacro. Toma menos de dos minutos.',
            href: '/drill' as const,
          }
        : planStale
          ? {
              text: `Tu plan no se revisa desde hace ${timeAgo(actionPlanUpdatedAt)}.`,
              href: '/action-plan' as const,
            }
          : null;

  if (!message) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(message.href)}
      style={({ pressed }) => [
        styles.reminder,
        { borderColor: colors.border },
        pressed ? styles.pressed : null,
      ]}>
      <MaterialIcons name="info-outline" size={16} color={colors.textSecondary} />
      <Text variant="footnote" tone="secondary" style={styles.flex}>
        {message.text}
      </Text>
      <MaterialIcons name="chevron-right" size={18} color={colors.textTertiary} />
    </Pressable>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Buenos días';
  if (hour < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function firstName(displayName: string | undefined): string {
  if (!displayName?.trim()) return 'Hola';
  return displayName.trim().split(/\s+/)[0];
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg },
  header: { alignItems: 'center', flexDirection: 'row', gap: Spacing.md },
  flex: { flex: 1 },
  subline: { marginTop: 2 },
  picker: { marginTop: Spacing.lg },
  circleHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  circleNote: { marginTop: Spacing.xs },
  grupos: { gap: Spacing.xs, marginTop: Spacing.md },
  grupoFila: { alignItems: 'center', flexDirection: 'row', gap: Spacing.sm },
  circleBody: { marginTop: Spacing.lg },
  requests: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  reminder: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderStyle: 'dashed',
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  pressed: { opacity: 0.6 },
});
