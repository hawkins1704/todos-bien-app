import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useNow } from '@/hooks/use-now';
import { elapsedShort, formatMagnitude } from '@/lib/format';
import { describePlace } from '@/lib/geo';
import { Radius, Spacing, type StatusKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { QuakeEvent } from '@/types/domain';

/**
 * Presentación de un sismo: magnitud, zona, tiempo, profundidad e intensidad.
 *
 * Un solo componente para los dos usos que tiene la app, para que un sismo se
 * lea igual en todos lados:
 *
 * - `tone="alert"`   → banner de alerta activa en la Home (spec §5.1). Rojo,
 *                      urgente, porque exige una acción ahora.
 * - `tone="neutral"` → detalle en Noticias Sísmicas. El color lo define la
 *                      magnitud, no la urgencia: pintar de rojo un sismo de
 *                      hace 5 días haría parecer que hay una alerta activa
 *                      cuando no la hay.
 */
export type QuakeCardTone = 'alert' | 'neutral';

/**
 * Severidad por magnitud, para el modo neutral. Reutiliza la paleta de estados,
 * que ya está calibrada para contraste.
 */
export function magnitudeSeverity(magnitude: number): StatusKey {
  if (magnitude >= 6) return 'needs_help';
  if (magnitude >= 4.5) return 'helping';
  return 'unconfirmed';
}

export function QuakeCard({
  quake,
  tone = 'alert',
}: {
  quake: QuakeEvent;
  tone?: QuakeCardTone;
}) {
  const { status, colors } = useTheme();
  // El reloj avanza aunque no lleguen datos nuevos. Sin esto la tarjeta se
  // quedaba diciendo «hace 1 min» con el sismo cumpliendo media hora: la hora
  // se congelaba en el último render, y sin datos nuevos no hay render.
  const now = useNow();

  const palette =
    tone === 'alert' ? status.needs_help : status[magnitudeSeverity(quake.magnitude)];

  const lugar = describePlace(quake.place, quake.source);

  /**
   * Dónde fue, con una palabra más que el nombre suelto.
   *
   * El IGP manda provincia y departamento y hasta ahora se tiraban: la tarjeta
   * decía "Sismo en Coracora" y nada más, que para quien no ubica el distrito no
   * dice si tembló al lado o a 600 km. Para los sismos de afuera no hay
   * equivalente, así que ahí va el país y el continente.
   */
  const procedencia = lugar.area ?? lugar.label;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: palette.soft, borderColor: palette.base },
      ]}>
      <View style={[styles.magnitudeWell, { backgroundColor: palette.base }]}>
        <Text variant="title2" style={styles.magnitudeValue}>
          {formatMagnitude(quake.magnitude)}
        </Text>
        <Text variant="caption" style={styles.magnitudeUnit}>
          magnitud
        </Text>
      </View>

      <View style={styles.details}>
        <Text variant="headline" style={{ color: palette.strong }} numberOfLines={2}>
          {tone === 'alert' ? `Sismo en ${lugar.spot}` : lugar.spot}
        </Text>

        {procedencia ? (
          <Text
            variant="footnote"
            weight="500"
            style={{ color: palette.strong }}
            numberOfLines={1}>
            {procedencia}
          </Text>
        ) : null}

        <View style={styles.metaRow}>
          <MaterialIcons name="schedule" size={13} color={palette.strong} />
          <Text variant="footnote" style={{ color: palette.strong }}>
            {elapsedShort(quake.occurredAt, now)}
          </Text>

          {quake.depthKm != null ? (
            <>
              <Text variant="footnote" style={{ color: palette.strong }}>
                ·
              </Text>
              <Text variant="footnote" style={{ color: palette.strong }}>
                {Math.round(quake.depthKm)} km de profundidad
              </Text>
            </>
          ) : null}
        </View>

        {quake.intensityMmi ? (
          <View style={[styles.intensity, { backgroundColor: colors.surface }]}>
            <Text variant="caption" weight="600" style={{ color: palette.strong }}>
              Intensidad {quake.intensityMmi} (Mercalli)
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderWidth: 1,
    flexDirection: 'row',
    gap: Spacing.lg,
    padding: Spacing.lg,
  },
  magnitudeWell: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    height: 68,
    justifyContent: 'center',
    width: 68,
  },
  magnitudeValue: { color: '#FFFFFF', fontWeight: '700' },
  magnitudeUnit: { color: '#FFFFFF', opacity: 0.9 },
  details: { flex: 1, gap: Spacing.xs },
  metaRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  intensity: {
    alignSelf: 'flex-start',
    borderRadius: Radius.sm,
    marginTop: 2,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
});
