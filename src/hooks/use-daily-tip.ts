import { useCallback, useEffect, useState } from 'react';

import { getDb } from '@/lib/db';
import type { Tip } from '@/types/domain';

/**
 * Rotación de tips (spec §11): rota y evita repetir el mismo tip de forma
 * consecutiva. El historial de vistos es local; no aporta nada tenerlo en el
 * servidor.
 */
export function useDailyTip(tips: Tip[]): { tip: Tip | null; next: () => void } {
  const [tip, setTip] = useState<Tip | null>(null);

  const pick = useCallback(
    async (avoidId: string | null) => {
      if (tips.length === 0) return;

      const db = await getDb();
      const seen = await db.getAllAsync<{ tip_id: string }>('SELECT tip_id FROM tips_seen');
      const seenIds = new Set(seen.map((s) => s.tip_id));

      // Con un solo tip cargado no queda otra que repetirlo.
      const candidates = tips.length === 1 ? tips : tips.filter((t) => t.id !== avoidId);

      // Prioriza los que nunca se vieron; cuando se agotan, arranca otra vuelta.
      let pool = candidates.filter((t) => !seenIds.has(t.id));
      if (pool.length === 0) {
        await db.runAsync('DELETE FROM tips_seen');
        pool = candidates;
      }
      if (pool.length === 0) return;

      const chosen = pool[Math.floor(Math.random() * pool.length)];
      setTip(chosen);

      await db.runAsync(
        `INSERT INTO tips_seen (tip_id, seen_at) VALUES (?, ?)
         ON CONFLICT (tip_id) DO UPDATE SET seen_at = excluded.seen_at`,
        chosen.id,
        new Date().toISOString(),
      );
    },
    [tips],
  );

  useEffect(() => {
    // pick() consulta primero el historial local de vistos, así que su setState
    // cae en un microtask posterior, no en el cuerpo del efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!tip && tips.length > 0) void pick(null);
  }, [tips, tip, pick]);

  const next = useCallback(() => {
    void pick(tip?.id ?? null);
  }, [pick, tip?.id]);

  return { tip, next };
}
