import { useEffect } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

// Relativo y no `@/assets`: el alias existe en `tsconfig.json` pero ningún
// archivo de `src/` lo usa todavía, y la resolución de Metro para rutas de
// tsconfig no está verificada en este proyecto. Un `require` relativo funciona
// siempre.
const MOCHILA = require('../../assets/images/backpack.png');

/**
 * La proporción se **mide del archivo**, no se escribe a mano.
 *
 * La versión anterior tenía `1374 / 1145` clavado en una constante. Sirve hasta
 * el día en que alguien reemplaza el PNG por otro de distinto tamaño —que es
 * justo lo que va a pasar— y entonces el dibujo sale estirado sin que nadie
 * toque código. `resolveAssetSource` lee las medidas reales del asset empaquetado
 * y es síncrono para un `require` estático.
 */
const MEDIDAS = Image.resolveAssetSource(MOCHILA);
const RELACION = MEDIDAS?.width && MEDIDAS?.height ? MEDIDAS.width / MEDIDAS.height : 1.2;

/** Cuánto se ve el dibujo donde todavía no llegó el agua. */
const APAGADA = 0.24;

/**
 * La onda.
 *
 * 🔴 **`radio` enorme frente a `paso`, y ahí está todo.** Dos círculos que se
 * cruzan forman un pico, y lo pronunciado del pico sale de `paso / (2·radio)`:
 *
 * | radio | paso | amplitud | cruce | crestas en 280 pt |
 * |---|---|---|---|---|
 * | 44 | 60 | 5,9 | **43°** | 4,7 |
 * | 100 | 90 | 5,3 | 26,7° | 3,1 |
 * | **156** | **110** | **5,0** | **20,6°** | **2,5** |
 *
 * El primer intento usaba 44/60: picos de 43° y casi cinco crestas apretadas, o
 * sea una fila de nubes. Con arcos largos el cruce baja a 20°, quedan dos
 * crestas y media a lo ancho, y la curva se parece a una senoidal.
 *
 * ⚠️ Amplitud y período **no son independientes**: `(radio − hondo) / 2` los ata.
 * Para más amplitud sin volver a las nubes hay que alargar también el período.
 */
const OLA = { radio: 156, paso: 110, duracion: 4200, sentido: -1 as const };

export type KitBackpackProps = {
  /** De 0 a 100. */
  value: number;
  /** Ancho disponible; el alto sale de la relación de la imagen. */
  width: number;
};

/**
 * La mochila que se llena de agua.
 *
 * ## Cómo está armado
 *
 * El dibujo **apagado** de fondo, y encima la MISMA imagen a color completo
 * recortada con la forma del agua. Sube el nivel, sube el color. **Sin fondo de
 * ningún tipo**: lo único que se ve es el dibujo, en dos intensidades.
 *
 * ## Por qué el recorte se hace con círculos y no con SVG
 *
 * Un `<Path>` con una senoidal animada sería lo obvio, pero `react-native-svg`
 * **no está instalado** y es una dependencia nativa: entra con un build nuevo de
 * las dos tiendas, para un adorno.
 *
 * La alternativa cuesta cero. El agua es un rectángulo macizo más una fila de
 * círculos **muy solapados** que le hacen la superficie; cada pieza lleva
 * `overflow: 'hidden'` y adentro una copia de la imagen colocada para que caiga
 * exactamente donde va, así que el conjunto funciona como una máscara de verdad.
 *
 * Las crestas van hacia **arriba**: la forma de una ola y la de una cortina
 * descolgándose son la misma curva, y lo único que las distingue es de qué lado
 * está lo macizo. Lo macizo es el agua.
 *
 * La fila se desplaza con **un solo** `translateX` y cada imagen de adentro lleva
 * el desplazamiento contrario, así que el dibujo se queda quieto y lo único que
 * viaja es el recorte. Como el patrón se repite cada `paso`, al completar un
 * `paso` vuelve a empezar y el ciclo no se ve.
 *
 * ⚠️ Es una animación infinita, así que respeta «reducir movimiento» del
 * sistema: con eso activado la ola se dibuja **quieta**, no desaparece. Quitarla
 * cambiaría dónde se lee el nivel.
 */
export function KitBackpack({ value, width }: KitBackpackProps) {
  const pct = Math.max(0, Math.min(100, value));
  const alto = width / RELACION;

  // Medido desde ARRIBA, que es como se posiciona todo acá adentro.
  const linea = alto * (1 - pct / 100);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Mochila de emergencia, ${Math.round(pct)} por ciento lista`}
      style={[styles.marco, { width, height: alto }]}
    >
      <Image
        source={MOCHILA}
        resizeMode="contain"
        style={[styles.apagada, { width, height: alto }]}
      />

      {pct <= 0 ? null : pct >= 100 ? (
        // Llena: sin onda. Una superficie ondulada con el nivel en el borde de
        // arriba dejaría franjas apagadas en los valles, y al 100% no puede
        // faltar nada.
        <Image
          source={MOCHILA}
          resizeMode="contain"
          style={{ height: alto, position: 'absolute', width }}
        />
      ) : (
        <Agua ancho={width} alto={alto} linea={linea} {...OLA} />
      )}
    </View>
  );
}

/**
 * El agua: la imagen a color, recortada por un rectángulo y una fila de círculos.
 *
 * La fila se centra medio período por debajo de `linea` para que la onda oscile
 * **alrededor** del nivel y no colgando: si no, el agua dibujada no coincidiría
 * con el porcentaje que dice el número de al lado.
 */
function Agua({
  ancho,
  alto,
  linea,
  radio,
  paso,
  duracion,
  sentido,
}: {
  ancho: number;
  alto: number;
  linea: number;
  radio: number;
  paso: number;
  duracion: number;
  sentido: 1 | -1;
}) {
  const corrimiento = useOleaje(paso, duracion, sentido);
  const fila = useAnimatedStyle(() => ({
    transform: [{ translateX: corrimiento.value }],
  }));

  // `hondo` es a qué altura queda el borde del círculo a mitad de camino entre
  // dos centros: el valle de la onda. La diferencia con `radio` es el doble de
  // la amplitud, y poner los centros a `(radio + hondo) / 2` del nivel es lo que
  // deja la onda repartida en partes iguales arriba y abajo de él.
  const hondo = Math.sqrt(Math.max(0, radio * radio - (paso / 2) ** 2));
  const centro = linea + (radio + hondo) / 2;
  const techo = centro - radio;

  // Uno de sobra a cada lado: la fila recorre un `paso` entero y el borde no
  // puede quedarse sin círculo a mitad del camino.
  const cuantos = Math.ceil(ancho / paso) + 3;

  return (
    <>
      {/* Lo macizo, de la superficie para abajo. Con arcos tan largos suele
          quedar fuera del dibujo y los círculos hacen todo el trabajo; está por
          si el nivel es muy alto. */}
      <View style={[styles.macizo, { top: centro }]}>
        <Image
          source={MOCHILA}
          resizeMode="contain"
          style={{ height: alto, position: 'absolute', top: -centro, width: ancho }}
        />
      </View>

      {/* La superficie. */}
      <Animated.View style={[styles.fila, { left: -paso * 1.5, top: techo }, fila]}>
        {Array.from({ length: cuantos }, (_, i) => (
          <Cresta
            key={i}
            indice={i}
            ancho={ancho}
            alto={alto}
            radio={radio}
            paso={paso}
            techo={techo}
            corrimiento={corrimiento}
          />
        ))}
      </Animated.View>
    </>
  );
}

/**
 * Una cresta: un círculo que recorta la imagen.
 *
 * La imagen de adentro lleva `translateX` contrario al de la fila, así que
 * mientras el círculo viaja el dibujo se queda donde estaba. Cada cresta arma su
 * propio estilo animado en vez de compartir uno: Reanimated pide no reusar el
 * resultado de `useAnimatedStyle` entre componentes, y seis worklets de una línea
 * no le pesan a nadie.
 */
function Cresta({
  indice,
  ancho,
  alto,
  radio,
  paso,
  techo,
  corrimiento,
}: {
  indice: number;
  ancho: number;
  alto: number;
  radio: number;
  paso: number;
  techo: number;
  corrimiento: SharedValue<number>;
}) {
  const contra = useAnimatedStyle(() => ({
    transform: [{ translateX: -corrimiento.value }],
  }));

  return (
    <View
      style={{
        borderRadius: radio,
        height: radio * 2,
        // Muy negativo: es lo que solapa las crestas y aplana el cruce.
        marginRight: paso - radio * 2,
        overflow: 'hidden',
        width: radio * 2,
      }}>
      <Animated.View style={[styles.contra, contra]}>
        <Image
          source={MOCHILA}
          resizeMode="contain"
          style={{
            height: alto,
            // Deshace el sitio de esta cresta dentro de la fila, para que la
            // imagen caiga en el mismo lugar que la del rectángulo macizo.
            left: paso * 1.5 - indice * paso,
            position: 'absolute',
            top: -techo,
            width: ancho,
          }}
        />
      </Animated.View>
    </View>
  );
}

/** El desplazamiento cíclico de la fila de crestas. */
function useOleaje(paso: number, duracion: number, sentido: 1 | -1): SharedValue<number> {
  const sinMovimiento = useReducedMotion();
  const corrimiento = useSharedValue(0);

  useEffect(() => {
    if (sinMovimiento) return;
    corrimiento.value = withRepeat(
      withTiming(sentido * paso, { duration: duracion, easing: Easing.linear }),
      -1,
      false,
    );
    return () => {
      corrimiento.value = 0;
    };
  }, [corrimiento, duracion, paso, sentido, sinMovimiento]);

  return corrimiento;
}

const styles = StyleSheet.create({
  apagada: { opacity: APAGADA },
  contra: { ...StyleSheet.absoluteFill },
  fila: { flexDirection: 'row', position: 'absolute' },
  macizo: { bottom: 0, left: 0, overflow: 'hidden', position: 'absolute', right: 0 },
  // Sin fondo y sin borde: lo único que se ve es el dibujo, apagado o a color.
  // `overflow` es lo único que hace falta, para que las crestas —que son mucho
  // más grandes que el dibujo— no se desborden sobre el resto de la tarjeta.
  marco: { overflow: 'hidden' },
});
