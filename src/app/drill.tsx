import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CircleGrid } from '@/components/circle-grid';
import { DrillBanner } from '@/components/drill-banner';
import { PremiumCta } from '@/components/premium-cta';
import { StatusPicker } from '@/components/status-picker';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { DRILL_LIMIT_ERROR, useDrill } from '@/context/drill';
import { captureLocationOnce } from '@/lib/location';
import { reportMyStatus } from '@/lib/sync';
import { Radius, Spacing, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { FREE_DRILL_LIMIT } from '@/types/domain';

type Step = 'intro' | 'alert' | 'report' | 'done';

/**
 * Modo simulacro (spec §9).
 *
 * Todo el recorrido va marcado con DrillBanner de forma persistente e
 * inequívoca, y el estado que se reporta viaja con `is_drill = true` para que
 * el círculo nunca confunda la práctica con un evento real.
 */
export default function DrillScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, status } = useTheme();
  const { accepted, mySettings, reloadLocal } = useAppData();
  const { start, finish, abandon, activeDrill } = useDrill();

  const [step, setStep] = useState<Step>('intro');
  const [mode, setMode] = useState<'silent' | 'notify'>('silent');
  const [reported, setReported] = useState<StatusKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limiteServidor, setLimiteServidor] = useState(false);

  const remaining = mySettings?.isPremium
    ? Infinity
    : Math.max(0, FREE_DRILL_LIMIT - (mySettings?.drillsCompleted ?? 0));

  // El servidor también corta por su cuenta: si la cuenta local viene atrasada,
  // `remaining` puede decir que quedan y el rechazo llegar igual.
  const sinSimulacros = remaining === 0 || limiteServidor;

  const begin = async () => {
    setBusy(true);
    setError(null);
    try {
      await start(mode);
      setStep('alert');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      if (message.includes(DRILL_LIMIT_ERROR)) {
        setLimiteServidor(true);
      } else {
        setError('No pudimos iniciar el simulacro. Revisa tu conexión.');
      }
    } finally {
      setBusy(false);
    }
  };

  const report = async (chosen: StatusKey) => {
    setBusy(true);
    try {
      const fix = await captureLocationOnce();
      await reportMyStatus({
        status: chosen,
        location: fix,
        quakeEventId: null,
        isDrill: true,
      });
      setReported(chosen);
      await reloadLocal();
      setStep('done');
    } finally {
      setBusy(false);
    }
  };

  const close = async () => {
    setBusy(true);
    try {
      if (activeDrill) await finish(reported);
      // Deja el estado limpio: la marca de simulacro no debe quedar pegada.
      await reportMyStatus({ status: reported ?? 'safe', quakeEventId: null, isDrill: false });
      await reloadLocal();
    } catch {
      await abandon();
    } finally {
      setBusy(false);
      router.replace('/');
    }
  };

  const cancel = async () => {
    await abandon();
    router.replace('/');
  };

  return (
    <Screen tone="plain">
      {/* Pantalla sin header nativo: el banner es lo primero y por eso se lleva
          el safe area de arriba (si no, queda debajo del reloj). El paddingTop
          del ScrollView lo omite justamente cuando el banner está visible. */}
      {step === 'intro' ? null : <DrillBanner topInset />}

      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: step === 'intro' ? insets.top + Spacing.xl : Spacing.xl,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}>
        {step === 'intro' ? (
          <>
            <View style={[styles.hero, { backgroundColor: colors.accentSoft }]}>
              <MaterialIcons name="school" size={48} color={colors.accent} />
            </View>

            <Text variant="title" center>
              Practicar antes, no durante
            </Text>
            <Text variant="body" tone="secondary" center>
              Vas a recorrer el flujo completo: llega la alerta, reportas tu estado y ves cómo
              queda el dashboard. Toma menos de dos minutos.
            </Text>

            {/* Sin simulacros disponibles el selector de modo sobra: ofrecería
                elegir cómo hacer algo que no se puede empezar. */}
            {sinSimulacros ? null : (
              <Card>
                <Text variant="footnote" tone="secondary" weight="600">
                  ¿AVISAMOS A TU CÍRCULO?
                </Text>

                <ModeOption
                  selected={mode === 'silent'}
                  onPress={() => setMode('silent')}
                  icon="volume-off"
                  title="Modo silencioso"
                  detail="Practicas tú solo. Nadie de tu círculo se entera ni recibe nada."
                />

                <ModeOption
                  selected={mode === 'notify'}
                  onPress={() => setMode('notify')}
                  icon="campaign"
                  title="Avisar a mi círculo"
                  detail="Les llega un aviso que dice claramente que es un simulacro, nunca el texto de una alerta real."
                />
              </Card>
            )}

            {error ? (
              <Text variant="footnote" tone="danger" center>
                {error}
              </Text>
            ) : null}

            {/* Agotados los simulacros gratuitos se explica y se ofrece Premium,
                en vez de dejar un botón deshabilitado sin salida. */}
            {sinSimulacros ? (
              <Card>
                <Text variant="headline" center style={styles.limiteTitulo}>
                  Ya hiciste tus {FREE_DRILL_LIMIT} simulacros
                </Text>
                <Text variant="subhead" tone="secondary" center style={styles.limiteTexto}>
                  Practicaste el flujo completo las {FREE_DRILL_LIMIT} veces que incluye el
                  plan gratuito. Con Premium puedes repetirlo cuando quieras.
                </Text>
                <PremiumCta />
              </Card>
            ) : (
              <>
                {remaining !== Infinity ? (
                  <Text variant="caption" tone="tertiary" center>
                    Te quedan {remaining} de {FREE_DRILL_LIMIT} simulacros del plan gratuito.
                  </Text>
                ) : null}

                <Button
                  title="Empezar simulacro"
                  onPress={() => void begin()}
                  loading={busy}
                  size="lg"
                />
              </>
            )}

            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              style={({ pressed }) => (pressed ? styles.pressed : null)}>
              <Text variant="footnote" tone="secondary" center>
                {sinSimulacros ? 'Volver' : 'Ahora no'}
              </Text>
            </Pressable>
          </>
        ) : null}

        {step === 'alert' ? (
          <>
            <View style={[styles.alertHero, { backgroundColor: status.needs_help.soft }]}>
              <MaterialIcons name="warning" size={44} color={status.needs_help.base} />
              <Text variant="title2" center style={{ color: status.needs_help.strong }}>
                Sismo de magnitud 5,8
              </Text>
              <Text variant="subhead" center style={{ color: status.needs_help.strong }}>
                Lima · hace 1 min
              </Text>
            </View>

            <Text variant="body" tone="secondary" center>
              Así se vería la alerta de verdad. Lo único que tienes que hacer es tocar tu estado:
              tu círculo lo ve al instante.
            </Text>

            <Button title="Continuar" onPress={() => setStep('report')} size="lg" />

            <Pressable
              onPress={() => void cancel()}
              accessibilityRole="button"
              style={({ pressed }) => (pressed ? styles.pressed : null)}>
              <Text variant="footnote" tone="secondary" center>
                Salir del simulacro
              </Text>
            </Pressable>
          </>
        ) : null}

        {step === 'report' ? (
          <>
            <Text variant="title2">¿Cómo estás?</Text>
            <Text variant="body" tone="secondary">
              Elige uno. En un sismo real este es el único paso que importa.
            </Text>

            <StatusPicker
              value={reported}
              onChange={(chosen) => void report(chosen)}
              disabled={busy}
            />

            {busy ? (
              <Text variant="caption" tone="tertiary" center>
                Guardando y tomando tu ubicación…
              </Text>
            ) : null}
          </>
        ) : null}

        {step === 'done' ? (
          <>
            <View style={[styles.hero, { backgroundColor: status.safe.soft }]}>
              <MaterialIcons name="check-circle" size={48} color={status.safe.base} />
            </View>

            <Text variant="title" center>
              Eso es todo
            </Text>
            <Text variant="body" tone="secondary" center>
              Un toque y listo. Así se ve tu círculo cuando todos reportan.
            </Text>

            <Card>
              <Text variant="headline">Tu círculo</Text>
              <View style={styles.circleBody}>
                <CircleGrid members={accepted} activeQuakeId={null} showStatus />
              </View>
            </Card>

            <Button title="Terminar" onPress={() => void close()} loading={busy} size="lg" />
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function ModeOption({
  selected,
  onPress,
  icon,
  title,
  detail,
}: {
  selected: boolean;
  onPress: () => void;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.mode,
        {
          backgroundColor: selected ? colors.accentSoft : 'transparent',
          borderColor: selected ? colors.accent : colors.border,
        },
        pressed ? styles.pressed : null,
      ]}>
      <MaterialIcons
        name={icon}
        size={22}
        color={selected ? colors.accent : colors.textSecondary}
      />
      <View style={styles.modeCopy}>
        <Text variant="callout" weight={selected ? '600' : '400'}>
          {title}
        </Text>
        <Text variant="caption" tone="secondary">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    height: 100,
    justifyContent: 'center',
    width: 100,
  },
  alertHero: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  mode: {
    alignItems: 'flex-start',
    borderRadius: Radius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.md,
  },
  modeCopy: { flex: 1, gap: 2 },
  circleBody: { marginTop: Spacing.lg },
  limiteTitulo: { marginBottom: Spacing.xs },
  limiteTexto: { marginBottom: Spacing.lg },
  pressed: { opacity: 0.7 },
});
