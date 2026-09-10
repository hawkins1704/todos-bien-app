import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { Tip } from '@/types/domain';

export type TipCardProps = {
  tip: Tip;
};

/**
 * El consejo en **modo alerta**: una tarjeta sobria de una línea.
 *
 * Antes tenía dos variantes y un botón de «otro tip». Las dos se fueron el
 * 2026-09-10: en calma manda `DailyTipCard`, que es un banner de color con el
 * detalle detrás de un toque, y el consejo pasó a ser **uno por día**, así que
 * un botón para cambiarlo contradiría la idea entera.
 *
 * Acá no hay color ni foto a propósito. Esta versión se ve mientras la Home está
 * en modo sismo, y ahí el color es información —los cuatro estados— no adorno.
 * Una lámina verde al lado de «necesita ayuda» le roba fuerza al único rojo que
 * importa.
 */
export function TipCard({ tip }: TipCardProps) {
  const { colors } = useTheme();

  return (
    <Card>
      <View style={styles.header}>
        <View style={[styles.badge, { backgroundColor: colors.accentSoft }]}>
          <MaterialIcons name="lightbulb" size={14} color={colors.accent} />
          <Text variant="caption" weight="600" tone="accent">
            {PHASE_LABEL[tip.phase]}
          </Text>
        </View>
      </View>

      <Text variant="headline" style={styles.title}>
        {tip.title}
      </Text>

      <Text variant="subhead" tone="secondary">
        {tip.body}
      </Text>

      <Pressable
        onPress={() => void WebBrowser.openBrowserAsync(tip.sourceUrl)}
        accessibilityRole="link"
        accessibilityLabel={`Abrir la fuente: ${tip.sourceName}`}
        style={({ pressed }) => [styles.source, pressed ? styles.pressed : null]}>
        <Text variant="footnote" tone="accent" weight="600">
          Fuente: {tip.sourceName}
        </Text>
        <MaterialIcons name="open-in-new" size={13} color={colors.accent} />
      </Pressable>
    </Card>
  );
}

const PHASE_LABEL: Record<Tip['phase'], string> = {
  antes: 'Prepararse antes',
  durante: 'Durante el sismo',
  despues: 'Después del sismo',
};

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  badge: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  title: { marginBottom: Spacing.xs },
  source: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.md,
  },
  pressed: { opacity: 0.6 },
});
