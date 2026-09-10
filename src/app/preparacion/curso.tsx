import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import { fetchMyTipProgress, fetchPreparedness, markTipDone } from '@/lib/api';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { Tip } from '@/types/domain';

const FASES = [
  { key: 'antes', title: 'Antes', detail: 'Lo que se hace hoy, con calma.' },
  { key: 'durante', title: 'Durante', detail: 'Los segundos que deciden.' },
  { key: 'despues', title: 'Después', detail: 'Cuando paró de temblar.' },
] as const;

/**
 * El minicurso: los 12 consejos con fuente, por fin con casa propia.
 *
 * Estaban sembrados en `public.tips` desde la 0005 —6 del INDECI, 4 de la Cruz
 * Roja, 2 del IGP, cada uno con enlace a su fuente— y hasta ahora se veían **de
 * a uno rotando** al fondo de Inicio. Acá se leen ordenados por fase.
 *
 * ## Es el único módulo individual, y no se cobra aparte
 *
 * Nadie aprende por otro, así que el avance es de cada persona
 * (`tip_progress`). Pero el candado del Centro es uno solo y está en la puerta
 * del hogar: un integrante gratis de una casa pagada hace su curso igual. Ver
 * `docs/MONETIZACION.md`.
 *
 * El progreso del hogar cuenta **cuántos terminaron**, no cuántos consejos leyó
 * el que más leyó: una casa donde solo el papá sabe qué hacer no está preparada.
 */
export default function CursoScreen() {
  const insets = useSafeAreaInsets();
  const { tips } = useAppData();
  const { userId } = useAuth();

  const [hechos, setHechos] = useState<string[]>([]);
  const [premium, setPremium] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(async () => {
    if (!userId) return;
    try {
      const p = await fetchPreparedness();
      setPremium(p?.premium ?? false);
      setHechos(await fetchMyTipProgress(userId));
    } catch (caught) {
      if (__DEV__) console.warn('[curso] no se pudo cargar', caught);
    } finally {
      setCargando(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const marcar = useCallback(
    async (tipId: string) => {
      if (!userId || hechos.includes(tipId)) return;
      setHechos((p) => [...p, tipId]);
      try {
        await markTipDone(userId, tipId);
      } catch (caught) {
        if (__DEV__) console.warn('[curso] no se pudo marcar', caught);
        setHechos((p) => p.filter((id) => id !== tipId));
      }
    },
    [hechos, userId],
  );

  if (cargando) return <Screen />;

  const total = tips.length;
  const pct = total === 0 ? 0 : Math.round((hechos.length / total) * 100);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xxl }]}>
        <Card>
          <View style={styles.barraFila}>
            <Text variant="footnote" tone="secondary">
              Tu avance
            </Text>
            <Text variant="title3">
              {hechos.length}/{total}
            </Text>
          </View>
          <ProgressBar value={pct} label="Tu avance en el curso" />
          <Text variant="footnote" tone="secondary" style={styles.pie}>
            Todo esto es del INDECI, la Cruz Roja Peruana y el IGP. Cada consejo lleva el enlace a
            su fuente.
          </Text>
        </Card>

        {FASES.map((fase) => {
          const deLaFase = tips.filter((t) => t.phase === fase.key);
          if (deLaFase.length === 0) return null;

          return (
            <View key={fase.key} style={styles.seccion}>
              <Text variant="headline">{fase.title}</Text>
              <Text variant="footnote" tone="secondary">
                {fase.detail}
              </Text>

              <Card padded={false} style={styles.tarjeta}>
                {deLaFase.map((tip, i) => (
                  <TipRow
                    key={tip.id}
                    tip={tip}
                    hecho={hechos.includes(tip.id)}
                    abierto={abierto === tip.id}
                    primero={i === 0}
                    puedeMarcar={premium}
                    onAbrir={() => {
                      const nuevo = abierto === tip.id ? null : tip.id;
                      setAbierto(nuevo);
                      if (nuevo && premium) void marcar(tip.id);
                    }}
                  />
                ))}
              </Card>
            </View>
          );
        })}

        {premium ? null : (
          <Card tone="sunken">
            <Text variant="footnote" tone="secondary">
              Tu hogar no tiene Premium: puedes leer los consejos, pero tu avance no se guarda ni
              cuenta para el progreso de tu casa.
            </Text>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function TipRow({
  tip,
  hecho,
  abierto,
  primero,
  puedeMarcar,
  onAbrir,
}: {
  tip: Tip;
  hecho: boolean;
  abierto: boolean;
  primero: boolean;
  puedeMarcar: boolean;
  onAbrir: () => void;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={
        primero
          ? undefined
          : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
      }>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: abierto }}
        accessibilityLabel={tip.title}
        onPress={onAbrir}
        style={({ pressed }) => [styles.fila, pressed ? styles.presionada : null]}>
        <MaterialIcons
          name={hecho ? 'check-circle' : 'radio-button-unchecked'}
          size={22}
          color={hecho && puedeMarcar ? colors.accent : colors.textTertiary}
        />
        <Text variant="callout" style={styles.flex}>
          {tip.title}
        </Text>
        <MaterialIcons
          name={abierto ? 'expand-less' : 'expand-more'}
          size={20}
          color={colors.textTertiary}
        />
      </Pressable>

      {abierto ? (
        <View style={styles.cuerpo}>
          <Text variant="footnote" tone="secondary">
            {tip.longBody ?? tip.body}
          </Text>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Abrir la fuente: ${tip.sourceName}`}
            onPress={() => void WebBrowser.openBrowserAsync(tip.sourceUrl)}
            style={styles.fuente}>
            <Text variant="caption" tone="accent">
              Fuente: {tip.sourceName}
            </Text>
            <MaterialIcons name="open-in-new" size={13} color={colors.accent} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  barraFila: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  content: { gap: Spacing.lg, padding: Spacing.lg },
  cuerpo: {
    gap: Spacing.sm,
    paddingBottom: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingLeft: Spacing.lg + 22 + Spacing.md,
  },
  fila: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.lg,
  },
  flex: { flex: 1 },
  fuente: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs },
  pie: { marginTop: Spacing.sm },
  presionada: { opacity: 0.6 },
  seccion: { gap: Spacing.xs },
  tarjeta: { marginTop: Spacing.sm },
});
