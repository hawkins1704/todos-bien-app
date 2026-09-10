import { useMemo } from 'react';

import type { Tip } from '@/types/domain';

/**
 * El consejo del día. **Uno, y el mismo hasta la medianoche.**
 *
 * ## Qué reemplazó, y por qué
 *
 * La versión anterior sorteaba uno al azar en cada montaje y guardaba los vistos
 * en SQLite (`tips_seen`). O sea que el consejo cambiaba al volver de otra
 * pestaña, y la tarjeta se leía como un adorno que rota: nada que valga la pena
 * abrir, porque mañana —o en diez segundos— hay otro.
 *
 * Uno por día lo convierte en una cita. Es lo mismo que hace que alguien vuelva
 * a abrir la app un martes cualquiera sin que haya temblado, que es justo lo que
 * el Centro de Preparación necesita para no ser una compra de una sola vez.
 *
 * ## Cómo se elige
 *
 * Sin servidor y sin guardar nada: la fecha **es** la semilla. Todos los
 * teléfonos muestran lo mismo el mismo día, y desinstalar la app no reinicia
 * nada.
 *
 * `(revuelto(ciclo) + día) % n` recorre la lista **entera** de a un paso por
 * día, empezando en un punto distinto en cada vuelta. Es a propósito y no un
 * sorteo por día: con azar puro la probabilidad de repetir el consejo de ayer es
 * 1 entre 12, y dos días seguidos con lo mismo se lee como un error, no como una
 * casualidad. Así solo puede pasar en la costura entre dos vueltas.
 *
 * El día se calcula en hora **local**: cambia a la medianoche de quien lo mira,
 * no a las 7 de la tarde de Lima que sería la medianoche UTC.
 *
 * ⚠️ `tips_seen` en SQLite ya no lo usa nadie. La tabla sigue creándose en
 * `lib/db` porque borrarla de un esquema local que ya está instalado en
 * teléfonos pide una migración propia, y no estorba.
 */
export function useDailyTip(tips: Tip[]): Tip | null {
  return useMemo(() => {
    if (tips.length === 0) return null;

    const ahora = new Date();
    const dia = Math.floor((ahora.getTime() - ahora.getTimezoneOffset() * 60_000) / 86_400_000);
    const ciclo = Math.floor(dia / tips.length);

    return tips[(((revuelto(ciclo) + dia) % tips.length) + tips.length) % tips.length];
  }, [tips]);
}

/**
 * Mezclador entero de 32 bits.
 *
 * Solo se le pide que ciclos consecutivos arranquen en puntos que no se parezcan
 * —`ciclo * algo % n` daría un patrón visible— así que un multiplicador y dos
 * desplazamientos alcanzan. No es criptografía ni pretende serlo.
 */
function revuelto(n: number): number {
  let x = n | 0;
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  x = Math.imul(x ^ (x >>> 16), 0x45d9f3b);
  return (x ^ (x >>> 16)) >>> 0;
}
