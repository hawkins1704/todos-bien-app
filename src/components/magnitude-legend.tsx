import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Spacing, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Qué significa el color del cuadro de magnitud.
 *
 * Los tres tramos son los mismos que decide `magnitudeSeverity()` en
 * `quake-card.tsx`; si allá se mueve un corte, hay que moverlo acá. Están
 * duplicados a propósito y no derivados: la función mapea un número a un color,
 * y esto necesita el camino inverso —el rango que produce cada color— que no se
 * puede sacar de ella sin invertirla.
 *
 * **No es decoración.** Sin leyenda, el color es un dato que la app muestra y no
 * explica: alguien ve un cuadro ámbar y no sabe si es peor o mejor que uno gris.
 * Y como la escala reutiliza la paleta de estados de personas (rojo = "necesito
 * ayuda"), sin contexto un sismo rojo puede leerse como una alerta activa.
 *
 * El rango va escrito en cada entrada, así que la información no depende solo
 * del color (spec §4, daltonismo rojo-verde).
 */
const TRAMOS: { key: StatusKey; etiqueta: string; rango: string }[] = [
  { key: 'unconfirmed', etiqueta: 'Leve', rango: 'menos de 4,5' },
  { key: 'helping', etiqueta: 'Moderado', rango: '4,5 a 5,9' },
  { key: 'needs_help', etiqueta: 'Fuerte', rango: '6,0 o más' },
];

export function MagnitudeLegend() {
  const { status } = useTheme();

  return (
    <View
      style={styles.fila}
      accessible
      accessibilityLabel={
        'Escala de color por magnitud. ' +
        TRAMOS.map((t) => `${t.etiqueta}, ${t.rango}`).join('. ')
      }>
      {TRAMOS.map((tramo) => (
        <View key={tramo.key} style={styles.tramo}>
          <View style={[styles.punto, { backgroundColor: status[tramo.key].base }]} />
          <Text variant="caption" tone="tertiary">
            {tramo.etiqueta} {tramo.rango}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // `wrap` para que con el texto del sistema agrandado los tramos bajen de
  // línea en vez de recortarse.
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md, rowGap: Spacing.xs },
  tramo: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs },
  punto: { borderRadius: 4, height: 8, width: 8 },
});
