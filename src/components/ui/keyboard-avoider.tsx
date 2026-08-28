import { KeyboardAvoidingView, Platform, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useKeyboardHeight } from '@/hooks/use-keyboard';

export type KeyboardAvoiderProps = ViewProps & {
  /**
   * Cuánto ocupa el header nativo por encima de esta vista. **Solo iOS**: es lo
   * que `KeyboardAvoidingView` necesita para no contar dos veces el espacio del
   * header. En Android no se usa, porque ahí el cálculo es otro.
   */
  iosOffset?: number;
};

/**
 * `KeyboardAvoidingView` que funciona en Android con edge-to-edge.
 *
 * Existe porque el componente de React Native no acierta acá, y el arreglo
 * costó dos intentos equivocados: conviene que viva en UN solo lugar y no
 * repetido en las nueve pantallas con campos de texto que tiene la app.
 *
 * ── iOS ────────────────────────────────────────────────────────────────────
 * `behavior="padding"` tal cual. Funciona bien y no hay nada que corregir.
 *
 * ── Android ────────────────────────────────────────────────────────────────
 * El padding se calcula acá. El patrón que recomienda la documentación de Expo
 * —`behavior={undefined}`, delegando en que el sistema encoja la ventana con
 * `windowSoftInputMode="adjustResize"`— dejó de servir: el proyecto tiene
 * `edgeToEdgeEnabled=true` en `gradle.properties`, el valor por defecto desde
 * SDK 54, y con edge-to-edge la app dibuja **por detrás** del teclado en lugar
 * de que le recorten la ventana. `adjustResize` sigue en el manifiesto sin
 * hacer nada.
 *
 * Poner `behavior="padding"` tampoco alcanzaba: el componente compara su propio
 * marco —medido en la ventana— contra la posición del teclado —informada en la
 * pantalla—, y con edge-to-edge esas dos referencias no coinciden.
 *
 * **Y por qué se le suma `insets.bottom`**, que es lo que costó encontrar: el
 * evento del teclado informa su alto medido desde **arriba de la barra de
 * navegación**, pero el teclado se dibuja **encima** de esa barra, porque no hay
 * ventana que la reserve. Ocupa `kb + insets.bottom` desde el borde de la
 * pantalla; descontar solo `kb` deja el contenido corto justo por la altura de
 * la barra.
 *
 * Medido en un Android real el 2026-08-28: `kb=211`, `insets.bottom=47`,
 * ventana=873, pantalla=873 (iguales, o sea que la ventana no se encoge). Los
 * 258 que suman son un alto de teclado normal; los 211 solos, no.
 *
 * Va con los valores que informa el sistema y **nunca con una constante**: la
 * barra mide ~16 con navegación por gestos y ~47 con los tres botones, y el
 * teclado cambia de alto según cuál esté instalado y en qué idioma. Verificado
 * en el mismo teléfono con los dos modos de navegación.
 */
export function KeyboardAvoider({ style, iosOffset = 0, ...rest }: KeyboardAvoiderProps) {
  const insets = useSafeAreaInsets();
  const alturaTeclado = useKeyboardHeight();
  const esAndroid = Platform.OS === 'android';

  return (
    <KeyboardAvoidingView
      style={[
        style,
        esAndroid && alturaTeclado > 0 ? { paddingBottom: alturaTeclado + insets.bottom } : null,
      ]}
      behavior={esAndroid ? undefined : 'padding'}
      keyboardVerticalOffset={esAndroid ? 0 : iosOffset}
      {...rest}
    />
  );
}
