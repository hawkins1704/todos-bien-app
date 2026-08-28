import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/**
 * Alto del teclado en pantalla, o 0 si está cerrado.
 *
 * Existe porque `KeyboardAvoidingView` no acierta en Android con edge-to-edge,
 * y conviene entender por qué antes de cambiarlo: su cálculo compara el marco
 * de sí mismo —medido **en la ventana**— contra la posición del teclado
 * —informada **en la pantalla**—. Con edge-to-edge la ventana se extiende por
 * detrás de las barras del sistema, así que las dos referencias dejan de
 * coincidir y el padding sale corto por una diferencia que no es constante ni
 * fácil de compensar a ojo.
 *
 * El evento del teclado, en cambio, trae el alto real y ya. Con ese número el
 * layout es aritmética, no adivinanza.
 *
 * En iOS se escuchan los `will*`, que llegan **antes** de la animación, para
 * que el contenido acompañe al teclado en vez de saltar cuando ya terminó de
 * subir. Android solo emite los `did*`.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const subs = [
      Keyboard.addListener(
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
        (event) => setHeight(event.endCoordinates.height),
      ),
      Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () =>
        setHeight(0),
      ),
    ];

    return () => subs.forEach((s) => s.remove());
  }, []);

  return height;
}
