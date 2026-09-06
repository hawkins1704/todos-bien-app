import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import { androidMapsReady } from '@/components/location-map';
import { magnitudeSeverity } from '@/components/quake-card';
import { Text } from '@/components/ui/text';
import { formatMagnitude } from '@/lib/format';
import { describePlace } from '@/lib/geo';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { QuakeEvent } from '@/types/domain';
import type { QuakeFeedScope } from '@/lib/api';

/**
 * Los mismos sismos de la lista, sobre el mapa.
 *
 * **Qué dice cada círculo.** El tamaño es la magnitud y el color también, con la
 * escala de `magnitudeSeverity()` — la misma de la lista y del detalle, y la que
 * explica la leyenda que está justo encima en la pantalla.
 *
 * Se evaluó colorear por **profundidad**, que es lo que hacen los mapas del IGP
 * y del USGS. Se descartó: en esta pantalla el color ya significa magnitud y hay
 * una leyenda diciéndolo a diez píxeles de distancia. Dos significados para el
 * mismo color en la misma pantalla es peor que no tener el dato — y la
 * profundidad sigue estando, con su número, en el detalle de cada sismo.
 *
 * **Por qué marcadores y no `<Circle>`.** `Circle` se dibuja en metros, así que
 * al acercarse un M6 taparía media pantalla y al alejarse desaparecería. El
 * tamaño acá es una **codificación**, no una distancia: tiene que medir lo mismo
 * en pantalla a cualquier zoom.
 */
export function QuakeMap({
  quakes,
  scope,
  onSelect,
}: {
  quakes: QuakeEvent[];
  scope: QuakeFeedScope;
  onSelect: (quakeId: string) => void;
}) {
  const { colors, status, scheme } = useTheme();

  /**
   * El truco de `tracksViewChanges`, que no es opcional acá.
   *
   * Un marcador con contenido propio se redibuja en cada frame mientras esta
   * prop esté en `true`, y el feed global trae ~144. Dejarla encendida vuelve el
   * mapa inusable en Android.
   *
   * Pero apagarla desde el arranque tiene el problema inverso y conocido: el
   * marcador se fotografía **antes** de que su vista haya terminado de medirse,
   * y queda en blanco para siempre. Por eso arranca encendida y se apaga sola en
   * cuanto la primera pintura terminó.
   */
  const clave = `${scope}:${quakes.length}:${scheme}`;
  const [yaPintado, setYaPintado] = useState<string | null>(null);
  const rastrear = yaPintado !== clave;

  // `rastrear` se **deriva** de comparar la clave, en vez de apagarse y
  // encenderse con dos `setState`. Así, cuando cambian los datos o el tema, la
  // clave deja de coincidir y el rastreo vuelve solo — sin escribir estado
  // durante el efecto, que además es lo que la regla `set-state-in-effect`
  // prohíbe con razón.
  useEffect(() => {
    const t = setTimeout(() => setYaPintado(clave), 800);
    return () => clearTimeout(t);
  }, [clave]);

  const region = useMemo(() => encuadre(quakes, scope), [quakes, scope]);

  /**
   * Un `zIndex` **único** por sismo, del más grande al más chico.
   *
   * 🔴 Esto es el resto del bug del salto. Antes el orden salía de la magnitud
   * (`100 - magnitud * 10`), y con 107 sismos en el feed global hay montones de
   * M4,5 y M4,6: **todos empatados en el mismo valor**. Ante un empate el orden
   * lo resuelve el mapa nativo por su cuenta, y nada garantiza que lo resuelva
   * igual al dibujar que al decidir qué marcador recibió el toque. De ahí el
   * «toco este y se abre el de al lado».
   *
   * Ordenando por magnitud descendente y usando la posición, no hay dos iguales:
   * el apilado queda **total y determinista**. Los chicos siguen quedando
   * delante —que es lo que los hace tocables cuando un M6 los solapa— pero ahora
   * el desempate está decidido acá y no en el motor de mapas.
   */
  const orden = useMemo(() => {
    const porTamano = [...quakes].sort((a, b) => b.magnitude - a.magnitude);
    return new Map(porTamano.map((q, i) => [q.id, i + 1]));
  }, [quakes]);

  /**
   * Cuál tiene el globo abierto.
   *
   * 🔴 **El globo lo dibujamos nosotros, no el mapa.** Se probaron tres
   * variantes con `<Callout>` —la nativa, con `zIndex` al frente, y sin tocar
   * ninguna prop— y las tres seguían saltando: se abría el globo correcto y a
   * los milisegundos el motor de mapas lo cerraba y abría el del círculo
   * vecino. Esa reelección es interna del componente nativo y desde acá no se
   * puede desactivar.
   *
   * Así que se sacó el `<Callout>` de la ecuación. El globo es **otro
   * marcador**, anclado a la misma coordenada y desplazado hacia arriba. El
   * mapa ya no decide qué se muestra: lo decide este estado.
   *
   * Los círculos van memoizados aparte justamente para que cambiar esta
   * selección no los toque. Esa era la otra mitad del problema.
   */
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  const seleccionado = quakes.find((q) => q.id === seleccionadoId) ?? null;

  /** Cuándo se tocó un círculo. Lo usa la guarda del `onPress` del mapa. */
  const tocadoEn = useRef(0);

  /**
   * La aparición del globo, que el `<Callout>` nativo daba gratis.
   *
   * `useNativeDriver: false` **a propósito**, aunque anime opacidad y escala.
   * El contenido de un marcador se dibuja como una foto de la vista de React; el
   * driver nativo anima la capa por fuera de JS y la foto no se vuelve a tomar,
   * así que la animación no se vería. Acá el costo no importa: es un marcador
   * durante 160 ms, no los 107.
   */
  // `useState` con inicializador perezoso, no `useRef`: el valor se lee durante
  // el render para interpolarlo, y un ref leído en render es justo lo que
  // prohíbe la regla `react-hooks/refs`. Un `Animated.Value` es un objeto
  // estable, así que el estado nunca se reescribe — solo se crea una vez.
  const [aparicion] = useState(() => new Animated.Value(0));

  /**
   * Alto medido del globo. Lo necesita `centerOffset`, que es el único camino
   * en iOS.
   *
   * 🔴 **`anchor` NO existe en la implementación de iOS.** Comprobado en el
   * código nativo de react-native-maps 1.27.2: `AIRMapMarkerManager.m` exporta
   * `centerOffset` y `calloutOffset`, y ni una línea de `anchor`. El del lado
   * Android es el espejo: `MapMarkerManager.java` implementa `anchor` y tiene
   * `centerOffset` **comentado**.
   *
   * O sea que cada plataforma ignora en silencio la propiedad de la otra, y se
   * pueden pasar las dos sin que se pisen. Ese silencio fue el bug: el globo
   * pedía anclarse por su base, iOS lo ignoraba, lo centraba en la coordenada y
   * quedaba medio globo por debajo del círculo. Los círculos zafaban de casualidad
   * porque piden centro, que es justo el comportamiento por defecto.
   */
  const [altoGlobo, setAltoGlobo] = useState(0);

  useEffect(() => {
    if (!seleccionadoId) return;
    aparicion.setValue(0);
    Animated.timing(aparicion, {
      toValue: 1,
      duration: 160,
      easing: Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  }, [seleccionadoId, aparicion]);

  /**
   * Cerrar animando, y recién después soltar la selección.
   *
   * El `setState` va en el callback de la animación y no suelto en un efecto:
   * así se ve el globo irse en vez de desaparecer de golpe, y de paso no choca
   * con la regla `set-state-in-effect`.
   */
  const cerrarGlobo = () => {
    Animated.timing(aparicion, {
      toValue: 0,
      duration: 120,
      easing: Easing.in(Easing.quad),
      useNativeDriver: false,
    }).start(() => setSeleccionadoId(null));
  };

  /**
   * Los círculos, congelados.
   *
   * `useMemo` **sin** `seleccionadoId` entre las dependencias: al abrir o cerrar
   * un globo, React recibe exactamente los mismos elementos, no reconcilia nada
   * y los marcadores nativos ni se enteran. Sin esto, cada toque volvía a
   * renderizar los 107 y el mapa los soltaba a todos.
   */
  const circulos = useMemo(
    () =>
      quakes.map((quake) => {
        const paleta = status[magnitudeSeverity(quake.magnitude)];
        const lado = diametro(quake.magnitude);

        return (
          <Marker
            key={quake.id}
            coordinate={{ latitude: quake.latitude, longitude: quake.longitude }}
            tracksViewChanges={rastrear}
            // El ancla al centro: por defecto el marcador cuelga de su punta
            // inferior, y acá el punto del sismo es el CENTRO del círculo.
            anchor={{ x: 0.5, y: 0.5 }}
            // Orden único por sismo (ver `orden`): dos magnitudes iguales
            // empataban y el desempate quedaba en manos del motor nativo, que
            // podía resolverlo distinto al dibujar y al detectar el toque. Los
            // chicos van delante, que es lo que los mantiene tocables cuando un
            // M6 los solapa.
            zIndex={orden.get(quake.id) ?? 1}
            onPress={() => {
              tocadoEn.current = Date.now();
              setSeleccionadoId(quake.id);
            }}>
            <View
              style={[
                styles.punto,
                {
                  backgroundColor: paleta.base,
                  borderColor: colors.surface,
                  borderRadius: lado / 2,
                  height: lado,
                  width: lado,
                },
              ]}
            />
          </Marker>
        );
      }),
    [quakes, rastrear, orden, status, colors.surface],
  );

  if (!androidMapsReady) return null;

  return (
    <View style={styles.contenedor}>
      <MapView
        // Remontar al cambiar de scope o de datos: `initialRegion` se lee una
        // sola vez al montar (ver `location-map.tsx`, mismo motivo y arreglo).
        key={clave}
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle={scheme}
        showsUserLocation={false}
        showsMyLocationButton={false}
        toolbarEnabled={false}
        /**
         * Tocar el mapa cierra el globo. Ahora sí se puede: como los círculos
         * están memoizados, este `setState` no los toca — lo único que cambia
         * es que el marcador del globo deja de renderizarse.
         *
         * La guarda es necesaria igual: en Android, tocar un marcador dispara
         * **también** este evento —la librería lo marca con
         * `action: 'marker-press'`—, y sin filtrarlo el mismo toque abriría el
         * globo y lo cerraría. El `action` no viene en iOS, así que la marca de
         * tiempo cubre el caso sin depender de un campo que una plataforma no
         * manda.
         */
        onPress={(event) => {
          if (event.nativeEvent.action === 'marker-press') return;
          if (Date.now() - tocadoEn.current < 400) return;
          if (seleccionadoId) cerrarGlobo();
        }}
        // Sin Map ID y sin marcadores avanzados, que es lo que mantiene esto en
        // el SKU gratuito de Google. Ver la cabecera de `location-map.tsx`.
        rotateEnabled={false}
        pitchEnabled={false}>
        {circulos}

        {/* El globo, como marcador propio. Va DESPUÉS de los círculos y con el
            `zIndex` más alto para que quede por encima de todos.

            `anchor` en la base y `paddingBottom` del radio del círculo: así el
            pico del globo apoya justo sobre el borde superior del punto, que es
            donde lo pondría el globo nativo. */}
        {seleccionado ? (
          <Marker
            key={`globo:${seleccionado.id}`}
            coordinate={{ latitude: seleccionado.latitude, longitude: seleccionado.longitude }}
            // Android usa `anchor` (base del globo sobre la coordenada); iOS
            // ignora `anchor` y usa `centerOffset`, que sube la vista centrada
            // media altura para dejar su base en el mismo sitio. Cada una
            // descarta la de la otra, así que van juntas sin pisarse.
            anchor={{ x: 0.5, y: 1 }}
            centerOffset={{ x: 0, y: -altoGlobo / 2 }}
            zIndex={99999}
            // `true` a propósito y sin apagarlo: es UN marcador, no 107, y aquí
            // el costo de que se redibuje es nulo frente al riesgo de que salga
            // en blanco por haberlo fotografiado antes de tiempo.
            tracksViewChanges
            onPress={() => onSelect(seleccionado.id)}>
            <Animated.View
              // Se mide en vez de calcularse: el alto depende de cuánto ocupe
              // el nombre del lugar y del tamaño de letra del sistema, así que
              // una constante mentiría en cuanto alguien agrande el texto.
              onLayout={(event) => setAltoGlobo(event.nativeEvent.layout.height)}
              style={[
                styles.globoAncla,
                {
                  // El pico apoya justo sobre el borde superior del círculo, así
                  // que el hueco es su radio más un respiro.
                  paddingBottom: diametro(seleccionado.magnitude) / 2 + 4,
                  opacity: aparicion,
                  // Crece desde abajo —donde está el pico— y no desde el centro,
                  // que es lo que hace que se lea como que sale del círculo.
                  transform: [
                    { translateY: aparicion.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
                    { scale: aparicion.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) },
                  ],
                },
              ]}>
              <View
                style={[
                  styles.globo,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}>
                <Text variant="footnote" weight="700">
                  Magnitud {formatMagnitude(seleccionado.magnitude)}
                </Text>
                <Text variant="caption" tone="secondary" numberOfLines={2}>
                  {describePlace(seleccionado.place, seleccionado.source).spot}
                </Text>
                <Text variant="caption" tone="tertiary">
                  {fechaCorta(seleccionado.occurredAt)}
                </Text>
                <Text variant="caption" tone="accent" weight="600">
                  Ver detalle
                </Text>
              </View>

              {/* El piquito, un cuadrado rotado 45°. Se recorta con el globo de
                  arriba, que lo tapa por la mitad. */}
              <View
                style={[
                  styles.globoPico,
                  { backgroundColor: colors.surface, borderColor: colors.border },
                ]}
              />
            </Animated.View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

/**
 * Diámetro en puntos, no en kilómetros.
 *
 * Crece con la magnitud pero **acotado por los dos lados**: sin el mínimo un M2
 * sería invisible, y sin el máximo un M8 taparía la mitad del país. La escala es
 * lineal a propósito y no logarítmica —aunque la magnitud sí lo sea—: acá el
 * círculo ordena de un vistazo, no mide energía.
 */
function diametro(magnitude: number): number {
  return Math.round(Math.min(42, Math.max(12, 6 + magnitude * 4.5)));
}

/** «12 mar, 14:32» — corto porque vive dentro de un globo de mapa. */
function fechaCorta(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Encuadres de respaldo, para cuando no hay ni un sismo que enmarcar. */
const PERU: Region = {
  latitude: -9.2,
  longitude: -75,
  latitudeDelta: 20,
  longitudeDelta: 18,
};

const MUNDO: Region = {
  latitude: 5,
  longitude: -40,
  latitudeDelta: 120,
  longitudeDelta: 160,
};

/**
 * El encuadre sale de los datos, no de una constante por scope.
 *
 * Así el mapa siempre abre mostrando **todo lo que hay**: si en la semana solo
 * tembló en el sur, se abre en el sur. Los respaldos de arriba son solo para la
 * lista vacía.
 *
 * El margen del 30 % evita que los sismos de los extremos queden pegados al
 * borde, y los mínimos evitan el caso feo: un solo sismo daría un span de cero y
 * el mapa abriría con zoom de calle sobre un punto en el mar.
 *
 * ## 🔴 Los topes no son prolijidad: sin ellos la app se cierra
 *
 * Un `longitudeDelta` mayor que 360 —o un `latitudeDelta` mayor que 180— es una
 * región **imposible**, y el mapa nativo no la rechaza: revienta el proceso.
 *
 * Y no era un caso raro. Medido el 2026-09-06 sobre el feed global real: los
 * sismos iban de -178,1 a 179,8 de longitud, o sea 357,9 grados, que con el
 * margen del 30 % daban **465**. La vista global cerraba la app **siempre**.
 * Nacional nunca lo mostró porque Perú abarca 18 grados y ahí sobra sitio.
 *
 * Los topes son un poco menores que el máximo teórico a propósito: 360 exactos
 * dejan el mapa en el límite y algunas versiones lo tratan igual de mal.
 *
 * *(Lo que estos topes NO resuelven, y no hace falta: dos sismos a los lados del
 * antimeridiano —uno en -179 y otro en 179— son vecinos, pero el rectángulo dice
 * que abarcan el planeta. Para el feed global el resultado es el correcto de
 * todos modos, porque lo que hay que mostrar es el mundo entero.)*
 */
const MAX_LAT_DELTA = 170;
const MAX_LNG_DELTA = 350;

function encuadre(quakes: QuakeEvent[], scope: QuakeFeedScope): Region {
  if (quakes.length === 0) return scope === 'nacional' ? PERU : MUNDO;

  const lats = quakes.map((q) => q.latitude);
  const lngs = quakes.map((q) => q.longitude);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.min(MAX_LAT_DELTA, Math.max(2, (maxLat - minLat) * 1.3)),
    longitudeDelta: Math.min(MAX_LNG_DELTA, Math.max(2, (maxLng - minLng) * 1.3)),
  };
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  punto: {
    // El borde del color de la superficie despega los círculos entre sí cuando
    // se amontonan, que en una zona sísmica es lo normal y no la excepción.
    // Es SIEMPRE el mismo: no cambia al seleccionar (ver el comentario del
    // marcador).
    borderWidth: 1.5,
    opacity: 0.9,
  },
  // El ancla ordena globo + piquito en columna. El `paddingBottom` lo pone el
  // marcador, porque depende del tamaño del círculo que tiene debajo.
  globoAncla: { alignItems: 'center' },
  globo: {
    /**
     * 🔴 SIN sombra, y no es una decisión estética.
     *
     * La primera versión llevaba `shadowOffset: {height: 2}` con `shadowRadius`
     * y `elevation`. Una sombra agranda los límites de la vista **hacia abajo**,
     * y el marcador se ancla por esos límites, no por lo que se ve: el globo
     * salía corrido respecto del círculo. El borde da la misma separación del
     * mapa sin mover nada.
     */
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 1,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    // Ancho fijo y no `maxWidth`: el marcador se mide antes de pintarse, y sin
    // un ancho concreto sale recortado.
    width: 180,
  },
  globoPico: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    height: 10,
    // Sube para meterse dentro del globo y que la unión no se vea.
    marginTop: -5,
    transform: [{ rotate: '45deg' }],
    width: 10,
  },
});
