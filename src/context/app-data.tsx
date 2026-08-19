import * as Network from 'expo-network';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth';
import { syncLocationPermission } from '@/lib/alert-response';
import { readCircle } from '@/lib/db/circle';
import { getDb } from '@/lib/db';
import { KV, kvGet } from '@/lib/db/kv';
import { pendingCount } from '@/lib/db/outbox';
import { flushOutbox, syncEverything } from '@/lib/sync';
import type { CircleMember, MyProfile, MySettings, MyStatus, QuakeEvent, Tip } from '@/types/domain';

type AppDataState = {
  circle: CircleMember[];
  /** Solo conexiones aceptadas: es lo que se pinta en el dashboard. */
  accepted: CircleMember[];
  /** Solicitudes que me mandaron y todavía no respondo. */
  incomingRequests: CircleMember[];
  /** Solicitudes que yo mandé y siguen sin respuesta. */
  outgoingRequests: CircleMember[];
  myProfile: MyProfile | null;
  mySettings: MySettings | null;
  myStatus: MyStatus | null;
  activeQuake: QuakeEvent | null;
  tips: Tip[];
  lastMonitoringCheck: string | null;
  lastCircleSync: string | null;
  online: boolean;
  syncing: boolean;
  pendingWrites: number;
  /** Relee SQLite sin tocar la red. Instantáneo. */
  reloadLocal: () => Promise<void>;
  /** Baja del servidor y luego relee. Puede fallar sin romper la UI. */
  refresh: () => Promise<void>;
};

const AppDataContext = createContext<AppDataState | null>(null);

/** Referencia estable: evita recrear el array vacío en cada render. */
const EMPTY_CIRCLE: CircleMember[] = [];

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const networkState = Network.useNetworkState();

  const [circle, setCircle] = useState<CircleMember[]>([]);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [mySettings, setMySettings] = useState<MySettings | null>(null);
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null);
  const [activeQuake, setActiveQuake] = useState<QuakeEvent | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [lastMonitoringCheck, setLastMonitoringCheck] = useState<string | null>(null);
  const [lastCircleSync, setLastCircleSync] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);

  const online = networkState.isInternetReachable ?? networkState.isConnected ?? false;
  const wasOnline = useRef(online);

  const reloadLocal = useCallback(async () => {
    if (!userId) return;

    const db = await getDb();
    const [members, profile, settings, status, quake, monitoring, circleSync, tipRows, pending] =
      await Promise.all([
        readCircle(),
        kvGet<MyProfile>(KV.myProfile),
        kvGet<MySettings>(KV.mySettings),
        kvGet<MyStatus>(KV.myStatus),
        kvGet<QuakeEvent>(KV.activeQuake),
        kvGet<string>(KV.lastQuakeCheck),
        kvGet<string>(KV.lastCircleSync),
        db.getAllAsync<{
          id: string;
          title: string;
          body: string;
          long_body: string | null;
          source_name: string;
          source_url: string;
          phase: string;
          sort_order: number;
        }>('SELECT * FROM tips_cache ORDER BY sort_order'),
        pendingCount(),
      ]);

    setCircle(members);
    setMyProfile(profile);
    setMySettings(settings);
    setMyStatus(status);
    setActiveQuake(quake);
    setLastMonitoringCheck(monitoring);
    setLastCircleSync(circleSync);
    setPendingWrites(pending);
    setTips(
      tipRows.map((t) => ({
        id: t.id,
        title: t.title,
        body: t.body,
        longBody: t.long_body,
        sourceName: t.source_name,
        sourceUrl: t.source_url,
        phase: t.phase as Tip['phase'],
        sortOrder: t.sort_order,
      })),
    );
  }, [userId]);

  const refresh = useCallback(async () => {
    if (!userId) return;

    setSyncing(true);

    try {
      await syncEverything(userId);
    } catch {
      // Sin red o con red mala no pasa nada: seguimos mostrando la caché.
    }

    try {
      // Va en su propio try: si la sincronización falla por red, el permiso de
      // ubicación igual tiene que revisarse. Es lo único que saca a alguien del
      // callejón sin salida de "concedí el permiso después del onboarding y la
      // app nunca se enteró" (ver syncLocationPermission).
      await syncLocationPermission(userId);
    } catch {
      // Se reintenta solo en el próximo refresco.
    }

    await reloadLocal();
    setSyncing(false);
  }, [userId, reloadLocal]);

  useEffect(() => {
    // Carga inicial: primero lo local (instantáneo), después el refresco.
    // reloadLocal empieza con un await a SQLite, así que el setState cae en un
    // microtask posterior; el linter no ve a través del límite async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadLocal().then(() => refresh());
  }, [reloadLocal, refresh]);

  // Al recuperar conectividad se vacía el outbox solo, sin acción del usuario.
  useEffect(() => {
    if (online && !wasOnline.current && userId) {
      void flushOutbox().then(() => refresh());
    }
    wasOnline.current = online;
  }, [online, userId, refresh]);

  // Volver a la app refresca: es el momento típico tras recibir una alerta.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && userId) void refresh();
    });
    return () => subscription.remove();
  }, [userId, refresh]);

  // Al cerrar sesión no se limpia el estado desde un efecto: se deriva. Un
  // setState síncrono dentro de un efecto provoca renders en cascada, y acá
  // además sería innecesario porque signOut ya borra la caché local.
  const visibleCircle = useMemo(() => (userId ? circle : EMPTY_CIRCLE), [userId, circle]);

  const accepted = useMemo(
    () => visibleCircle.filter((m) => m.connectionStatus === 'accepted'),
    [visibleCircle],
  );

  const incomingRequests = useMemo(
    () =>
      visibleCircle.filter((m) => m.connectionStatus === 'pending' && m.requestedBy === m.userId),
    [visibleCircle],
  );

  const outgoingRequests = useMemo(
    () =>
      visibleCircle.filter((m) => m.connectionStatus === 'pending' && m.requestedBy !== m.userId),
    [visibleCircle],
  );

  const value = useMemo<AppDataState>(
    () => ({
      circle: visibleCircle,
      accepted,
      incomingRequests,
      outgoingRequests,
      myProfile: userId ? myProfile : null,
      mySettings: userId ? mySettings : null,
      myStatus: userId ? myStatus : null,
      activeQuake: userId ? activeQuake : null,
      tips,
      lastMonitoringCheck,
      lastCircleSync,
      online,
      syncing,
      pendingWrites,
      reloadLocal,
      refresh,
    }),
    [
      userId,
      visibleCircle,
      accepted,
      incomingRequests,
      outgoingRequests,
      myProfile,
      mySettings,
      myStatus,
      activeQuake,
      tips,
      lastMonitoringCheck,
      lastCircleSync,
      online,
      syncing,
      pendingWrites,
      reloadLocal,
      refresh,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData(): AppDataState {
  const context = useContext(AppDataContext);
  if (!context) throw new Error('useAppData debe usarse dentro de <AppDataProvider>');
  return context;
}
