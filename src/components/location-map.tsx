import Constants from 'expo-constants';
import {
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Text } from '@/components/ui/text';
import { mapsUrl } from '@/lib/location';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Mini mapa estático de un punto, con deep link a la app de mapas del teléfono.
 *
 * **Por qué NO es interactivo.** Los dos lugares donde se usa son pantallas de
 * detalle dentro de un `ScrollView`. Un mapa que acepta arrastre le pelea el
 * gesto al scroll, y en un mapa chico se pierden las dos cosas: la persona
 * intenta bajar y en vez de eso mueve el mapa. Con `cacheEnabled` el mapa se
 * renderiza una vez y se muestra como imagen, así que el gesto queda libre para
 * el scroll y el toque completo abre la app de mapas, que es donde de verdad se
 * puede explorar.
 *
 * **Proveedor por plataforma.** Sin prop `provider`, iOS usa Apple Maps —sin API
 * key, sin cuenta de Google, sin costo— y Android usa Google Maps. El SKU
 * "Maps SDK" de Google (mapa nativo SIN Map ID, que es este caso: marcador
 * clásico y estilo por defecto) tiene tope de uso "Unlimited" y precio "—", o
 * sea que no factura. Pedir un Map ID —lo que exigen el estilo desde la consola,
 * los Advanced Markers y el data-driven styling— movería el cobro al SKU
 * "Dynamic Maps": 10.000 gratis al mes y después $7 por millar. Por eso acá NO
 * se usa `customMapStyle` ni marcadores avanzados: el tema oscuro se resuelve
 * con `userInterfaceStyle`, que no necesita Map ID.
 */
export function LocationMap({
  latitude,
  longitude,
  spanKm = 6,
  pinColor,
  label,
  height = 170,
  style,
}: {
  latitude: number;
  longitude: number;
  /**
   * Cuántos km debe abarcar el ALTO del mapa. Más chico = más cerca.
   *
   * No hay un valor bueno para todos: depende de qué pregunta responde el mapa,
   * y los dos usos actuales están en extremos opuestos a propósito.
   *
   * - **Contacto (3 km):** la pregunta es "¿en qué cuadra está?". A esta escala
   *   se leen los nombres de las calles, que es la respuesta. Quien mira ya sabe
   *   en qué ciudad vive esa persona.
   * - **Epicentro (300 km):** la pregunta es "¿a qué distancia de mí pasó?".
   *   Necesita que entren la costa y las ciudades de referencia; con zoom de
   *   calle un epicentro no dice absolutamente nada.
   */
  spanKm?: number;
  pinColor?: string;
  /** Se lee en voz alta y titula el punto en la app de mapas. */
  label: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors, scheme } = useTheme();

  if (!androidMapsReady) return null;

  // 1° de latitud son ~111 km en cualquier punto del planeta, así que `spanKm`
  // se traduce directo. `Region` exige declarar también el delta de longitud,
  // pero el valor no importa mucho: el mapa ensancha el que haga falta para
  // respetar la proporción de la vista. Como esta es mucho más ancha que alta,
  // el que manda es el de latitud —o sea el alto—, que es lo que documenta
  // `spanKm`.
  const latitudeDelta = spanKm / 111;

  return (
    <Pressable
      onPress={() => void Linking.openURL(mapsUrl(latitude, longitude, label))}
      accessibilityRole="button"
      accessibilityLabel={`${label}. Abrir en la app de mapas.`}
      style={({ pressed }) => [
        styles.marco,
        { borderColor: colors.border, height },
        style,
        pressed ? styles.pressed : null,
      ]}>
      <MapView
        style={StyleSheet.absoluteFill}
        // El mapa ya no responde a gestos (`cacheEnabled`), pero sin esto sigue
        // capturando el toque y el Pressable de arriba nunca se entera.
        pointerEvents="none"
        cacheEnabled
        liteMode={Platform.OS === 'android'}
        userInterfaceStyle={scheme}
        initialRegion={{ latitude, longitude, latitudeDelta, longitudeDelta: latitudeDelta }}
        // El encuadre se fija una sola vez: sin esto el mapa recentra al azul de
        // "mi ubicación" y deja de mostrar el punto que vino a mostrar.
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}>
        <Marker
          coordinate={{ latitude, longitude }}
          title={label}
          pinColor={pinColor ?? colors.accent}
        />
      </MapView>

      <View style={[styles.pie, { backgroundColor: colors.scrim }]}>
        <Text variant="caption" style={styles.pieTexto}>
          Toca para abrir en tu app de mapas
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * En Android el mapa es Google y Google exige una API key: sin ella se dibuja un
 * rectángulo gris con el logo encima, que es peor que no mostrar nada.
 *
 * La key se declara una sola vez, en el config plugin de `app.json`:
 *
 * ```json
 * ["react-native-maps", { "androidGoogleMapsApiKey": "AIza..." }]
 * ```
 *
 * Se lee de ahí en vez de duplicarla en una constante propia, para que no exista
 * un segundo lugar que se pueda desincronizar. Mientras Android no esté
 * empezado (ver docs/ESTADO-DEL-PROYECTO.md §4) el componente no renderiza y las
 * dos pantallas quedan exactamente como estaban: con el botón que abre la app de
 * mapas. En iOS es siempre `true`, porque Apple Maps no lleva key.
 */
const androidMapsReady =
  Platform.OS !== 'android' ||
  (Constants.expoConfig?.plugins ?? []).some(
    (plugin) =>
      Array.isArray(plugin) &&
      plugin[0] === 'react-native-maps' &&
      Boolean((plugin[1] as { androidGoogleMapsApiKey?: string } | undefined)?.androidGoogleMapsApiKey),
  );

const styles = StyleSheet.create({
  marco: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  pie: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  // Blanco fijo y no `colors.text`: va sobre el scrim oscuro en los dos temas.
  pieTexto: { color: '#FFFFFF' },
  pressed: { opacity: 0.85 },
});
