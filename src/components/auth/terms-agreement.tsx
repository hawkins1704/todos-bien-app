import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { PRIVACY_URL, TERMS_URL } from '@/lib/config';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * La aceptación de los términos, antes de crear la cuenta.
 *
 * **Por qué existe.** Apple rechazó el build 11 por la guía 1.2: una app con
 * contenido de usuario tiene que presentar el EULA *antes* de que la persona se
 * registre, y esos términos tienen que decir que no hay tolerancia con el
 * contenido ofensivo ni con quien abusa. Denunciar y bloquear ya existían —son
 * las otras dos piezas que pide la guía— y estaban bien; esta faltaba entera.
 *
 * **Por qué una casilla y no solo una línea con enlaces.** La nota pide que los
 * términos se *acepten*, no que estén disponibles. Una línea al pie es
 * información; una casilla que hay que tocar para que el botón se habilite es un
 * acto. Y es lo que se puede mostrar en el video que Apple pide con el reenvío:
 * se ve el botón apagado, se toca la casilla, se enciende.
 *
 * **Por qué el texto nombra el acoso.** El revisor no abre el enlace. Si la
 * pantalla solo dijera «acepto los términos», tendría que confiar en que adentro
 * dice lo que la guía exige. Diciéndolo acá, la condición se cumple a la vista.
 */
export function TermsAgreement({
  accepted,
  onToggle,
}: {
  accepted: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => onToggle(!accepted)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: accepted }}
      accessibilityLabel="Acepto los Términos de uso y la Política de privacidad"
      hitSlop={8}
      style={({ pressed }) => [styles.fila, pressed ? styles.pressed : null]}>
      <MaterialIcons
        name={accepted ? 'check-box' : 'check-box-outline-blank'}
        size={24}
        color={accepted ? colors.accent : colors.borderStrong}
      />

      {/* `pointerEvents="none"` para que tocar el texto también marque la
          casilla y no se pelee con el Pressable de afuera. Los enlaces van
          aparte, debajo, por lo mismo: un enlace embebido dentro del área que
          marca la casilla hace que abrir los términos la marque de paso, y eso
          convierte la aceptación en un accidente. */}
      <View style={styles.texto} pointerEvents="none">
        <Text variant="footnote" tone="secondary">
          Acepto los Términos de uso y la Política de privacidad. Entiendo que{' '}
          <Text variant="footnote" weight="700">
            no se tolera el contenido ofensivo ni el acoso
          </Text>
          , y que las cuentas que incumplan pueden ser suspendidas o eliminadas.
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * Los dos enlaces, fuera del área tocable de la casilla.
 *
 * Van en su propia fila a propósito: ver el documento y aceptarlo son dos
 * decisiones distintas y no pueden compartir el mismo toque.
 */
export function LegalLinks() {
  return (
    <View style={styles.enlaces}>
      <LegalLink label="Términos de uso" url={TERMS_URL} />
      <Text variant="caption" tone="tertiary">
        ·
      </Text>
      <LegalLink label="Política de privacidad" url={PRIVACY_URL} />
    </View>
  );
}

function LegalLink({ label, url }: { label: string; url: string }) {
  return (
    <Pressable
      onPress={() => void Linking.openURL(url)}
      accessibilityRole="link"
      hitSlop={8}
      style={({ pressed }) => (pressed ? styles.pressed : null)}>
      <Text variant="caption" tone="accent" weight="600">
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  texto: { flex: 1 },
  enlaces: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  pressed: { opacity: 0.6 },
});
