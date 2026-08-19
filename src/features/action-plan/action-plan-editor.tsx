import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

const MAX_LENGTH = 1000;

/**
 * Plan de acción en texto libre (spec §8, v1).
 *
 * El punto de encuentro marcado en mapa es premium y de fase futura: no va acá.
 */
const EXAMPLES = [
  'Salir al parque de la esquina de la casa y esperar ahí.',
  'Si estoy en el trabajo, bajo por la escalera y voy a la plaza de enfrente.',
  'Recojo a los chicos del colegio y nos vemos todos en casa de mi mamá.',
];

export function ActionPlanEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { colors } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.slice(0, MAX_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Ej: ir al parque de la vuelta de mi casa y esperar ahí a mi familia."
        placeholderTextColor={colors.textTertiary}
        multiline
        textAlignVertical="top"
        accessibilityLabel="Plan de acción"
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: focused ? colors.accent : colors.border,
            color: colors.text,
          },
        ]}
      />

      <Text variant="caption" tone="tertiary" style={styles.counter}>
        {value.length}/{MAX_LENGTH}
      </Text>

      <Card tone="sunken">
        <View style={styles.hintHeader}>
          <MaterialIcons name="tips-and-updates" size={16} color={colors.textSecondary} />
          <Text variant="footnote" tone="secondary" weight="600">
            Ejemplos
          </Text>
        </View>

        {EXAMPLES.map((example) => (
          <Pressable
            key={example}
            onPress={() => onChange(example)}
            accessibilityRole="button"
            accessibilityLabel={`Usar ejemplo: ${example}`}
            style={({ pressed }) => [styles.example, pressed ? styles.pressed : null]}>
            <Text variant="footnote" tone="secondary">
              “{example}”
            </Text>
          </Pressable>
        ))}
      </Card>

      <Text variant="caption" tone="tertiary">
        Tus contactos ven este plan junto con tu última ubicación cuando tocan tu foto.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.sm },
  input: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    fontSize: 17,
    lineHeight: 24,
    minHeight: 130,
    padding: Spacing.lg,
  },
  counter: { alignSelf: 'flex-end' },
  hintHeader: { alignItems: 'center', flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.sm },
  example: { paddingVertical: Spacing.xs },
  pressed: { opacity: 0.6 },
});
