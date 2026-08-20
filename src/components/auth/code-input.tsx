import { forwardRef } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { AUTH_CODE_LENGTH } from '@/lib/config';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Con códigos largos hay que apretar la tipografía para que entren en pantallas
 * chicas: el proyecto usa 8 dígitos, no los 6 del default de Supabase.
 */
const FONT_SIZE = AUTH_CODE_LENGTH > 6 ? 28 : 32;
const LETTER_SPACING = AUTH_CODE_LENGTH > 6 ? 6 : 10;

export type CodeInputProps = {
  value: string;
  onChange: (code: string) => void;
  /** Se dispara sola al completar el largo, sin que haya que tocar el botón. */
  onComplete?: (code: string) => void;
  invalid?: boolean;
  autoFocus?: boolean;
};

/**
 * Campo del código de 8 dígitos que llega por correo. Lo usan las dos pantallas
 * que todavía dependen del correo: confirmar la cuenta y recuperar la contraseña.
 */
export const CodeInput = forwardRef<TextInput, CodeInputProps>(function CodeInput(
  { value, onChange, onComplete, invalid = false, autoFocus = false },
  ref,
) {
  const { colors } = useTheme();

  return (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={(text) => {
        const digits = text.replace(/\D/g, '').slice(0, AUTH_CODE_LENGTH);
        onChange(digits);
        if (digits.length === AUTH_CODE_LENGTH) onComplete?.(digits);
      }}
      placeholder={'0'.repeat(AUTH_CODE_LENGTH)}
      placeholderTextColor={colors.textTertiary}
      keyboardType="number-pad"
      inputMode="numeric"
      autoComplete="one-time-code"
      textContentType="oneTimeCode"
      autoFocus={autoFocus}
      maxLength={AUTH_CODE_LENGTH}
      accessibilityLabel="Código de verificación"
      style={[
        styles.input,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: invalid ? colors.danger : colors.border,
          color: colors.text,
        },
      ]}
    />
  );
});

const styles = StyleSheet.create({
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: FONT_SIZE,
    fontWeight: '600',
    letterSpacing: LETTER_SPACING,
    paddingVertical: Spacing.lg,
    textAlign: 'center',
  },
});
