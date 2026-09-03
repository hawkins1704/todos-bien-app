import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useAppData } from '@/context/app-data';
import { endMyDrill, startDrill } from '@/lib/api';
import { KV, kvSet } from '@/lib/db/kv';
import { reportMyStatus, syncActiveDrill } from '@/lib/sync';
import type { ActiveDrill } from '@/types/domain';

type DrillState = {
  activeDrill: ActiveDrill | null;
  isDrilling: boolean;
  /** Quiénes practican. Vacío en un simulacro individual. */
  participantIds: string[];
  /**
   * Convoca un simulacro. Con `groupId` es grupal: el servidor mete a los
   * integrantes y les manda el aviso, así que sus teléfonos entran en modo
   * simulacro solos.
   */
  start: (groupId: string | null) => Promise<void>;
  /**
   * Salir. El servidor decide qué significa según quién llama: quien lo convocó
   * lo cierra **para todos**; el resto se va solo.
   */
  end: () => Promise<boolean>;
};

const DrillContext = createContext<DrillState | null>(null);

/** Error que lanza start() cuando el tier free ya agotó sus simulacros. */
export const DRILL_LIMIT_ERROR = 'limite_simulacros_free';

/**
 * Cada cuánto se relee el estado de los demás mientras hay un simulacro.
 *
 * 8 s es lo que separa «se actualizó solo» de «no se actualiza». Más corto no
 * aporta —nadie reporta dos veces en cinco segundos— y más largo devuelve el
 * síntoma: alguien se pone en verde y en la otra pantalla sigue gris el rato
 * suficiente para que se lea como que no funcionó.
 */
const REFRESCO_EN_SIMULACRO_MS = 8_000;

/**
 * El modo simulacro (migración 0035).
 *
 * **No guarda estado propio**: el simulacro vive en el servidor y llega por la
 * misma sincronización que todo lo demás (`AppDataProvider`). Eso es lo que hace
 * que un simulacro grupal encienda el teléfono del otro sin que nadie abra nada:
 * llega el push → `refresh()` → aparece `activeDrill` → la app entra en modo.
 *
 * Acá viven solo las dos acciones y **la regla de seguridad de abajo**.
 */
export function DrillProvider({ children }: { children: React.ReactNode }) {
  const { activeDrill, drillParticipantIds, activeQuake, myStatus, refresh } = useAppData();
  const [cerrandoPorSismo, setCerrandoPorSismo] = useState(false);
  const yaCerrado = useRef<string | null>(null);

  const start = useCallback(
    async (groupId: string | null) => {
      // `notify` cuando hay grupo, `silent` cuando no: es lo mismo que dice el
      // producto — el individual es privado y no le avisa a nadie.
      const { id } = await startDrill(groupId ? 'notify' : 'silent', groupId);
      // Optimista, para que la Home entre en modo antes de que vuelva el
      // refresco completo. El `refresh` de abajo lo confirma contra el servidor.
      await kvSet(KV.activeDrill, {
        id,
        groupId,
        groupName: null,
        startedBy: '',
        startedByName: '',
        isMine: true,
        startedAt: new Date().toISOString(),
        endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      } satisfies ActiveDrill);
      await refresh();
    },
    [refresh],
  );

  /**
   * Devuelve si el servidor confirmó el cierre.
   *
   * No lanza nunca, y eso es deliberado: **salir tiene que funcionar siempre**.
   * Antes esto era un `try/finally` sin `catch` —la deuda 1.13— y un fallo de
   * red salía como promesa no capturada por los dos llamadores, que tampoco
   * capturan. El modo se apagaba igual, así que el síntoma era el peor de
   * todos: parecía que había funcionado.
   *
   * Quien llama decide si el fallo merece decirse. Y a veces sí: si convocaste
   * un simulacro grupal y el cierre no llegó, los demás siguen adentro hasta
   * que caduque, y tu pantalla ya no lo muestra.
   */
  const end = useCallback(async (): Promise<boolean> => {
    if (!activeDrill) return true;
    let cerradoEnServidor = false;
    try {
      await endMyDrill(activeDrill.id);
      cerradoEnServidor = true;

      // 🔴 Y se limpia el estado, que es lo que la red está mirando. Sin esto,
      // quien practicó «necesito ayuda» se queda con esa marca puesta después
      // de salir: sus contactos verían «necesita ayuda · simulacro» durante
      // horas, sobre un simulacro que ya terminó. Solo se toca si el estado
      // vigente ES de simulacro — un reporte real no se pisa nunca.
      if (myStatus?.isDrill) {
        await reportMyStatus({ status: 'safe', quakeEventId: null, isDrill: false });
      }
    } catch {
      // Se traga a propósito: lo informa el valor de retorno.
    } finally {
      // Aunque el servidor falle: el modo se apaga en este teléfono. Dejar a
      // alguien encerrado en un simulacro por un error de red sería peor que
      // una fila que el `ends_at` va a cerrar sola en menos de una hora.
      await kvSet(KV.activeDrill, null);
      await refresh();
    }
    return cerradoEnServidor;
  }, [activeDrill, myStatus, refresh]);

  /**
   * 🔴 Un sismo REAL cierra el simulacro. Sin discusión.
   *
   * Es la única regla no negociable de todo esto: el banner amarillo que dice
   * «esto es una práctica» encima de una alerta de verdad es una ambigüedad que
   * puede costar una vida. `activeQuake` durante un simulacro es el sintético,
   * así que la comprobación mira que el origen NO sea `'simulacro'` — eso solo
   * puede pasar si `AppDataProvider` prefirió un sismo real, que es exactamente
   * lo que hace cuando llega uno.
   *
   * `yaCerrado` evita reintentar en bucle si el cierre falla por red: se intenta
   * una vez por simulacro, y el modo local se apaga igual.
   */
  useEffect(() => {
    if (!activeDrill || !activeQuake) return;
    if (activeQuake.source === 'simulacro') return;
    if (yaCerrado.current === activeDrill.id) return;

    yaCerrado.current = activeDrill.id;
    setCerrandoPorSismo(true);
    void end().finally(() => setCerrandoPorSismo(false));
  }, [activeDrill, activeQuake, end]);

  /**
   * El simulacro caduca solo a los 60 minutos, y el servidor deja de
   * devolverlo. Este temporizador es lo que hace que la pantalla se entere sin
   * esperar al próximo refresco: si no, el banner amarillo se quedaría puesto
   * sobre un simulacro que ya no existe.
   */
  useEffect(() => {
    if (!activeDrill) return;

    const restante = Date.parse(activeDrill.endsAt) - Date.now();
    if (Number.isNaN(restante)) return;

    const id = setTimeout(
      () => {
        void syncActiveDrill().then(() => refresh());
      },
      Math.max(restante, 0) + 1000,
    );

    return () => clearTimeout(id);
  }, [activeDrill, refresh]);

  /**
   * Durante un simulacro la pantalla se refresca sola. Es el paso 9f.17.
   *
   * ## Por qué hace falta, y por qué SOLO acá
   *
   * La Home tiene cinco disparadores de refresco: montar, recuperar red, volver
   * al primer plano, tirar de la lista, y **que llegue un push** (el arreglo de
   * 7d.1). En un sismo real ese último cubre todo: si alguien reporta «estoy
   * bien», sale `contact_reported` o `contact_is_safe`, llega el push, la
   * pantalla se mueve.
   *
   * En un simulacro no sale nada. Verificado en la corrida del 2026-09-02
   * leyendo `notification_deliveries`: de un simulacro grupal entero salieron
   * `drill_started`, `drill_ended` y `contact_needs_help`, y **ni un solo aviso
   * por «estoy bien»**. Así que el participante se ponía en verde en el
   * servidor y en la pantalla del convocante seguía gris.
   *
   * Encima los otros cuatro disparadores tampoco sirven ahí: la capa oscura de
   * la guía tapa el gesto de tirar de la lista, y nadie va a mandar la app al
   * fondo en mitad de una práctica. Quedaba sin salida.
   *
   * **Lo que engañaba:** marcar «necesito ayuda» sí manda push, así que la
   * pantalla se movía justo después de ese paso y parecía que el problema se
   * arreglaba solo. Lo arreglaba el aviso del paso anterior.
   *
   * ## Por qué sondeo y no un push nuevo
   *
   * Un aviso por cada cambio de estado es exactamente el ruido que la 0026 y
   * 7c.4 se ocuparon de sacar. Y acá no hace falta avisar: la persona **está
   * mirando la pantalla**, que es lo que significa estar en un simulacro. Lo
   * que falta no es enterarse, es que lo que ya está delante se actualice.
   *
   * Está acotado por los dos lados: solo con simulacro activo, y el simulacro
   * caduca a los 60 minutos. Fuera de un simulacro esto no existe.
   */
  useEffect(() => {
    if (!activeDrill) return;

    const id = setInterval(() => {
      void refresh();
    }, REFRESCO_EN_SIMULACRO_MS);

    return () => clearInterval(id);
  }, [activeDrill, refresh]);

  const value = useMemo<DrillState>(
    () => ({
      activeDrill,
      // Mientras se está cerrando por un sismo real el modo ya cuenta como
      // apagado: lo que tiene que ver la persona es la alerta, no la práctica.
      isDrilling: activeDrill !== null && !cerrandoPorSismo,
      participantIds: drillParticipantIds,
      start,
      end,
    }),
    [activeDrill, cerrandoPorSismo, drillParticipantIds, start, end],
  );

  return <DrillContext.Provider value={value}>{children}</DrillContext.Provider>;
}

export function useDrill(): DrillState {
  const context = useContext(DrillContext);
  if (!context) throw new Error('useDrill debe usarse dentro de <DrillProvider>');
  return context;
}
