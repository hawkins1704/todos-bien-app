import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { effectiveStatus, liveQuakeStatus, wasAlertedFor } from '@/lib/quakes';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { CircleMember } from '@/types/domain';

/**
 * 4 columnas fijas, y en la Home se corta a 2 filas.
 *
 * **Por qué el ancho es `25%` y no los 84 pt que tenía antes.** Con ancho fijo
 * la grilla envolvía sola y el número de columnas lo decidía el teléfono: 3 en
 * un iPhone normal (390 pt) y 4 solo en los Plus/Pro Max. Con eso era imposible
 * sostener "2 filas", porque las mismas 8 personas ocupaban 3 filas en la
 * mayoría de los equipos y el corte quedaba a la mitad de una fila.
 *
 * **Por qué el avatar bajó de 62 a 54.** En un iPhone SE cada celda queda con
 * ~72 pt útiles, y el `Avatar` no ocupa `size`: ocupa `size + 4 × ringWidth`
 * (ver `avatar.tsx`), que con 62 son 74 pt y el anillo de estado se salía del
 * corte. Con 54 el bloque mide 62 pt y entra con holgura en todos los anchos.
 */
const COLUMNS = 4;
const ROWS_IN_HOME = 2;
const MAX_IN_HOME = COLUMNS * ROWS_IN_HOME;
const AVATAR_SIZE = 54;

export type CircleGridProps = {
  members: CircleMember[];
  /** Cuando hay alerta activa, el estado se calcula respecto de ESE sismo. */
  activeQuakeId: string | null;
  /** En modo tranquilo no se muestran anillos de urgencia (spec §5.2). */
  showStatus: boolean;
  /**
   * En la Home se corta a 2 filas y aparece el botón de «ver completo». La
   * pantalla `/circle` pinta la lista entera, así que va en `false`.
   */
  collapsed?: boolean;
};

export function CircleGrid({
  members,
  activeQuakeId,
  showStatus,
  collapsed = false,
}: CircleGridProps) {
  const { colors } = useTheme();
  const router = useRouter();

  if (members.length === 0) {
    return (
      <View style={[styles.empty, { borderColor: colors.border }]}>
        <MaterialIcons name="group-add" size={28} color={colors.textTertiary} />
        <Text variant="callout" tone="secondary" center>
          Tu red está vacía
        </Text>
        <Text variant="footnote" tone="tertiary" center>
          La app solo sirve si las personas que te importan también están acá.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/add-contacts')}
          style={({ pressed }) => [
            styles.emptyAction,
            { backgroundColor: colors.accentSoft },
            pressed ? styles.pressed : null,
          ]}>
          <Text variant="footnote" weight="600" tone="accent">
            Agregar contactos
          </Text>
        </Pressable>
      </View>
    );
  }

  const visible = collapsed ? members.slice(0, MAX_IN_HOME) : members;
  const hidden = members.length - visible.length;

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {visible.map((member) => {
          // Con MI alerta activa manda el estado respecto de ESE sismo. Sin
          // alerta propia, el anillo aparece igual si a esta persona la alcanzó
          // un sismo que sigue vivo: es el caso de Guardián, y hasta ahora la
          // Home no mostraba nada aunque el aviso ya hubiera llegado.
          const status = showStatus
            ? effectiveStatus(member, activeQuakeId)
            : liveQuakeStatus(member);
          // Durante una alerta, a quien el sismo no alcanzó se lo apaga en vez
          // de marcarlo «sin confirmar»: no está callado, es que nunca se le
          // preguntó (migración 0025). Acá no lleva etiqueta —es una pantalla
          // de vistazo— pero la pestaña Círculo sí lo dice con palabras.
          const fueraDeLaZona = showStatus && !wasAlertedFor(member, activeQuakeId);

          return (
            <Pressable
              key={member.userId}
              accessibilityRole="button"
              onPress={() => router.push(`/contact/${member.userId}`)}
              style={({ pressed }) => [styles.item, pressed ? styles.pressed : null]}>
              <Avatar
                displayName={member.displayName}
                size={AVATAR_SIZE}
                status={status}
                showStatusBadge={status !== null}
                dimmed={fueraDeLaZona}
              />
              <Text variant="caption" center numberOfLines={1}>
                {firstName(member.displayName)}
              </Text>
              {member.isDrill && showStatus ? (
                <Text variant="caption" tone="accent" weight="600">
                  simulacro
                </Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* El botón se muestra solo cuando hay gente escondida. Con 8 o menos la
          grilla ya los está pintando a todos y un «ver completo» no llevaría a
          nada nuevo. */}
      {hidden > 0 ? (
        <Button
          title={`Ver mi red completa (${members.length})`}
          variant="outline"
          onPress={() => router.push('/circle')}
        />
      ) : null}
    </View>
  );
}

function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName;
}

const styles = StyleSheet.create({
  container: { gap: Spacing.md },
  // El margen negativo compensa el `paddingHorizontal` de las celdas, para que
  // la primera y la última columna queden a ras del contenido del Card en vez
  // de aparecer metidas 4 pt hacia adentro.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -Spacing.xs,
    rowGap: Spacing.md,
  },
  // El espacio entre columnas se hace con padding interno y no con `gap`:
  // `gap` restaría ancho al contenedor y `25%` dejaría de dar 4 columnas justas.
  item: {
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.xs,
    width: `${100 / COLUMNS}%`,
  },
  pressed: { opacity: 0.65 },
  empty: {
    alignItems: 'center',
    borderRadius: Radius.xl,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  emptyAction: {
    borderRadius: Radius.pill,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
});
