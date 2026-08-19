import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { completeDrill, startDrill } from '@/lib/api';
import { KV, kvDelete, kvGet, kvSet } from '@/lib/db/kv';
import type { StatusKey } from '@/types/domain';

export type ActiveDrill = {
  id: string;
  mode: 'silent' | 'notify';
  startedAt: string;
};

type DrillState = {
  activeDrill: ActiveDrill | null;
  isDrilling: boolean;
  start: (mode: 'silent' | 'notify') => Promise<ActiveDrill>;
  finish: (reportedStatus: StatusKey | null) => Promise<void>;
  abandon: () => Promise<void>;
};

const DrillContext = createContext<DrillState | null>(null);

/** Error que lanza start() cuando el tier free ya agotó sus 3 simulacros. */
export const DRILL_LIMIT_ERROR = 'limite_simulacros_free';

export function DrillProvider({ children }: { children: React.ReactNode }) {
  const [activeDrill, setActiveDrill] = useState<ActiveDrill | null>(null);

  // Si la app se cerró a mitad de un simulacro, al volver seguimos marcándolo:
  // salir de la app no debe dejar al usuario en un estado ambiguo.
  useEffect(() => {
    void kvGet<ActiveDrill>(KV.activeDrillId).then((stored) => {
      if (stored) setActiveDrill(stored);
    });
  }, []);

  const start = useCallback(async (mode: 'silent' | 'notify') => {
    const { id } = await startDrill(mode);
    const drill: ActiveDrill = { id, mode, startedAt: new Date().toISOString() };
    await kvSet(KV.activeDrillId, drill);
    setActiveDrill(drill);
    return drill;
  }, []);

  const finish = useCallback(
    async (reportedStatus: StatusKey | null) => {
      if (!activeDrill) return;
      try {
        await completeDrill(activeDrill.id, reportedStatus);
      } finally {
        await kvDelete(KV.activeDrillId);
        setActiveDrill(null);
      }
    },
    [activeDrill],
  );

  const abandon = useCallback(async () => {
    await kvDelete(KV.activeDrillId);
    setActiveDrill(null);
  }, []);

  const value = useMemo<DrillState>(
    () => ({
      activeDrill,
      isDrilling: activeDrill !== null,
      start,
      finish,
      abandon,
    }),
    [activeDrill, start, finish, abandon],
  );

  return <DrillContext.Provider value={value}>{children}</DrillContext.Provider>;
}

export function useDrill(): DrillState {
  const context = useContext(DrillContext);
  if (!context) throw new Error('useDrill debe usarse dentro de <DrillProvider>');
  return context;
}
