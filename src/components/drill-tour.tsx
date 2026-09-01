import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter, useSegments } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
  type View as RNView,
} from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { useDrill } from '@/context/drill';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * La guía del simulacro (migración 0035).
 *
 * Oscurece la pantalla y deja **el elemento de verdad** iluminado, con un paso
 * a la vez. La diferencia con un tutorial de pantallas propias es la que
 * justifica todo el trabajo: acá se practica sobre los controles reales, así
 * que lo que se aprende sirve el día del sismo.
 *
 * ## Por qué vive en el layout raíz y no en la Home
 *
 * Porque el último paso apunta a la **barra de pestañas**, que la Home no
 * contiene. Y porque así el foco no se corta con los bordes de una pantalla.
 *
 * ## Cómo encuentra los elementos
 *
 * Cada pantalla marca sus objetivos con `useTourTarget('estado')`, que devuelve
 * un `ref`. Al cambiar de paso, la guía mide ese nodo con `measureInWindow` y
 * mueve el agujero. Tres detalles que no son opcionales:
 *
 * - **`collapsable={false}`** en el `View` marcado, o Android lo funde con su
 *   padre en el árbol nativo y `measureInWindow` no devuelve nada.
 * - **Si el objetivo todavía no está montado, se reintenta.** Cuando el
 *   simulacro lo convoca otra persona, la guía arranca mientras la navegación
 *   hacia la Home está en curso: medir una sola vez devolvía nada y dejaba la
 *   pantalla oscura sin nada iluminado.
 * - **Si el objetivo está fuera del viewport, la guía desplaza la pantalla**
 *   antes de iluminarlo (`useTourScrollView`). Sin esto el foco del paso de la
 *   ubicación caía sobre la barra de pestañas, que es lo que tapaba al mapa.
 *
 * ## Solo se ve en la Home
 *
 * Los objetivos viven en la Home, así que en cualquier otra pantalla la guía se
 * esconde en vez de iluminar coordenadas que ya no significan nada. Y cuando
 * empieza un simulacro, el provider **lleva** a la Home — el teléfono al que le
 * llega un simulacro ajeno no tiene por qué estar ahí.
 *
 * ## El agujero son cuatro rectángulos, no una máscara
 *
 * Cuatro `View` oscuros alrededor del hueco. Una máscara SVG sería más elegante
 * y traería una dependencia y un modo de fallar más; con cuatro rectángulos, el
 * hueco **deja pasar el toque solo**, que es lo que hace que el paso 1 se
 * complete tocando el estado de verdad.
 */

export type TourTargetKey = 'estado' | 'red' | 'ubicacion';

type Rect = { x: number; y: number; width: number; height: number };

type Paso = {
  /** `null` = sin foco: el paso habla de algo que no es un elemento medible. */
  objetivo: TourTargetKey | 'pestanas' | null;
  numero: number;
  titulo: string;
  cuerpo: string;
  /** Si es `true`, el paso avanza solo cuando la persona HACE la acción. */
  esperaAccion?: boolean;
};

const PASOS: Paso[] = [
  {
    objetivo: 'estado',
    numero: 1,
    titulo: 'Di cómo estás',
    cuerpo:
      'Toca uno. En un sismo real este es el único paso que importa: tu gente lo ve enseguida.',
    esperaAccion: true,
  },
  {
    objetivo: 'red',
    numero: 2,
    titulo: 'Mira a los tuyos',
    cuerpo: 'Acá aparece quién ya reportó y quién falta. El color es el estado de cada uno.',
  },
  {
    objetivo: 'red',
    numero: 3,
    titulo: 'Toca a cualquiera',
    cuerpo:
      'Se abre su ficha: dónde está, qué plan de acción escribió y cuándo reportó. Es lo que vas a querer ver primero.',
  },
  {
    objetivo: 'ubicacion',
    numero: 4,
    titulo: 'Tu ubicación',
    cuerpo:
      'Esto es lo que ve tu red. Se guarda sola al llegar la alerta, y acá puedes actualizarla a mano.',
  },
  {
    objetivo: 'pestanas',
    numero: 5,
    titulo: 'Y así se sale',
    cuerpo:
      'El simulacro sigue encendido hasta que lo cierres. Se sale desde Ajustes, en la sección Simulacro.',
  },
];

type TourState = {
  activo: boolean;
  paso: Paso | null;
  registrar: (key: TourTargetKey, node: RNView | null) => void;
  /** La pantalla avisa que la persona hizo la acción del paso que la esperaba. */
  completar: (key: TourTargetKey) => void;
  siguiente: () => void;
  saltar: () => void;
};

const TourContext = createContext<TourState | null>(null);

/**
 * Lo que la guía necesita tocar de las pantallas y no es parte de su API:
 * los nodos a iluminar y el scroll donde viven, para poder acercarlos.
 */
type Interno = {
  nodos: React.RefObject<Map<TourTargetKey, RNView | null>>;
  scroll: React.RefObject<ScrollView | null>;
  /**
   * El desplazamiento actual, como par de funciones y no como `ref` expuesta:
   * escribirle `.current` a algo que salió de un `useContext` está prohibido
   * —con razón, porque no se distingue de mutar estado compartido—, así que la
   * escritura se queda del lado del provider, que es su dueño.
   */
  anotarDesplazamiento: (y: number) => void;
  leerDesplazamiento: () => number;
};

const InternoContext = createContext<Interno | null>(null);

export function DrillTourProvider({ children }: { children: React.ReactNode }) {
  const { isDrilling, activeDrill } = useDrill();
  const router = useRouter();
  const segments = useSegments();
  const nodos = useRef(new Map<TourTargetKey, RNView | null>());
  const scroll = useRef<ScrollView | null>(null);
  const desplazamiento = useRef(0);

  /**
   * El avance, atado al simulacro que lo produjo.
   *
   * Va **derivado** y no en un efecto: un simulacro cuyo id no coincide con el
   * guardado arranca en el paso 0 por definición, sin un `setState` que
   * provoque un render en cascada. Y como el progreso lleva el `drillId`
   * adentro, volver a la Home a mitad de la guía no la reinicia — que es el bug
   * que un `useRef` de «ya lo guié» tapaba en vez de resolver.
   */
  const [progreso, setProgreso] = useState<{ drillId: string; indice: number | null } | null>(null);

  const drillId = activeDrill?.id ?? null;
  const indice =
    !isDrilling || !drillId ? null : progreso?.drillId === drillId ? progreso.indice : 0;

  const registrar = useCallback((key: TourTargetKey, node: RNView | null) => {
    nodos.current.set(key, node);
  }, []);

  const avanzar = useCallback(
    (desde: number | null) => {
      if (!drillId || desde === null) return;
      setProgreso({
        drillId,
        indice: desde + 1 >= PASOS.length ? null : desde + 1,
      });
    },
    [drillId],
  );

  const siguiente = useCallback(() => avanzar(indice), [avanzar, indice]);

  const completar = useCallback(
    (key: TourTargetKey) => {
      if (indice === null) return;
      const paso = PASOS[indice];
      // Solo avanza si la acción es la que ESTE paso estaba esperando. Reportar
      // el estado en el paso 4 no tiene por qué saltear nada.
      if (!paso?.esperaAccion || paso.objetivo !== key) return;
      avanzar(indice);
    },
    [avanzar, indice],
  );

  const saltar = useCallback(() => {
    if (drillId) setProgreso({ drillId, indice: null });
  }, [drillId]);

  /**
   * El simulacro ocurre en la Home, así que la guía empieza llevando ahí.
   *
   * Sin esto, a quien le convocan un simulacro mientras lee un chat le
   * aparecían recuadros iluminando pedazos de una pantalla que no tiene nada
   * que ver: la guía apunta a la Home aunque la Home no esté delante.
   *
   * Una sola vez por simulacro (`yaLlevado`) y solo mientras la guía sigue en
   * pie: quien ya la saltó puede irse a donde quiera sin que la app lo devuelva.
   */
  const yaLlevado = useRef<string | null>(null);
  const grupoDeRuta = segments[0];
  const yaEnHome = grupoDeRuta === '(tabs)' && segments.length === 1;

  useEffect(() => {
    if (!isDrilling || !drillId || indice === null) return;
    if (yaLlevado.current === drillId) return;
    // Sin ruta todavía no hay router listo; y en login/onboarding manda el
    // guardia de `RootNavigator`, que no tiene sentido contradecir.
    if (!grupoDeRuta || grupoDeRuta === '(auth)' || grupoDeRuta === '(onboarding)') return;
    // El modal de `/drill` se cierra solo al convocar: es asunto suyo, y meter
    // una segunda navegación en el mismo instante solo agrega una carrera.
    if (grupoDeRuta === 'drill') return;

    yaLlevado.current = drillId;
    if (yaEnHome) return;

    // `dismissTo` y no `push`: si hay pantallas encima —un chat, una ficha— hay
    // que sacarlas, no apilar otra Home debajo del banner.
    router.dismissTo('/');
  }, [isDrilling, drillId, indice, grupoDeRuta, yaEnHome, router]);

  const anotarDesplazamiento = useCallback((y: number) => {
    desplazamiento.current = y;
  }, []);
  const leerDesplazamiento = useCallback(() => desplazamiento.current, []);

  const interno = useMemo<Interno>(
    () => ({ nodos, scroll, anotarDesplazamiento, leerDesplazamiento }),
    [anotarDesplazamiento, leerDesplazamiento],
  );

  const value = useMemo<TourState>(
    () => ({
      activo: indice !== null,
      paso: indice === null ? null : (PASOS[indice] ?? null),
      registrar,
      completar,
      siguiente,
      saltar,
    }),
    [indice, registrar, completar, siguiente, saltar],
  );

  return (
    <TourContext.Provider value={value}>
      <InternoContext.Provider value={interno}>{children}</InternoContext.Provider>
    </TourContext.Provider>
  );
}

export function useDrillTour(): TourState {
  const context = useContext(TourContext);
  if (!context) throw new Error('useDrillTour debe usarse dentro de <DrillTourProvider>');
  return context;
}

/**
 * Le presta a la guía el scroll de la pantalla, para que pueda acercar un
 * objetivo que quedó fuera de la vista.
 *
 * ```tsx
 * <ScrollView {...useTourScrollView()} …>
 * ```
 *
 * Sin esto la guía mide igual, pero la posición que obtiene puede estar debajo
 * del viewport: el foco se dibuja fuera de la pantalla y lo único que se ve
 * iluminado es el borde de la barra de pestañas.
 */
export function useTourScrollView() {
  const interno = useContext(InternoContext);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      interno?.anotarDesplazamiento(event.nativeEvent.contentOffset.y);
    },
    [interno],
  );

  return useMemo(
    () => ({ ref: interno?.scroll, onScroll, scrollEventThrottle: 16 }),
    [interno, onScroll],
  );
}

/**
 * Marca un elemento como objetivo de la guía.
 *
 * ```tsx
 * <View ref={useTourTarget('estado')} collapsable={false}>
 * ```
 *
 * El `collapsable={false}` no es opcional en Android: sin él, la vista se funde
 * con su padre en el árbol nativo y no hay nada que medir.
 */
export function useTourTarget(key: TourTargetKey) {
  const { registrar } = useDrillTour();
  return useCallback((node: RNView | null) => registrar(key, node), [key, registrar]);
}

const DURACION = 320;
const RESPIRO = 10;
/** Alto estándar de la barra de pestañas de iOS, sin el safe area de abajo. */
const PESTANAS = 49;
/** Lo que hay que dejar libre para la tarjeta del paso. */
const ALTO_TARJETA = 210;
/** Lo que tarda un `scrollTo` animado en llegar, más margen. */
const ESPERA_SCROLL = 420;
const REINTENTOS = 12;
const ESPERA_REINTENTO = 200;

export function DrillTour() {
  const { activo, paso, siguiente, saltar } = useDrillTour();
  const interno = useContext(InternoContext);
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const { colors } = useTheme();

  const [rectMedido, setRectMedido] = useState<Rect | null>(null);
  const { height: altoPantalla, width: anchoPantalla } = useWindowDimensions();

  // Los objetivos viven en la Home. En cualquier otra pantalla la guía se
  // esconde: iluminar coordenadas medidas en otra vista es peor que no
  // iluminar nada. La ruta índice no deja segmento propio —las rutas tipadas lo
  // confirman: los hermanos de `(tabs)` son settings, circle, chats y news—, así
  // que estar en la Home es exactamente `['(tabs)']`.
  const enHome = segments[0] === '(tabs)' && segments.length === 1;

  // La barra de pestañas no se mide: no la contiene ninguna pantalla y su
  // posición se conoce.
  const rectPestanas: Rect = {
    x: 0,
    y: altoPantalla - (PESTANAS + insets.bottom),
    width: anchoPantalla,
    height: PESTANAS + insets.bottom,
  };

  const rect = paso?.objetivo === 'pestanas' ? rectPestanas : rectMedido;

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const ancho = useSharedValue(0);
  const alto = useSharedValue(0);

  // Medir al entrar en el paso. El `requestAnimationFrame` deja que la pantalla
  // termine de acomodarse: medir en el mismo tick devuelve la posición anterior
  // cuando el paso viene de una navegación o de un cambio de altura.
  const objetivo = activo && enHome ? (paso?.objetivo ?? null) : null;

  /**
   * Cuánto hay que desplazar para que el objetivo entre en la parte útil de la
   * pantalla — entre el safe area de arriba y la barra de pestañas.
   *
   * Si ya entra, cero: nadie quiere que la pantalla se mueva sola sin motivo.
   *
   * Si no entra, se lo lleva **arriba del todo** y no al centro. Centrarlo deja
   * el objetivo con la mitad del sobrante de cada lado, y con un objetivo alto
   * —el mapa mide unos 326 pt— eso no alcanza para la tarjeta del paso ni
   * arriba ni abajo, así que la tarjeta termina anclada al pie tapándole el
   * borde. Pegado arriba, todo lo que sobra queda junto y debajo.
   *
   * Pasarse no es un riesgo: el scroll se detiene solo al llegar al final del
   * contenido y después de desplazar se vuelve a medir, así que lo que se
   * ilumina siempre es la posición real y no la que se pidió.
   */
  const desviacion = useCallback(
    (r: Rect) => {
      const arriba = insets.top + Spacing.lg;
      const abajo = altoPantalla - (PESTANAS + insets.bottom) - Spacing.lg;
      if (r.y >= arriba && r.y + r.height <= abajo) return 0;

      const delta = r.y - arriba;
      // Un par de píxeles no justifican una animación de scroll.
      return Math.abs(delta) < 4 ? 0 : delta;
    },
    [insets.top, insets.bottom, altoPantalla],
  );

  useEffect(() => {
    if (objetivo === null || objetivo === 'pestanas') return;

    let cancelado = false;
    let frame = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let intentos = 0;

    // Todo lo que escribe estado ocurre DENTRO de un callback, nunca en el
    // cuerpo del efecto: un `setState` síncrono acá dispara renders en cascada.
    // Y de paso el retraso es el que hace falta — medir en el mismo tick
    // devuelve la posición anterior cuando el paso viene de un cambio de altura.
    const medir = (puedeDesplazar: boolean) => {
      frame = requestAnimationFrame(() => {
        if (cancelado) return;

        // Reintentar y no rendirse: cuando el simulacro lo convocó otra
        // persona, esto corre mientras la navegación a la Home está en curso y
        // el objetivo todavía no existe. Rendirse dejaba la pantalla oscura sin
        // nada iluminado, que era exactamente el síntoma.
        const otraVez = () => {
          if (intentos++ >= REINTENTOS) {
            setRectMedido(null);
            return;
          }
          temporizador = setTimeout(() => medir(puedeDesplazar), ESPERA_REINTENTO);
        };

        const nodo = interno?.nodos.current.get(objetivo) ?? null;
        if (!nodo) {
          otraVez();
          return;
        }

        nodo.measureInWindow((mx, my, mw, mh) => {
          if (cancelado) return;
          if (mw === 0 && mh === 0) {
            otraVez();
            return;
          }

          const medido: Rect = { x: mx, y: my, width: mw, height: mh };
          const scroll = interno?.scroll.current;
          const delta = puedeDesplazar && scroll ? desviacion(medido) : 0;

          if (delta !== 0 && scroll) {
            // Acercarlo primero y medir después: la posición de ahora es la de
            // antes del desplazamiento, y dibujar el foco ahí lo pondría fuera
            // de la pantalla.
            scroll.scrollTo({
              y: Math.max(0, (interno?.leerDesplazamiento() ?? 0) + delta),
              animated: true,
            });
            temporizador = setTimeout(() => medir(false), ESPERA_SCROLL);
            return;
          }

          setRectMedido(medido);
        });
      });
    };

    medir(true);

    return () => {
      cancelado = true;
      cancelAnimationFrame(frame);
      if (temporizador) clearTimeout(temporizador);
    };
  }, [objetivo, interno, desviacion]);

  // El foco se desliza de un objetivo al otro. `inOut(ease)` y no un salto: el
  // movimiento es lo que explica que el paso 3 habla del mismo bloque que el 2.
  useEffect(() => {
    if (!rect) return;
    const config = { duration: DURACION, easing: Easing.inOut(Easing.ease) };
    // La primera vez no hay de dónde salir: se coloca sin animar para no ver el
    // foco viajando desde la esquina superior izquierda.
    const primera = ancho.value === 0 && alto.value === 0;

    if (primera) {
      x.value = rect.x - RESPIRO;
      y.value = rect.y - RESPIRO;
      ancho.value = rect.width + RESPIRO * 2;
      alto.value = rect.height + RESPIRO * 2;
      return;
    }

    x.value = withTiming(rect.x - RESPIRO, config);
    y.value = withTiming(rect.y - RESPIRO, config);
    ancho.value = withTiming(rect.width + RESPIRO * 2, config);
    alto.value = withTiming(rect.height + RESPIRO * 2, config);
  }, [rect, x, y, ancho, alto]);

  // Los cuatro paños oscuros. El hueco que dejan en el medio no tiene nada
  // encima, así que el toque llega al control de verdad.
  const arriba = useAnimatedStyle(() => ({ height: Math.max(y.value, 0) }));
  const abajo = useAnimatedStyle(() => ({ top: y.value + alto.value }));
  const izquierda = useAnimatedStyle(() => ({
    top: y.value,
    height: alto.value,
    width: Math.max(x.value, 0),
  }));
  const derecha = useAnimatedStyle(() => ({
    top: y.value,
    height: alto.value,
    left: x.value + ancho.value,
  }));
  const marco = useAnimatedStyle(() => ({
    top: y.value,
    left: x.value,
    width: ancho.value,
    height: alto.value,
  }));

  if (!activo || !paso || !enHome) return null;

  // La tarjeta va debajo del foco si entra, arriba si entra ahí, y si no cabe
  // en ninguno de los dos lados se ancla al pie. Ese tercer caso es real: el
  // mapa es más alto que el hueco que deja la tarjeta, y sin el ancla la
  // variante «arriba» la empujaba fuera de la pantalla.
  const espacioAbajo = rect ? altoPantalla - (rect.y + rect.height) - (PESTANAS + insets.bottom) : 0;
  const espacioArriba = rect ? rect.y - insets.top : 0;

  const posicionTarjeta = !rect
    ? { top: altoPantalla / 2 - 100 }
    : espacioAbajo >= ALTO_TARJETA
      ? { top: rect.y + rect.height + RESPIRO + Spacing.lg }
      : espacioArriba >= ALTO_TARJETA
        ? { bottom: altoPantalla - rect.y + RESPIRO + Spacing.lg }
        : { bottom: PESTANAS + insets.bottom + Spacing.lg };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {rect ? (
        <>
          <Animated.View style={[styles.pano, styles.panoArriba, arriba]} />
          <Animated.View style={[styles.pano, styles.panoAbajo, abajo]} />
          <Animated.View style={[styles.pano, styles.panoIzquierda, izquierda]} />
          <Animated.View style={[styles.pano, styles.panoDerecha, derecha]} />
          <Animated.View
            pointerEvents="none"
            style={[styles.marco, { borderColor: '#FFD60A' }, marco]}
          />
        </>
      ) : (
        // Sin objetivo medible se oscurece todo: es mejor que un paso flotando
        // sobre una pantalla que no es la suya.
        <View style={[StyleSheet.absoluteFill, styles.pano]} />
      )}

      <Animated.View
        entering={FadeIn.duration(DURACION)}
        style={[styles.tarjeta, { backgroundColor: colors.surface }, posicionTarjeta]}>
        <View style={styles.encabezado}>
          <View style={styles.paso}>
            <Text variant="caption" weight="700" style={styles.pasoTexto}>
              PASO {paso.numero} DE {PASOS.length}
            </Text>
          </View>
          <Pressable
            onPress={saltar}
            accessibilityRole="button"
            accessibilityLabel="Saltar la guía"
            hitSlop={10}>
            <Text variant="caption" tone="tertiary">
              Saltar
            </Text>
          </Pressable>
        </View>

        <Text variant="headline">{paso.titulo}</Text>
        <Text variant="subhead" tone="secondary" style={styles.cuerpo}>
          {paso.cuerpo}
        </Text>

        {paso.esperaAccion ? (
          <View style={styles.esperando}>
            <MaterialIcons name="touch-app" size={16} color={colors.accent} />
            <Text variant="caption" tone="accent" weight="600">
              Tócalo para seguir
            </Text>
          </View>
        ) : (
          <Pressable
            onPress={siguiente}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.boton,
              { backgroundColor: colors.accent },
              pressed ? styles.pressed : null,
            ]}>
            <Text variant="callout" weight="600" style={{ color: colors.accentText }}>
              {paso.numero === PASOS.length ? 'Entendido' : 'Siguiente'}
            </Text>
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  pano: { backgroundColor: 'rgba(0,0,0,0.72)', position: 'absolute' },
  panoArriba: { left: 0, right: 0, top: 0 },
  panoAbajo: { bottom: 0, left: 0, right: 0 },
  panoIzquierda: { left: 0 },
  panoDerecha: { right: 0 },
  marco: {
    borderRadius: Radius.lg,
    borderWidth: 2,
    position: 'absolute',
  },
  tarjeta: {
    borderRadius: Radius.xl,
    gap: Spacing.xs,
    left: Spacing.lg,
    padding: Spacing.lg,
    position: 'absolute',
    right: Spacing.lg,
  },
  encabezado: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  paso: {
    backgroundColor: '#FFD60A',
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  pasoTexto: { color: '#3A2A00', letterSpacing: 0.6 },
  cuerpo: { marginTop: 2 },
  esperando: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
    marginTop: Spacing.md,
  },
  boton: {
    alignItems: 'center',
    borderRadius: Radius.lg,
    marginTop: Spacing.md,
    paddingVertical: Spacing.md,
  },
  pressed: { opacity: 0.8 },
});
