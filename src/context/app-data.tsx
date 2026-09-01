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
import { isAlertActive } from '@/lib/quakes';
import { onOutboxChange, pendingCount } from '@/lib/db/outbox';
import { supabase } from '@/lib/supabase';
import { flushOutbox, syncEverything } from '@/lib/sync';
import { drillQuakeId } from '@/types/domain';
import type {
  ActiveDrill,
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
  /**
   * El sismo que la app está mostrando. Durante un simulacro es uno sintético
   * y **local**; si tiembla de verdad, el real siempre gana.
   */
  activeQuake: QuakeEvent | null;
  /** El simulacro en curso, o `null`. Ver `DrillProvider` para las acciones. */
  activeDrill: ActiveDrill | null;
  /** Quiénes están practicando. Vacío en un simulacro individual. */
  drillParticipantIds: string[];
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
const EMPTY_IDS: string[] = [];

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const networkState = Network.useNetworkState();

  const [circle, setCircle] = useState<CircleMember[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [mySettings, setMySettings] = useState<MySettings | null>(null);
  const [myStatus, setMyStatus] = useState<MyStatus | null>(null);
  const [activeQuake, setActiveQuake] = useState<QuakeEvent | null>(null);
  const [activeDrill, setActiveDrill] = useState<ActiveDrill | null>(null);
  const [tips, setTips] = useState<Tip[]>([]);
  const [lastMonitoringCheck, setLastMonitoringCheck] = useState<string | null>(null);
  const [lastCircleSync, setLastCircleSync] = useState<string | null>(null);
  const [pendingWrites, setPendingWrites] = useState(0);

  /**
   * ¿Hay conexión?
   *
   * 🔴 **`isInternetReachable` no significa lo mismo en los dos sistemas**, y
   * creer que sí costó un diagnóstico entero el 2026-09-01. La doc de Expo SDK
   * 57 lo dice: en iOS ese campo *siempre* vale lo mismo que `isConnected`,
   * pero en Android exige que el sistema haya **confirmado** el acceso a
   * internet —la validación de portal cautivo— y que una VPN, si la hay, tenga
   * ancho de banda de bajada distinto de cero.
   *
   * O sea que en Android hay redes que funcionan perfecto y reportan `false`.
   * Y como `??` solo cae al siguiente valor con `null` o `undefined`, ese
   * `false` le ganaba a un `isConnected: true` correcto: la insignia decía «Sin
   * conexión · mostrando datos guardados» mientras la app bajaba sismos sin
   * problema. Peor que el cartel: con `online` clavado en `false`, el refresco
   * al reconectar de más abajo **no se dispara nunca**, así que la pantalla se
   * queda sin volver a renderizar y hasta la hora relativa se congela.
   *
   * La regla nueva: manda `isConnected`, que es la pregunta que la insignia de
   * verdad hace —¿hay red?—. `isInternetReachable` solo se usa para lo que sí
   * sabe: si es `false` **y además** no hay conexión, no hay nada. Mientras la
   * duda exista, la app intenta; si el intento falla, quien lo cuenta es el
   * contador de escrituras pendientes, que sí mide la realidad.
   */
  const online = networkState.isConnected ?? networkState.isInternetReachable ?? false;
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
      drill,
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
      kvGet<ActiveDrill>(KV.activeDrill),
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
    setActiveDrill(drill);
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

  const drill = userId ? activeDrill : null;

  // ---------------------------------------------------------------------------
  // El modo simulacro, resuelto acá y en ningún otro lado
  //
  // La tentación era meterle un `if (isDrilling)` a cada pantalla —la Home, la
  // grilla, la ficha del contacto—. Eso habría repartido la regla por seis
  // archivos y garantizado que uno se olvidara.
  //
  // En vez de eso, el simulacro se traduce a los MISMOS datos que produce un
  // sismo real: un `activeQuake` sintético y unos contactos marcados como
  // alertados por él. Así `effectiveStatus`, `membersInQuakeZone` y
  // `confirmedForQuake` funcionan sin enterarse de que hay un simulacro, y las
  // pantallas tampoco.
  //
  // ⚠️ No es inventar datos. Los participantes SÍ recibieron el aviso del
  // simulacro, y su reporte con `is_drill` SÍ es su reporte. Lo único falso es
  // el sismo, y por eso no existe fuera del teléfono: sembrar una fila en
  // `quake_events` haría que `quake_ingested_fan_out` se la mandara a gente real.
  // ---------------------------------------------------------------------------

  /**
   * Quiénes están practicando. En un simulacro individual, nadie más — y por eso
   * la grilla se ve vacía, que es la verdad: no hay nadie del otro lado.
   */
  const drillParticipantIds = useMemo(() => {
    if (!drill?.groupId) return EMPTY_IDS;
    const grupo = visibleGroups.find((g) => g.id === drill.groupId);
    return grupo ? grupo.members.map((m) => m.userId) : EMPTY_IDS;
  }, [drill, visibleGroups]);

  /**
   * El sismo que ve la app. **Un sismo real siempre gana**: si tiembla de verdad
   * durante un simulacro, lo que se pinta es el sismo. La salida del modo la
   * dispara `DrillProvider`, que también lo vigila.
   */
  const effectiveQuake = useMemo(() => {
    const real = userId ? activeQuake : null;
    if (real && isAlertActive(real)) return real;
    if (!drill) return real;

    return {
      id: drillQuakeId(drill.id),
      magnitude: 5.8,
      place: 'Simulacro',
      region: null,
      latitude: -12.05,
      longitude: -77.05,
      depthKm: 30,
      occurredAt: drill.startedAt,
      source: 'simulacro',
      intensityMmi: null,
    } satisfies QuakeEvent;
  }, [userId, activeQuake, drill]);

  /**
   * La red, con los participantes marcados como alcanzados por el sismo del
   * simulacro. Sin esta traducción, `effectiveStatus` los devolvería en `null`
   * y la grilla los pintaría apagados con «el sismo no llegó hasta donde está»,
   * que en un simulacro es exactamente al revés de lo que pasa.
   */
  const acceptedParaVista = useMemo(() => {
    if (!drill || drillParticipantIds.length === 0) return accepted;

    const quakeId = drillQuakeId(drill.id);
    const participantes = new Set(drillParticipantIds);

    return accepted.map((m) =>
      participantes.has(m.userId)
        ? {
            ...m,
            alertedQuakeIds: [...m.alertedQuakeIds, quakeId],
            // Su reporte cuenta como reporte de ESTE simulacro solo si lo hizo
            // en modo simulacro. Un «estoy bien» de ayer no confirma nada hoy.
            quakeEventId: m.isDrill ? quakeId : m.quakeEventId,
          }
        : m,
    );
  }, [accepted, drill, drillParticipantIds]);

  const value = useMemo<AppDataState>(
    () => ({
      circle: visibleCircle,
      accepted: acceptedParaVista,
      incomingRequests,
      outgoingRequests,
      groups: visibleGroups,
      myProfile: userId ? myProfile : null,
      mySettings: userId ? mySettings : null,
      myStatus: userId ? myStatus : null,
      activeQuake: effectiveQuake,
      activeDrill: drill,
      drillParticipantIds,
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
      acceptedParaVista,
      incomingRequests,
      outgoingRequests,
      visibleGroups,
      myProfile,
      mySettings,
      myStatus,
      effectiveQuake,
      drill,
      drillParticipantIds,
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
