import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumCta } from '@/components/premium-cta';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { DRILL_LIMIT_ERROR, useDrill } from '@/context/drill';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import { FREE_DRILL_LIMIT } from '@/types/domain';

/**
 * Convocar un simulacro.
 *
 * **Esta pantalla ya no ES el simulacro**, y ese es el cambio de la 0035. Antes
 * el simulacro entero vivía acá: una alerta de mentira, un selector de estado
 * propio y un resumen. Se practicaba en una maqueta, así que lo que se aprendía
 * era a usar la maqueta — el día del sismo la pantalla iba a ser otra.
 *
 * Ahora esto solo elige con quién y arranca. Lo que sigue pasa en la app de
 * verdad: la Home entra en modo alerta, la red se pinta, la ubicación se
 * captura. Lo único falso es el sismo.
 */
export default function DrillScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { groups, mySettings } = useAppData();
  const { start } = useDrill();

  const [elegido, setElegido] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limiteServidor, setLimiteServidor] = useState(false);

  const esPremium = mySettings?.isPremium ?? false;
  const usados = mySettings?.drillsCompleted ?? 0;
  const restantes = esPremium ? Infinity : Math.max(0, FREE_DRILL_LIMIT - usados);

  // El servidor también corta por su cuenta: si la cuenta local viene atrasada,
  // `restantes` puede decir que quedan y el rechazo llegar igual.
  const sinCupo = restantes === 0 || limiteServidor;

  // Solo los grupos que creaste: convocar es de quien lo armó (migración 0035).
  const misGrupos = groups.filter((g) => g.isOwner);

  const empezar = async () => {
    setBusy(true);
    setError(null);
    try {
      await start(elegido);
      // `dismissTo` y no `replace`: esta pantalla es un modal a pantalla
      // completa, así que `replace` montaría la Home DENTRO de la presentación
      // modal. Lo que se quiere es cerrar el modal y aterrizar en la Home, que
      // es donde ocurre el simulacro.
      router.dismissTo('/');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : '';
      const code = (caught as { code?: unknown } | null)?.code;

      if (message.includes(DRILL_LIMIT_ERROR)) {
        setLimiteServidor(true);
      } else if (code === '42501') {
        setError('Ya hay un simulacro activo en ese grupo, o dejaste de ser quien lo administra.');
      } else {
        setError('No pudimos iniciar el simulacro. Revisa tu conexión.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen tone="plain">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + Spacing.xl, paddingBottom: insets.bottom + Spacing.xl },
        ]}>
        <View style={[styles.hero, { backgroundColor: colors.accentSoft }]}>
          <MaterialIcons name="school" size={44} color={colors.accent} />
        </View>

        <Text variant="title" center>
          Practicar antes, no durante
        </Text>
        <Text variant="body" tone="secondary" center>
          La app se va a comportar como si acabara de temblar: vas a reportar tu estado, ver tu red
          y tu ubicación, con una guía paso a paso. Nada de esto le llega a nadie que no esté
          practicando contigo.
        </Text>

        {sinCupo ? (
          <Card>
            <Text variant="headline" center style={styles.limiteTitulo}>
              Usaste tus {FREE_DRILL_LIMIT} simulacros
            </Text>
            <Text variant="subhead" tone="secondary" center style={styles.limiteTexto}>
              Practicaste las {FREE_DRILL_LIMIT} veces que incluye el plan gratuito. Con Premium
              puedes repetirlo cuando quieras, solo o con tus grupos.
            </Text>
            <PremiumCta />
          </Card>
        ) : (
          <>
            <Card padded={false}>
              <Text variant="footnote" tone="secondary" weight="600" style={styles.sectionHeader}>
                ¿CON QUIÉN?
              </Text>

              <Opcion
                seleccionada={elegido === null}
                onPress={() => setElegido(null)}
                icon="person"
                titulo="Solo yo"
                detalle="Privado. Nadie de tu red se entera ni recibe nada."
                primera
              />

              {misGrupos.map((grupo) => (
                <Opcion
                  key={grupo.id}
                  seleccionada={elegido === grupo.id}
                  onPress={() => setElegido(grupo.id)}
                  icon="groups"
                  titulo={grupo.name}
                  detalle={`Les llega un aviso que dice que es un simulacro, y practican contigo. Son ${grupo.members.length - 1} ${grupo.members.length - 1 === 1 ? 'persona' : 'personas'}.`}
                />
              ))}
            </Card>

            {/* Se dice acá y no después: es lo que evita que alguien crea que
                sus contactos van a recibir el texto de una alerta real. */}
            {elegido !== null ? (
              <Text variant="caption" tone="tertiary" style={styles.nota}>
                Cada uno puede salirse cuando quiera, y tú puedes cerrarlo para todos. Si no lo
                cierra nadie, termina solo en una hora.
              </Text>
            ) : null}

            {misGrupos.length === 0 ? (
              <Text variant="caption" tone="tertiary" style={styles.nota}>
                Para practicar con otras personas necesitas un grupo tuyo. Se arman en Mi red.
              </Text>
            ) : null}

            {error ? (
              <Text variant="footnote" tone="danger" center>
                {error}
              </Text>
            ) : null}

            {restantes !== Infinity ? (
              <Text variant="caption" tone="tertiary" center>
                Vas a usar 1 de tus {FREE_DRILL_LIMIT} simulacros. Te quedan {restantes}.
              </Text>
            ) : null}

            <Button
              title="Empezar simulacro"
              onPress={() => void empezar()}
              loading={busy}
              size="lg"
            />
          </>
        )}

        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          style={({ pressed }) => (pressed ? styles.pressed : null)}>
          <Text variant="footnote" tone="secondary" center>
            {sinCupo ? 'Volver' : 'Ahora no'}
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function Opcion({
  seleccionada,
  onPress,
  icon,
  titulo,
  detalle,
  primera = false,
}: {
  seleccionada: boolean;
  onPress: () => void;
  icon: keyof typeof MaterialIcons.glyphMap;
  titulo: string;
  detalle: string;
  primera?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: seleccionada }}
      accessibilityLabel={titulo}
      style={({ pressed }) => [
        styles.opcion,
        primera
          ? null
          : { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth },
        pressed ? styles.pressed : null,
      ]}>
      <View
        style={[
          styles.opcionIcono,
          { backgroundColor: seleccionada ? colors.accentSoft : colors.surfaceSunken },
        ]}>
        <MaterialIcons
          name={icon}
          size={20}
          color={seleccionada ? colors.accent : colors.textSecondary}
        />
      </View>

      <View style={styles.opcionCopy}>
        <Text variant="callout" weight={seleccionada ? '600' : '400'}>
          {titulo}
        </Text>
        <Text variant="caption" tone="secondary">
          {detalle}
        </Text>
      </View>

      <MaterialIcons
        name={seleccionada ? 'radio-button-checked' : 'radio-button-unchecked'}
        size={22}
        color={seleccionada ? colors.accent : colors.textTertiary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  hero: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    height: 92,
    justifyContent: 'center',
    width: 92,
  },
  sectionHeader: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md },
  opcion: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  opcionIcono: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  opcionCopy: { flex: 1, gap: 2 },
  nota: { paddingHorizontal: Spacing.xs },
  limiteTitulo: { marginBottom: Spacing.xs },
  limiteTexto: { marginBottom: Spacing.lg },
  pressed: { opacity: 0.7 },
});
