import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { ModuleColors, Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { Tip } from '@/types/domain';

/**
 * Cada fase con su color y su ícono.
 *
 * Se toma **siempre la paleta clara**, también en modo oscuro: es una lámina de
 * color, no una superficie de la app, y una lámina verde profunda sobre fondo
 * negro se ve igual de bien que sobre blanco. El par `ink` como fondo y `bg`
 * como texto es el mismo que ya está medido en `ModuleColors` — 4,90:1 el más
 * justo de los tres.
 */
const FASES: Record<Tip['phase'], { fondo: string; texto: string; icono: keyof typeof MaterialIcons.glyphMap; rotulo: string }> = {
  antes: {
    fondo: ModuleColors.light.plan.ink,
    texto: ModuleColors.light.plan.bg,
    icono: 'event-available',
    rotulo: 'ANTES DEL SISMO',
  },
  durante: {
    fondo: ModuleColors.light.simulacro.ink,
    texto: ModuleColors.light.simulacro.bg,
    icono: 'vibration',
    rotulo: 'DURANTE EL SISMO',
  },
  despues: {
    fondo: ModuleColors.light.hogar.ink,
    texto: ModuleColors.light.hogar.bg,
    icono: 'health-and-safety',
    rotulo: 'DESPUÉS DEL SISMO',
  },
};

/**
 * Fotos de fondo, una por fase. **Vacío a propósito.**
 *
 * Mientras no haya archivos, el banner se pinta con el color de la fase y su
 * ícono de marca de agua, que se sostiene solo. Cuando existan, esto es lo único
 * que hay que tocar:
 *
 * ```ts
 * antes: require('../../assets/images/tips/antes.jpg'),
 * ```
 *
 * `require` de una ruta que no existe **rompe el bundle de Metro**, no se cae en
 * tiempo de ejecución: por eso no hay tres líneas comentadas esperando.
 */
const IMAGENES: Partial<Record<Tip['phase'], ImageSourcePropType>> = {};

/**
 * El consejo del día en la Home.
 *
 * ## Por qué solo el título
 *
 * La tarjeta anterior mostraba el consejo entero —título, cuerpo largo y la
 * fuente— y medía media pantalla en una Home que ya tiene el banner de calma, la
 * red, el estado de preparación y el recordatorio. Un mini artículo al fondo de
 * esa pila no lo lee nadie: se scrollea por encima.
 *
 * Acá el banner promete una sola cosa y cabe en un vistazo. El detalle vive
 * detrás de un toque, que es donde tiene sentido leerlo — quien lo abre, lo
 * abrió porque quiso.
 *
 * ## La animación
 *
 * El `Modal` se encarga del desvanecido de entrada y de **salida**; la hoja sube
 * con `FadeInDown` de Reanimated. Están repartidos así porque un `Modal` de
 * React Native desmonta a sus hijos de golpe al cerrarse, así que una animación
 * de salida de Reanimated adentro no llegaría a verse nunca.
 */
export function DailyTipCard({ tip }: { tip: Tip }) {
  const [abierto, setAbierto] = useState(false);
  const fase = FASES[tip.phase];
  const imagen = IMAGENES[tip.phase];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Consejo de hoy: ${tip.title}. Toca para ver el detalle.`}
        onPress={() => setAbierto(true)}
        style={({ pressed }) => [
          styles.banner,
          { backgroundColor: fase.fondo },
          pressed ? styles.presionado : null,
        ]}>
        {imagen ? (
          <>
            <Image source={imagen} resizeMode="cover" style={styles.foto} />
            {/* Un velo del color de la fase: sin él, el texto claro depende de
                cómo salga la foto y basta una zona clara para volverlo ilegible. */}
            <View style={[styles.velo, { backgroundColor: `${fase.fondo}B8` }]} />
          </>
        ) : (
          <MaterialIcons
            name={fase.icono}
            size={150}
            color={`${fase.texto}1F`}
            style={styles.marca}
          />
        )}

        <View style={styles.bannerTexto}>
          <View style={[styles.rotulo, { backgroundColor: `${fase.texto}26` }]}>
            <MaterialIcons name="lightbulb" size={12} color={fase.texto} />
            <Text variant="caption" weight="700" style={{ color: fase.texto }}>
              CONSEJO DE HOY
            </Text>
          </View>

          <Text variant="title3" numberOfLines={2} style={{ color: fase.texto }}>
            {tip.title}
          </Text>
        </View>

        <View style={[styles.abrir, { backgroundColor: `${fase.texto}26` }]}>
          <Text variant="footnote" weight="600" style={{ color: fase.texto }}>
            Ver detalle
          </Text>
          <MaterialIcons name="arrow-forward" size={15} color={fase.texto} />
        </View>
      </Pressable>

      <Modal
        visible={abierto}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setAbierto(false)}>
        <Detalle tip={tip} onCerrar={() => setAbierto(false)} />
      </Modal>
    </>
  );
}

/** El popup. Vive aparte para que sus hooks no corran mientras está cerrado. */
function Detalle({ tip, onCerrar }: { tip: Tip; onCerrar: () => void }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const fase = FASES[tip.phase];

  return (
    <View style={styles.escena}>
      {/* El fondo también es el botón de cerrar: es lo que la gente intenta
          primero, antes de buscar una equis. */}
      <Animated.View entering={FadeIn.duration(180)} style={styles.telon}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={onCerrar}
          style={[styles.telonFondo, { backgroundColor: colors.scrim }]}
        />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(280).easing(Easing.out(Easing.cubic))}
        style={[
          styles.hoja,
          {
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + Spacing.xl,
          },
        ]}>
        <View style={[styles.asa, { backgroundColor: colors.borderStrong }]} />

        <View style={[styles.cinta, { backgroundColor: fase.fondo }]}>
          <MaterialIcons name={fase.icono} size={18} color={fase.texto} />
          <Text variant="caption" weight="700" style={{ color: fase.texto }}>
            {fase.rotulo}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.cuerpo}
          showsVerticalScrollIndicator={false}
          bounces={false}>
          <Text variant="title2">{tip.title}</Text>
          <Text variant="callout" tone="secondary" style={styles.parrafo}>
            {tip.longBody ?? tip.body}
          </Text>

          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Abrir la fuente: ${tip.sourceName}`}
            onPress={() => void WebBrowser.openBrowserAsync(tip.sourceUrl)}
            style={({ pressed }) => [styles.fuente, pressed ? styles.presionado : null]}>
            <Text variant="footnote" tone="accent" weight="600">
              Fuente: {tip.sourceName}
            </Text>
            <MaterialIcons name="open-in-new" size={13} color={colors.accent} />
          </Pressable>
        </ScrollView>

        <Pressable
          accessibilityRole="button"
          onPress={onCerrar}
          style={({ pressed }) => [
            styles.cerrar,
            { backgroundColor: colors.surfaceSunken },
            pressed ? styles.presionado : null,
          ]}>
          <Text variant="callout" weight="600" center>
            Cerrar
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  abrir: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  asa: {
    alignSelf: 'center',
    borderRadius: Radius.pill,
    height: 4,
    marginBottom: Spacing.lg,
    marginTop: Spacing.md,
    width: 40,
  },
  banner: {
    borderRadius: Radius.xl,
    gap: Spacing.lg,
    justifyContent: 'space-between',
    minHeight: 150,
    overflow: 'hidden',
    padding: Spacing.lg,
  },
  bannerTexto: { gap: Spacing.sm },
  cerrar: {
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
  },
  cinta: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    marginHorizontal: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 5,
  },
  cuerpo: { padding: Spacing.lg },
  escena: { flex: 1, justifyContent: 'flex-end' },
  foto: { ...StyleSheet.absoluteFill },
  fuente: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.xs,
    marginTop: Spacing.lg,
  },
  hoja: {
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    maxHeight: '85%',
  },
  marca: { bottom: -30, position: 'absolute', right: -24 },
  parrafo: { marginTop: Spacing.md },
  presionado: { opacity: 0.7 },
  rotulo: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    flexDirection: 'row',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  telon: { ...StyleSheet.absoluteFill },
  telonFondo: { flex: 1 },
  velo: { ...StyleSheet.absoluteFill },
});
