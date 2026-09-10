import { StyleSheet, View } from 'react-native';

import { Radius } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type ProgressBarProps = {
  /** De 0 a 100. Se recorta sola si llega algo fuera de rango. */
  value: number;
  height?: number;
  /** Para las barras chicas de cada módulo, que no deben competir con la de arriba. */
  tone?: 'accent' | 'muted';
  /**
   * Color explícito del relleno, para cuando la barra vive sobre una tarjeta de
   * color y el accent de la app quedaría fuera de tono. Pisa a `tone`.
   */
  color?: string;
  trackColor?: string;
  label?: string;
};

/**
 * Barra de progreso continua.
 *
 * No existía ninguna en el proyecto: la de `onboarding-step.tsx` es segmentada y
 * está fija en cuatro pasos, así que no sirve para «8 de 16».
 *
 * **Sin animación a propósito.** El valor llega del servidor y cambia al
 * refrescar; animarlo obligaría a guardar el valor anterior en un ref y a
 * escribirlo durante el render, que es justo lo que el compilador de React
 * prohíbe en este proyecto (`react-hooks/refs`). Una barra que salta no molesta
 * a nadie; un render impuro sí.
 */
export function ProgressBar({
  value,
  height = 10,
  tone = 'accent',
  color,
  trackColor,
  label,
}: ProgressBarProps) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={[styles.pista, { backgroundColor: trackColor ?? colors.border, height }]}
    >
      <View
        style={[
          styles.relleno,
          {
            width: `${pct}%`,
            height,
            backgroundColor: color ?? (tone === 'accent' ? colors.accent : colors.textTertiary),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pista: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    width: '100%',
  },
  relleno: { borderRadius: Radius.pill },
});
