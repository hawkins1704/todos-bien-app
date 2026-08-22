import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

type Slide = {
  key: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body: string;
};

/** Spec §10, parte 1: explicación de valor en pantallas cortas. */
const SLIDES: Slide[] = [
  {
    key: 'circle',
    icon: 'diversity-3',
    title: 'Un toque, y tu gente sabe que estás bien',
    body:
      'Después de un sismo, las llamadas se saturan. Acá reportas tu estado una vez y queda ahí para todo tu círculo, sin que nadie tenga que llamar a nadie.',
  },
  {
    key: 'dashboard',
    icon: 'grid-view',
    title: 'Ves a los tuyos de un vistazo',
    body:
      'Cada persona aparece con un color y un ícono según su estado, junto con dónde estaba después del sismo. Sin buscar en cinco chats distintos.',
  },
  {
    key: 'offline',
    icon: 'cloud-off',
    title: 'Funciona aunque la red esté mal',
    body:
      'La información de tu círculo se guarda en tu teléfono. Si te quedas sin señal, sigues viendo la última copia, y lo que reportes se envía solo cuando vuelva la conexión.',
  },
];

export default function WelcomeScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const isLast = index === SLIDES.length - 1;

  const goNext = () => {
    if (isLast) {
      router.push('/sign-up');
      return;
    }
    listRef.current?.scrollToIndex({ index: index + 1, animated: true });
  };

  return (
    <Screen tone="plain" style={{ paddingTop: insets.top }}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) => {
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <View style={[styles.iconWell, { backgroundColor: colors.accentSoft }]}>
              <MaterialIcons name={item.icon} size={56} color={colors.accent} />
            </View>
            <Text variant="title" center>
              {item.title}
            </Text>
            <Text variant="body" tone="secondary" center>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.dots}>
          {SLIDES.map((slide, i) => (
            <View
              key={slide.key}
              style={[
                styles.dot,
                {
                  backgroundColor: i === index ? colors.accent : colors.border,
                  width: i === index ? 20 : 7,
                },
              ]}
            />
          ))}
        </View>

        <Button title={isLast ? 'Crear mi cuenta' : 'Siguiente'} onPress={goNext} size="lg" />

        {/* Quien reinstala la app o cambia de teléfono no viene a registrarse:
            viene a volver a entrar, y hasta ahora el único camino era pasar por
            las tres slides y llegar al formulario de registro. */}
        <Pressable
          onPress={() => router.push('/sign-in')}
          accessibilityRole="button"
          style={({ pressed }) => (pressed ? styles.pressed : null)}>
          <Text variant="footnote" tone="secondary" center>
            ¿Ya tienes cuenta?{' '}
            <Text variant="footnote" tone="accent" weight="600">
              Entrar
            </Text>
          </Text>
        </Pressable>

        <Text variant="caption" tone="tertiary" center>
          Todos Bien no reemplaza a los canales oficiales de emergencia: bomberos, PNP e
          INDECI.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  slide: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.lg,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  iconWell: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 132,
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    width: 132,
  },
  footer: { gap: Spacing.lg, paddingHorizontal: Spacing.xl },
  dots: { flexDirection: 'row', gap: Spacing.xs, justifyContent: 'center' },
  dot: { borderRadius: Radius.pill, height: 7 },
  pressed: { opacity: 0.6 },
});
