import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MagnitudeLegend } from '@/components/magnitude-legend';
import { PremiumCta } from '@/components/premium-cta';
import { QuakeRow } from '@/components/quake-row';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { usePullToRefresh } from '@/hooks/use-pull-to-refresh';
import { fetchQuakeFeed, PremiumRequiredError, type QuakeFeedScope } from '@/lib/api';
import { Radius, Spacing, TabBarExtraInset } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { QuakeEvent } from '@/types/domain';

/**
 * Cuánto tiempo se considera fresca una lista ya traída.
 *
 * No es un número elegido a ojo: **la ingesta corre cada 2 minutos**
 * (`pg_cron` → `ingest-quakes`, migración 0007). Pedir el feed más seguido que
 * eso no puede traer nada que no esté ya en pantalla; es un viaje garantizado a
 * cambio de nada.
 */
const FEED_FRESH_MS = 2 * 60 * 1000;

type Feed = {
  quakes: QuakeEvent[];
  /** El servidor cortó por falta de premium (o se cortó antes de pedirlo). */
  locked: boolean;
  fetchedAt: number;
};

/**
 * Noticias Sísmicas: pantalla puramente informativa, separada del flujo de
 * alertas.
 *
 * No dispara nada ni pide confirmar estado — para eso está la Home. Acá el
 * usuario explora sismos por su cuenta.
 *
 * **Cuándo se pide el feed (revisado el 2026-08-20).** Antes se pedía en cada
 * foco de la pestaña, así que cambiar de tab y volver recargaba entero y dejaba
 * la pantalla en blanco con un spinner. Y cambiar Nacional/Global pedía **dos
 * veces**: una desde el handler y otra porque al cambiar `scope` cambiaba la
 * identidad del callback de `useFocusEffect`, que volvía a dispararlo.
 *
 * Ahora los mismos disparadores siguen ahí —foco, volver del segundo plano— pero
 * pasan por un chequeo de frescura contra `FEED_FRESH_MS`, y cada scope guarda
 * lo suyo. Volver a una lista traída hace 20 segundos no pide nada y se ve al
 * instante. El pull-to-refresh **siempre** fuerza: si la persona lo pide a mano,
 * no se le contesta con una caché.
 *
 * No hay temporizador que recargue solo mientras la pantalla está abierta. Esta
 * pestaña no es el canal de alertas —eso es la Home, y a futuro el push (§3)— y
 * un sismo tarda 4 a 6 minutos en publicarse de todos modos (§1.11): quien esté
 * esperando uno recién ocurrido va a tirar de la lista.
 */
export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors } = useTheme();
  const { mySettings } = useAppData();

  const [scope, setScope] = useState<QuakeFeedScope>('nacional');
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * Lo traído de cada scope. Va en un ref y no en estado a propósito: si `load`
   * dependiera de un estado que él mismo escribe, cambiaría de identidad en cada
   * fetch y volvería a disparar el efecto de foco. Ese es exactamente el ciclo
   * que causaba las recargas de más.
   */
  const cache = useRef(new Map<QuakeFeedScope, Feed>());

  /** El scope vigente, legible desde callbacks sin volverlos a crear. */
  const scopeRef = useRef<QuakeFeedScope>('nacional');

  const isPremium = mySettings?.isPremium ?? false;

  // En iOS `insets.bottom` ya incluye la tab bar glass; en Android hay que
  // sumarle la barra de Material (ver TabBarExtraInset).
  const fondo = insets.bottom + TabBarExtraInset;

  const load = useCallback(
    async (target: QuakeFeedScope, { force = false }: { force?: boolean } = {}) => {
      const guardado = cache.current.get(target);
      const esElVisible = () => scopeRef.current === target;

      if (!force && guardado && Date.now() - guardado.fetchedAt < FEED_FRESH_MS) return;

      if (esElVisible()) setError(null);

      const guardar = (nuevo: Feed) => {
        cache.current.set(target, nuevo);
        if (esElVisible()) setFeed(nuevo);
      };

      // Sin premium ni siquiera se pide el feed global: el servidor lo
      // rechazaría igual, y así se evita el viaje.
      if (target === 'global' && !isPremium) {
        guardar({ quakes: [], locked: true, fetchedAt: Date.now() });
        return;
      }

      try {
        guardar({ quakes: await fetchQuakeFeed(target), locked: false, fetchedAt: Date.now() });
      } catch (caught) {
        if (caught instanceof PremiumRequiredError) {
          guardar({ quakes: [], locked: true, fetchedAt: Date.now() });
        } else if (esElVisible()) {
          // El error se muestra igual cuando ya hay lista: un refresco que
          // falla en silencio deja creyendo que los datos están al día.
          setError('No pudimos cargar los sismos. Revisa tu conexión.');
        }
      }
    },
    [isPremium],
  );

  /**
   * El spinner de tirar-para-refrescar lo maneja el hook, no `load`: así los
   * refrescos automáticos (foco, volver del segundo plano) revalidan en
   * silencio. Prenderlo por código dejaba el spinner trabado — ver
   * `usePullToRefresh`.
   *
   * Fuerza siempre: si la persona tira de la lista a mano, no se le contesta con
   * una caché por más fresca que esté. Lee `scopeRef` en vez de `scope` para no
   * cambiar de identidad al cambiar de pestaña.
   */
  const { refreshing, onRefresh } = usePullToRefresh(
    useCallback(() => load(scopeRef.current, { force: true }), [load]),
  );

  /**
   * Al pasar a premium, lo guardado del feed global es una vista bloqueada que
   * ya no corresponde. Se descarta para que la próxima visita lo pida de verdad.
   */
  useEffect(() => {
    if (!isPremium) return;
    if (cache.current.get('global')?.locked) cache.current.delete('global');
  }, [isPremium]);

  // `scopeRef` en vez de `scope`: si el callback cambiara al cambiar de scope,
  // `useFocusEffect` lo volvería a ejecutar y se pediría dos veces.
  useFocusEffect(
    useCallback(() => {
      void load(scopeRef.current);
    }, [load]),
  );

  /**
   * Volver del segundo plano.
   *
   * `useFocusEffect` NO alcanza: solo dispara al enfocar la pantalla por
   * navegación. Si la app se manda a segundo plano con esta pestaña ya abierta
   * y se vuelve horas después, el foco nunca cambia y la lista queda congelada.
   * Pasó de verdad: un M4,8 en Lurín estaba en el IGP y en nuestra base a los 6
   * minutos, y la app seguía mostrando la lista vieja sin forma de forzarla,
   * porque tampoco había pull-to-refresh.
   *
   * No fuerza: pasa por el chequeo de frescura. Volver a la app diez segundos
   * después no puede traer nada nuevo; volver una hora después, sí.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(scopeRef.current);
    });
    return () => subscription.remove();
  }, [load]);

  const cambiarScope = (target: QuakeFeedScope) => {
    if (target === scope) return;
    scopeRef.current = target;
    setScope(target);
    setError(null);
    // Lo ya visto se pinta al instante; `load` decide si además hace falta pedir.
    setFeed(cache.current.get(target) ?? null);
    void load(target);
  };

  const quakes = feed?.quakes ?? [];
  const bloqueado = feed?.locked ?? false;
  const loading = !feed && !error;

  // El spinner no necesita `progressViewOffset`: a diferencia de la Home, acá la
  // lista arranca debajo del encabezado, que ya reservó el safe area de arriba.
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={colors.textSecondary}
    />
  );

  return (
    <Screen>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Text variant="title2">Noticias sísmicas</Text>

        {/* La pestaña Global se muestra SIEMPRE, aunque no sea premium: se
            bloquea el contenido, nunca se esconde la opción. */}
        <View style={[styles.segmented, { backgroundColor: colors.surfaceSunken }]}>
          {(
            [
              { key: 'nacional' as const, label: 'Nacional' },
              { key: 'global' as const, label: 'Global' },
            ]
          ).map((opcion) => {
            const activo = scope === opcion.key;
            const conCandado = opcion.key === 'global' && !isPremium;

            return (
              <Pressable
                key={opcion.key}
                onPress={() => cambiarScope(opcion.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: activo }}
                accessibilityLabel={
                  conCandado ? `${opcion.label}, requiere Premium` : opcion.label
                }
                style={[
                  styles.segment,
                  activo
                    ? { backgroundColor: colors.surface, borderColor: colors.border }
                    : null,
                ]}>
                <View style={styles.segmentInner}>
                  <Text variant="subhead" weight={activo ? '600' : '400'}>
                    {opcion.label}
                  </Text>
                  {conCandado ? (
                    <MaterialIcons name="lock" size={13} color={colors.textTertiary} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Text variant="caption" tone="tertiary">
          {scope === 'nacional'
            ? 'Sismos en Perú de los últimos 7 días · fuente IGP'
            : 'Sismos en el mundo de los últimos 7 días, magnitud 4,5 o más · fuente USGS'}
        </Text>

        {/* La leyenda se calla en la vista bloqueada: ahí las filas son muestras
            inventadas y explicar su color sería darles una credibilidad que no
            tienen. */}
        {!bloqueado ? <MagnitudeLegend /> : null}

        {/* Con lista en pantalla, un refresco que falla se avisa acá y la lista
            se queda: borrar datos buenos por un fallo de red es peor que
            mostrarlos un poco viejos. */}
        {error && feed ? (
          <Text variant="caption" tone="danger">
            {error} Mostrando la última lista que pudimos traer.
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={[styles.centro, { paddingBottom: fondo }]}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : bloqueado ? (
        <ListaBloqueada />
      ) : !feed ? (
        // Scrolleable a propósito, aunque no haya nada que scrollear: es el
        // único modo de reintentar. Un error sin salida obliga a cambiar de
        // pestaña y volver para que se dispare el foco.
        <ScrollView
          contentContainerStyle={[styles.centroScroll, { paddingBottom: fondo }]}
          refreshControl={refreshControl}>
          <Text variant="callout" tone="secondary" center>
            {error}
          </Text>
          <Text variant="caption" tone="tertiary" center>
            Desliza hacia abajo para reintentar
          </Text>
        </ScrollView>
      ) : quakes.length === 0 ? (
        <ScrollView
          contentContainerStyle={[styles.centroScroll, { paddingBottom: fondo }]}
          refreshControl={refreshControl}>
          <MaterialIcons name="sentiment-satisfied" size={32} color={colors.textTertiary} />
          <Text variant="callout" tone="secondary" center>
            Sin sismos registrados en los últimos 7 días
          </Text>
        </ScrollView>
      ) : (
        <FlatList
          data={quakes}
          keyExtractor={(item) => item.id}
          refreshControl={refreshControl}
          contentContainerStyle={[styles.lista, { paddingBottom: fondo + Spacing.xl }]}
          ItemSeparatorComponent={() => (
            <View style={[styles.separador, { backgroundColor: colors.border }]} />
          )}
          renderItem={({ item }) => (
            <QuakeRow
              quake={item}
              // Solo en Global: en Nacional todos son de Perú y repetirlo en
              // cada fila ocuparía la línea sin decir nada.
              showRegion={scope === 'global'}
              onPress={() => router.push(`/quake/${item.id}`)}
            />
          )}
          ListHeaderComponent={
            <Text variant="caption" tone="tertiary" style={styles.contador}>
              {quakes.length} {quakes.length === 1 ? 'sismo' : 'sismos'}
            </Text>
          }
        />
      )}
    </Screen>
  );
}

/**
 * Vista previa bloqueada (spec de la funcionalidad): en vez de esconder la
 * pestaña, se muestra la lista ofuscada con candado y desde acá se ofrece
 * Premium.
 *
 * El botón sale de `PremiumCta`, que abre el paywall de RevenueCat con los
 * beneficios y los precios que vienen de la tienda (ver ese archivo).
 */
function ListaBloqueada() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Muestras inventadas solo para dar forma a la vista previa. No son datos
  // reales: el servidor no los entrega sin premium, y no queremos que lo
  // parezcan.
  // 3 filas y no más: la tarjeta de venta tiene que entrar entera sin scrollear.
  const muestras: QuakeEvent[] = Array.from({ length: 3 }, (_, i) => ({
    id: `bloqueado-${i}`,
    source: 'usgs',
    magnitude: [6.1, 5.2, 4.8][i],
    depthKm: null,
    latitude: 0,
    longitude: 0,
    place: null,
    region: null,
    intensityMmi: null,
    occurredAt: new Date().toISOString(),
  }));

  return (
    // Scrollea a propósito: la tarjeta de venta crece con el aviso de que las
    // suscripciones no están habilitadas, y en pantallas chicas o con el texto
    // del sistema agrandado no entraba entera.
    <ScrollView
      contentContainerStyle={[
        styles.bloqueado,
        { paddingBottom: insets.bottom + TabBarExtraInset + Spacing.lg },
      ]}>
      <View style={styles.muestras} pointerEvents="none">
        {muestras.map((quake, index) => (
          <View key={quake.id} style={{ opacity: 0.55 - index * 0.07 }}>
            {/* `showRegion` para que la vista previa tenga el mismo alto que la
                lista real: si no, al pagar las filas crecerían de golpe. */}
            <QuakeRow quake={quake} blurred showRegion />
          </View>
        ))}
      </View>

      <View style={styles.paywall}>
        <Card>
          <View style={[styles.candado, { backgroundColor: colors.accentSoft }]}>
            <MaterialIcons name="public" size={26} color={colors.accent} />
          </View>

          <Text variant="title3" center style={styles.paywallTitulo}>
            Sismos de todo el mundo
          </Text>
          <Text variant="subhead" tone="secondary" center style={styles.paywallTexto}>
            Sigue los sismos de cualquier parte del planeta y recibe avisos cuando ocurran,
            no solo los de tu zona.
          </Text>

          <PremiumCta />
        </Card>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.sm, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  segmented: {
    borderRadius: Radius.md,
    flexDirection: 'row',
    gap: 2,
    marginTop: Spacing.xs,
    padding: 3,
  },
  segment: {
    borderColor: 'transparent',
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    paddingVertical: Spacing.sm,
  },
  segmentInner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    justifyContent: 'center',
  },
  centro: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  // Igual que `centro`, pero para contentContainerStyle: ahí `flex: 1` fija la
  // altura al viewport y mata el gesto de arrastre del pull-to-refresh.
  centroScroll: {
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.sm,
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
  },
  lista: { paddingTop: Spacing.xs },
  separador: { height: StyleSheet.hairlineWidth, marginLeft: 76 },
  contador: { paddingBottom: Spacing.sm, paddingHorizontal: Spacing.lg },
  bloqueado: { flexGrow: 1 },
  muestras: { paddingTop: Spacing.xs },
  paywall: { marginTop: -Spacing.xxl, paddingHorizontal: Spacing.lg },
  candado: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: Radius.pill,
    height: 56,
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: 56,
  },
  paywallTitulo: { marginBottom: Spacing.xs },
  paywallTexto: { marginBottom: Spacing.lg },
  pressed: { opacity: 0.85 },
});
