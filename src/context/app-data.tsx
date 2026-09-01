import * as Notifications from 'expo-notifications';
import * as Network from 'expo-network';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/context/auth';
import { syncLocationPermission } from '@/lib/alert-response';
import { readCircle } from '@/lib/db/circle';
import { getDb } from '@/lib/db';
import { KV, kvGet } from '@/lib/db/kv';
import { syncPushToken } from '@/lib/notifications';
import { onOutboxChange, pendingCount } from '@/lib/db/outbox';
import { supabase } from '@/lib/supabase';
import { flushOutbox, syncEverything } from '@/lib/sync';
import type {
  Group,
  CircleMember,
  MyProfile,
  MySettings,
  MyStatus,
  QuakeEvent,
  Tip,
} from '@/types/domain';

type AppDataState = {
  circle: CircleMember[];
  /** Solo conexiones aceptadas: es lo que se pinta en el dashboard. */
  accepted: CircleMember[];
  /** Solicitudes que me mandaron y todavía no respondo. */
  incomingRequests: CircleMember[];
  /** Solicitudes que yo mandé y siguen sin respuesta. */
  outgoingRequests: CircleMember[];
  /**
   * Los grupos (migración 0034): los que creaste y aquellos donde te metieron,
   * con sus integrantes y su chat ya resueltos.
   */
  groups: Group[];
  myProfile: MyProfile | null;
  mySettings: MySettings | null;
  myStatus: MyStatus | null;
  activeQuake: QuakeEvent | null;
  tips: Tip[];
  lastMonitoringCheck: string | null;
  lastCircleSync: string | null;
  online: boolean;
  pendingWrites: number;
  /** Relee SQLite sin tocar la red. Instantáneo. */
  reloadLocal: () => Promise<void>;
  /**
   * Baja del servidor y luego relee. Puede fallar sin romper la UI.
   *
   * A propósito **no** expone una bandera de "sincronizando". La tenía, y las
   * pantallas la ataban al `RefreshControl`: cada refresco automático —arrancar,
   * volver del segundo plano, recuperar la red— prendía el spinner de
   * pull-to-refresh sin que nadie tirara de la lista, y encima se quedaba
   * trabado (ver `usePullToRefresh`). Quien necesite saber cuándo terminó tiene
   * la promesa que devuelve.
   */
  refresh: () => Promise<void>;
};

const AppDataContext = createContext<AppDataState | null>(null);

/** Referencia estable: evita recrear el array vacío en cada render. */
const EMPTY_CIRCLE: CircleMember[] = [];
const EMPTY_GROUPS: Group[] = [];

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const networkState = Network.useNetworkState();

  const [circle, setCircle] = useState<CircleMember[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [mySettings, setMySettings] = useState<MySettings | null>(null);
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null);
  const [activeQuake, setActiveQuake] = useState<QuakeEvent | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [lastMonitoringCheck, setLastMonitoringCheck] = useState<string | null>(null);
  const [lastCircleSync, setLastCircleSync] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  const online = networkState.isInternetReachable ?? networkState.isConnected ?? false;
  const wasOnline = useRef(online);

  const reloadLocal = useCallback(async () => {
    if (!userId) return;

    const db = await getDb();
    const [
      members,
      gruposCacheados,
      profile,
      settings,
      status,
      quake,
      monitoring,
      circleSync,
      tipRows,
      pending,
    ] = await Promise.all([
      readCircle(),
      kvGet<Group[]>(KV.groups),
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
    setGroups(gruposCacheados ?? EMPTY_GROUPS);
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

    try {
      await syncEverything(userId);
    } catch (primerIntento) {
      // Reintento único, y no es paranoia defensiva: acá se decide si la Home
      // muestra "todo en calma" o "SISMO EN LIMA".
      //
      // El momento en que este refresco corre —volver a la app después de un
      // rato— es exactamente cuando más probable es que falle: supabase-js
      // congela su timer de renovación mientras la app está en segundo plano
      // (ver `startAutoRefresh` en lib/supabase.ts), así que al volver puede
      // haber un instante con el token vencido. Ese instante es una carrera
      // contra este refresco, y si lo pierde, el `catch` se comía el error, la
      // pantalla se quedaba con la caché vieja y la persona veía "todo bien"
      // justo después de que temblara. Solo se recuperaba tirando de la lista
      // a mano.
      //
      // `getSession()` renueva el token si hace falta, así que el segundo
      // intento ya va con credenciales buenas.
      if (__DEV__) console.warn('[sync] primer intento falló, reintentando', primerIntento);

      try {
        await supabase.auth.getSession();
        await syncEverything(userId);
      } catch {
        // Ahora sí: sin red no pasa nada, seguimos mostrando la caché.
      }
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

    try {
      // Mismo caso que el permiso de ubicación, con el de notificaciones: el
      // token solo se registraba en el onboarding, que no se repite nunca (ver
      // syncPushToken). Va aparte para que un fallo acá no impida lo de arriba.
      await syncPushToken(userId);
    } catch {
      // Se reintenta solo en el próximo refresco.
    }

    await reloadLocal();
  }, [userId, reloadLocal]);

  useEffect(() => {
    // Carga inicial: primero lo local (instantáneo), después el refresco.
    // reloadLocal empieza con un await a SQLite, así que el setState cae en un
    // microtask posterior; el linter no ve a través del límite async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadLocal().then(() => refresh());
  }, [reloadLocal, refresh]);

  // El contador de pendientes se corrige solo cuando la cola cambia.
  //
  // Vaciar el outbox es asíncrono y nadie lo espera —a propósito: reportar tu
  // estado no puede quedar colgado de la red—, así que el `reloadLocal()` que
  // viene justo después de reportar lee el contador ANTES de que la escritura
  // termine y muestra "1 cambio por enviar" para algo que ya salió. Se corregía
  // recién en el siguiente refresco.
  useEffect(
    () =>
      onOutboxChange(() => {
        void pendingCount().then(setPendingWrites);
      }),
    [],
  );

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

  /**
   * Un aviso que llega con la app ABIERTA también refresca.
   *
   * Sin esto había un agujero que se veía como un bug del servidor. Los cuatro
   * disparadores de refresco eran: montar, recuperar red, volver al primer plano
   * y tirar de la lista. Ninguno ocurre si la persona ya está mirando la app
   * cuando llega el push — que es exactamente lo que pasa en un sismo, porque
   * la abrió a los diez segundos de que temblara y no la soltó más.
   *
   * El síntoma real (recorrido del 2026-08-28): a la cuenta A le llegó la
   * notificación del sismo y su Home decía «Nadie de tu círculo en la zona»
   * aunque B estuviera adentro, y el dato estaba bien en el servidor. Se
   * arreglaba solo tirando de la lista a mano. El resto de los avisos tenía el
   * mismo problema, más silencioso: reportar «estoy bien» desde el otro teléfono
   * no movía nada acá hasta que alguien saliera y volviera a entrar a la app.
   *
   * Va acá y no en `NotificationRouter` a propósito: ese solo escucha el TOQUE
   * de un aviso (`ResponseReceived`), que es el caso en el que la app pasa a
   * primer plano y el `AppState` de arriba ya cubría.
   */
  useEffect(() => {
    if (!userId) return;
    const subscription = Notifications.addNotificationReceivedListener(() => {
      void refresh();
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

  const visibleGroups = useMemo(
    () => (userId ? groups : EMPTY_GROUPS),
    [userId, groups],
  );

  const value = useMemo<AppDataState>(
    () => ({
      circle: visibleCircle,
      accepted,
      incomingRequests,
      outgoingRequests,
      groups: visibleGroups,
      myProfile: userId ? myProfile : null,
      mySettings: userId ? mySettings : null,
      myStatus: userId ? myStatus : null,
      activeQuake: userId ? activeQuake : null,
      tips,
      lastMonitoringCheck,
      lastCircleSync,
      online,
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
      visibleGroups,
      myProfile,
      mySettings,
      myStatus,
      activeQuake,
      tips,
      lastMonitoringCheck,
      lastCircleSync,
      online,
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
