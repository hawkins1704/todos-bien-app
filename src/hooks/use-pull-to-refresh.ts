import { useCallback, useRef, useState } from 'react';

/**
 * Estado del `RefreshControl` que se enciende **solo** cuando la persona tira de
 * la lista.
 *
 * **Por qué existe.** El spinner de pull-to-refresh no es un indicador de "hay
 * una sincronización en curso": es la respuesta visual a un gesto. Cuando se lo
 * ataba a una bandera global de sincronización, cualquier refresco automático
 * —arrancar la app, volver del segundo plano, recuperar la red— lo prendía sin
 * que nadie lo hubiera pedido.
 *
 * Y no era solo raro: se **quedaba trabado**. Prender `refreshing` por código
 * hace que iOS empuje el contenido hacia abajo con una animación; si eso pasa
 * mientras la vista no está en pantalla (la app volviendo del segundo plano, o
 * una pestaña que `react-native-screens` tiene desmontada), la animación nunca
 * termina y al apagarse `refreshing` el scroll se queda corrido, con el spinner
 * a la vista. Se arreglaba solo al cambiar de pestaña y volver, porque eso
 * fuerza un layout nuevo.
 *
 * Con este hook los refrescos automáticos son silenciosos: la lista se
 * reemplaza sola cuando llegan los datos, que es justamente lo que se espera de
 * una caché que se revalida sola.
 *
 * @param action Qué hacer al tirar. El spinner se apaga cuando su promesa
 *   termina, falle o no: quien la pasa se encarga de mostrar el error.
 */
export function usePullToRefresh(action: () => Promise<unknown>): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);

  /** Evita disparar dos veces si el gesto se repite antes de que termine. */
  const enCurso = useRef(false);

  const onRefresh = useCallback(() => {
    if (enCurso.current) return;
    enCurso.current = true;
    setRefreshing(true);

    void (async () => {
      try {
        await action();
      } catch {
        // El error es de quien pasó la acción; acá solo hay que apagar el spinner.
      } finally {
        enCurso.current = false;
        setRefreshing(false);
      }
    })();
  }, [action]);

  return { refreshing, onRefresh };
}
