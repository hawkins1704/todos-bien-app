import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { forwardRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

export type AuthFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Muestra el ojo para ver la contraseña y aplica los ajustes de teclado. */
  secure?: boolean;
  /** Pinta el borde en rojo. El texto del error lo pone la pantalla, una vez. */
  invalid?: boolean;
  hint?: string;
};

/**
 * Campo de las pantallas de acceso.
 *
 * Existe porque son cinco formularios con el mismo campo y el mismo borde rojo,
 * y sobre todo por el ojo de "ver contraseña": sin él, escribir una contraseña
 * larga a ciegas en un teclado de teléfono es la forma más común de quedarse
 * afuera de la propia cuenta.
 */
export const AuthField = forwardRef<TextInput, AuthFieldProps>(function AuthField(
  { label, secure = false, invalid = false, hint, ...rest },
  ref,
) {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);

  return (
    <View style={styles.field}>
      <Text variant="footnote" tone="secondary" weight="600">
        {label}
      </Text>

      <View style={styles.inputRow}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textTertiary}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={secure && !visible}
          accessibilityLabel={label}
          style={[
            styles.input,
            secure ? styles.inputWithAction : null,
            {
              backgroundColor: colors.surfaceSunken,
              borderColor: invalid ? colors.danger : colors.border,
              color: colors.text,
            },
          ]}
          {...rest}
        />

        {secure ? (
          <Pressable
            onPress={() => setVisible((current) => !current)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            style={styles.action}>
            <MaterialIcons
              name={visible ? 'visibility-off' : 'visibility'}
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
        ) : null}
      </View>

      {hint ? (
        <Text variant="caption" tone="tertiary">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: { gap: Spacing.xs },
  inputRow: { justifyContent: 'center' },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: 17,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  inputWithAction: { paddingRight: Spacing.xxl },
  action: { position: 'absolute', right: Spacing.lg },
});
