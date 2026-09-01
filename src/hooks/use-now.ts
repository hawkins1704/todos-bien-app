import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * Un reloj que avanza, para las horas relativas.
 *
 * **El bug que arregla, encontrado en un teléfono el 2026-09-01.** La tarjeta
 * del sismo decía «hace 1 min» y se quedaba ahí para siempre, con el sismo
 * cumpliendo media hora. No era el formateador: `elapsedShort` y `timeAgo` ya
 * reciben un `now` —por eso el parámetro existe— y nadie se lo pasaba, así que
 * cada uno se quedaba con el instante en que su componente renderizó por última
 * vez. Sin datos nuevos no hay render, y sin render la hora no se mueve.
 *
 * En modo alerta eso no es cosmético: hace parecer recién ocurrido algo de hace
 * media hora, y **el reporte de un contacto igual de fresco de lo que no es**.
 * Toda la pantalla se lee mal en la única situación para la que se escribió.
 *
 * Se detiene con la app en segundo plano: un temporizador corriendo ahí gasta
 * batería para actualizar una pantalla que nadie mira. Al volver se pone en
 * hora de inmediato, que es justo cuando alguien mira.
 */
export function useNow(intervaloMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | undefined;

    const arrancar = () => {
      // Ponerlo en hora YA, sin esperar un intervalo entero: al volver del
      // segundo plano puede haber pasado una hora.
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), intervaloMs);
    };

    const parar = () => {
      if (id) clearInterval(id);
      id = undefined;
    };

    if (AppState.currentState === 'active') arrancar();

    const subscription = AppState.addEventListener('change', (state) => {
      parar();
      if (state === 'active') arrancar();
    });

    return () => {
      parar();
      subscription.remove();
    };
  }, [intervaloMs]);

  return now;
}
