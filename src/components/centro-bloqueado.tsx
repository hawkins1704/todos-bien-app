import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumCta } from '@/components/premium-cta';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Radius, Spacing, tabScreenBottomInset, type ModuleKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/** Los mismos seis módulos y en el mismo orden que el Centro de verdad. */
const MODULOS: { key: ModuleKey; icon: keyof typeof MaterialIcons.glyphMap }[] = [
  { key: 'hogar', icon: 'home' },
  { key: 'mochila', icon: 'backpack' },
  { key: 'plan', icon: 'place' },
  { key: 'roles', icon: 'assignment-ind' },
  { key: 'curso', icon: 'menu-book' },
  { key: 'simulacro', icon: 'notifications-active' },
];

/**
 * El Centro con el Premium vencido: se ve **que está**, no se ve **qué dice**.
 *
 * ## Detrás del candado no está el Centro tapado: está su silueta
 *
 * Las mismas seis tarjetas, los mismos colores, las mismas dos columnas — con
 * barras en lugar de los textos y los números. Es lo que hace que se lea «esto
 * es tuyo y sigue ahí» sin mostrar una sola cosa de la casa.
 *
 * 🔴 Y es lo que hace que **no haga falta ninguna capa encima**. Un desenfoque
 * de verdad necesita `expo-blur`, que además de ser dependencia nativa —build
 * nuevo de las dos tiendas— **en Android depende de la versión**: por debajo de
 * Android 12 cae en RenderScript o directamente en nada, y «nada» ahí significa
 * los datos legibles detrás de una capa que no borronea. `expo-glass-effect`, que
 * sí está instalado, falla igual: `GlassView` es de iOS 26 para arriba y en todo
 * lo demás es una `View` común.
 *
 * Una silueta no puede filtrar nada porque nunca tuvo qué filtrar, se ve igual en
 * todos los teléfonos, y encima deja los colores limpios. Hubo un velo tenue por
 * estética y se quitó: teñía las tarjetas, que son justamente lo que tiene que
 * verse.
 *
 * ## Por qué no scrollea
 *
 * No hay nada que leer más abajo, y el candado tiene que quedar siempre a la
 * vista en vez de irse con el dedo.
 */
export function CentroBloqueado() {
  const insets = useSafeAreaInsets();
  const { colors, modules } = useTheme();

  return (
    <View style={[styles.raiz, { paddingTop: insets.top + Spacing.xl }]}>
      {/* La cabecera queda legible: saber en qué pantalla estás no es un dato
          del hogar, y esconderla convertiría el candado en una pantalla rota. */}
      <View style={styles.cabecera}>
        <Text variant="title">Centro de Preparación</Text>
        <Text variant="subhead" tone="secondary" style={styles.bajada}>
          Tu hogar ya está armado. Vuelve a Premium para verlo y seguir donde lo dejaron.
        </Text>
      </View>

      {/* Sin padding horizontal ni inferior: la silueta llega a los cuatro
          bordes. Los márgenes de las tarjetas van adentro, no acá — si no,
          quedaban dos franjas de fondo a los costados y el candado se leía como
          una tarjeta flotando en una página en blanco en vez de como una
          pantalla que sigue estando. */}
      <View style={styles.escena}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[styles.fantasma, { paddingBottom: tabScreenBottomInset(insets.bottom) }]}>
          <Card>
            <View style={styles.barraFila}>
              <Barra ancho={72} alto={10} color={colors.textTertiary} />
              <Barra ancho={44} alto={14} color={colors.textSecondary} />
            </View>
            <Barra ancho="100%" alto={10} color={colors.borderStrong} />
          </Card>

          <View style={styles.rejilla}>
            {MODULOS.map(({ key, icon }) => {
              const paleta = modules[key];
              return (
                <View key={key} style={[styles.tarjeta, { backgroundColor: paleta.bg }]}>
                  <View style={styles.tarjetaTope}>
                    <View style={[styles.pozo, { backgroundColor: `${paleta.ink}2E` }]}>
                      <MaterialIcons name={icon} size={20} color={paleta.ink} />
                    </View>
                    <Barra ancho={28} alto={11} color={`${paleta.ink}66`} />
                  </View>

                  <View style={styles.tarjetaTexto}>
                    <Barra ancho="76%" alto={11} color={`${paleta.ink}66`} />
                    <Barra ancho="54%" alto={9} color={`${paleta.ink}4D`} />
                  </View>

                  <Barra ancho="100%" alto={5} color={`${paleta.ink}40`} />
                </View>
              );
            })}
          </View>
        </View>

        {/* No hay velo. Lo hubo, y era solo decoración: lo que impide leer los
            datos no es una capa encima, es que **abajo no hay datos** — hay
            barras. Teñir la pantalla no protegía nada y ensuciaba los colores
            de las tarjetas, que son justamente lo que tiene que verse para que
            se lea «esto es tuyo y sigue ahí». */}

        <View style={styles.aviso}>
          <Card>
            <View style={[styles.candado, { backgroundColor: colors.accentSoft }]}>
              <MaterialIcons name="lock" size={22} color={colors.accent} />
            </View>

            <Text variant="headline" center>
              Tus datos siguen aquí
            </Text>
            <Text variant="footnote" tone="secondary" center style={styles.copia}>
              No se borró nada. Vuelve a Premium y tu casa lo ve otra vez, tal como lo dejaron.
            </Text>

            {/* Todo centrado, incluido el candado: el botón de `PremiumCta` es de
                ancho completo y el texto que va debajo viene centrado de fábrica,
                así que alinear a la izquierda esta mitad partía la tarjeta en dos
                criterios. `PremiumCta` no se toca — lo comparten el simulacro, la
                pestaña de sismos y el candado sin hogar. */}
            <View style={styles.accion}>
              <PremiumCta />
            </View>
          </Card>
        </View>
      </View>
    </View>
  );
}

/**
 * El candado de un módulo suelto.
 *
 * En uso normal no se ve nunca: con el Premium vencido el Centro entero está
 * velado y no ofrece ninguna tarjeta. Existe por la **pila de navegación** — si
 * a alguien se le vence estando dentro de la mochila, `useFocusEffect` recarga
 * y sin esto la pantalla seguiría mostrando la lista.
 */
export function ModuloBloqueado() {
  const { colors } = useTheme();

  return (
    <View style={styles.solo}>
      <Card>
        <View style={[styles.candado, { backgroundColor: colors.accentSoft }]}>
          <MaterialIcons name="lock" size={22} color={colors.accent} />
        </View>
        <Text variant="headline" center>
          Tus datos siguen aquí
        </Text>
        <Text variant="footnote" tone="secondary" center style={styles.copia}>
          Nada se borró. Vuelve a Premium y tu casa lo ve otra vez, tal como lo dejaron.
        </Text>
        <View style={styles.accion}>
          <PremiumCta />
        </View>
      </Card>
    </View>
  );
}

/** Una barra gris donde iría un texto. */
function Barra({
  ancho,
  alto,
  color,
}: {
  ancho: number | `${number}%`;
  alto: number;
  color: string;
}) {
  return <View style={{ backgroundColor: color, borderRadius: Radius.pill, height: alto, width: ancho }} />;
}

const styles = StyleSheet.create({
  // El aire que pedía la tarjeta: la descripción y el botón estaban pegados y
  // se leían como un solo bloque.
  accion: { marginTop: Spacing.xl },
  aviso: {
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    paddingHorizontal: Spacing.lg,
  },
  bajada: { marginTop: Spacing.xs },
  cabecera: { marginBottom: Spacing.lg, paddingHorizontal: Spacing.lg },
  fantasma: { paddingHorizontal: Spacing.lg },
  barraFila: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  candado: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    height: 44,
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: 44,
  },
  copia: { marginTop: Spacing.sm },
  escena: { flex: 1, overflow: 'hidden' },
  pozo: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  raiz: { flex: 1 },
  rejilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  solo: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
  tarjeta: {
    borderRadius: Radius.xl,
    gap: Spacing.md,
    minHeight: 148,
    padding: Spacing.lg,
    width: '48%',
  },
  tarjetaTexto: { flex: 1, gap: Spacing.sm },
  tarjetaTope: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
