import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CentroBloqueado } from '@/components/centro-bloqueado';
import { PremiumCta } from '@/components/premium-cta';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { createHousehold, fetchPreparedness, markGroupAsHousehold } from '@/lib/api';
import { Radius, Spacing, tabScreenBottomInset, type ModuleKey } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { Group, Preparedness } from '@/types/domain';

/**
 * Centro de Preparación: la fase que faltaba.
 *
 * La app cubría **durante** el sismo (la alerta) y **después** (estados,
 * ubicación, planes). Esto es el **antes**, y es la única superficie que se
 * cobra entera — ver `docs/MONETIZACION.md`.
 *
 * ## Tres estados, no dos
 *
 *   · sin hogar          → «arma tu hogar», o el paywall si no hay Premium
 *   · con hogar sin pagar→ se ve todo lo que ya armaron, no se puede cambiar
 *   · con hogar pagado   → el Centro entero
 *
 * El del medio existe porque la RLS separa leer de escribir a propósito:
 * esconderle a una familia su propio punto de encuentro porque venció una
 * tarjeta es indefendible en una app de seguridad.
 *
 * ## La pestaña se ve siempre
 *
 * Los tabs de `NativeTabs` son estáticos y no se pueden agregar ni quitar en
 * runtime, así que lo que se bloquea es el contenido — el mismo patrón que la
 * pestaña Global de Sismos (`news.tsx`). Y es lo correcto igual: una función que
 * no se ve no la compra nadie (`MONETIZACION` §3.2.1).
 */
export default function PreparacionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, modules: pastel } = useTheme();
  const { groups, mySettings, refresh } = useAppData();

  const [datos, setDatos] = useState<Preparedness | null>(null);
  const [cargando, setCargando] = useState(true);
  const [trabajando, setTrabajando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await fetchPreparedness());
    } catch (caught) {
      if (__DEV__) console.warn('[preparación] no se pudo leer el progreso', caught);
    } finally {
      setCargando(false);
    }
  }, []);

  // Al volver de un módulo el progreso cambió, así que se relee al enfocar y no
  // solo al montar.
  useFocusEffect(
    useCallback(() => {
      void cargar();
    }, [cargar]),
  );

  const soyPremium = mySettings?.isPremium ?? false;

  /**
   * TODOS los grupos propios que podrían ser el hogar, no el primero que
   * aparezca.
   *
   * 🔴 La primera versión hacía `groups.find(...)` y ofrecía uno solo. A quien
   * tenía «Amigos Test 2» antes que «Casa» le proponía convertir el grupo
   * equivocado y ni siquiera le mostraba el correcto — un error irreversible en
   * un toque, porque el hogar es único por persona.
   */
  const candidatos = groups.filter((g) => g.isOwner && !g.isHousehold);

  const armarHogar = useCallback(
    async (desdeGrupo: string | null) => {
      setTrabajando(true);
      try {
        if (desdeGrupo) await markGroupAsHousehold(desdeGrupo);
        else await createHousehold('Mi casa');
        await refresh();
        await cargar();
      } catch (caught) {
        if (__DEV__) console.warn('[preparación] no se pudo armar el hogar', caught);
      } finally {
        setTrabajando(false);
      }
    },
    [cargar, refresh],
  );

  // Hogar armado y sin pagar: la silueta bajo el velo, no el Centro en solo
  // lectura. Va como salida temprana —después de todos los hooks— porque no
  // comparte nada con la pantalla normal: ni scroll, ni cabecera, ni tarjetas.
  if (!cargando && datos && !datos.premium) {
    return (
      <Screen>
        <CentroBloqueado />
      </Screen>
    );
  }

  const modulos: Modulo[] = datos
    ? [
        {
          key: 'hogar',
          icon: 'home',
          title: datos.householdName,
          detail:
            datos.members === 1
              ? 'Suma a quienes viven contigo'
              : `${datos.members} personas`,
          pct: null,
          // El hogar es un grupo: se gestiona en la pantalla que ya existe.
          href: `/group/${datos.householdId}` as Href,
        },
        {
          key: 'mochila',
          icon: 'backpack',
          title: 'Mochila',
          detail:
            datos.modules.kit.total === 0
              ? 'Sin armar todavía'
              : `${datos.modules.kit.done} de ${datos.modules.kit.total} cosas`,
          pct: datos.modules.kit.pct,
          href: '/preparacion/mochila' as Href,
        },
        {
          key: 'plan',
          icon: 'place',
          title: 'Punto de encuentro',
          detail: datos.modules.plan.pct === 100 ? 'Escrito y compartido' : 'Falta decir dónde',
          pct: datos.modules.plan.pct,
          href: '/preparacion/plan' as Href,
        },
        {
          key: 'roles',
          icon: 'assignment-ind',
          title: 'Quién hace qué',
          detail: `${datos.modules.roles.done} de ${datos.modules.roles.total} con tarea`,
          pct: datos.modules.roles.pct,
          href: '/preparacion/roles' as Href,
        },
        {
          key: 'curso',
          icon: 'menu-book',
          title: 'Qué hacer',
          detail: `${datos.modules.course.done} de ${datos.modules.course.total} terminaron`,
          pct: datos.modules.course.pct,
          href: '/preparacion/curso' as Href,
        },
        {
          key: 'simulacro',
          icon: 'notifications-active',
          title: 'Simulacro',
          detail: datos.modules.drill.pct === 100 ? 'Practicado hace poco' : 'Sin practicar',
          pct: datos.modules.drill.pct,
          href: '/drill' as Href,
        },
      ]
    : [];

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            // Más aire que en las otras pestañas a propósito: acá el título es
            // el nombre de una sección entera, no el rótulo de una lista, y
            // debajo lleva una bajada de dos renglones.
            paddingTop: insets.top + Spacing.xl,
            paddingBottom: tabScreenBottomInset(insets.bottom) + Spacing.xl,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => void cargar()} tintColor={colors.accent} />
        }>
        <Text variant="title">Centro de Preparación</Text>
        <Text variant="subhead" tone="secondary">
          Prepárate antes de que ocurra una emergencia. Coordina con las personas de tu hogar para
          que todos sepan qué hacer, qué llevar y a dónde ir.
        </Text>

        {cargando ? null : datos ? (
          <>
            <Card>
              <View style={styles.barraFila}>
                <Text variant="footnote" tone="secondary">
                  {datos.members === 1 ? 'Tu preparación' : 'Tu hogar'}
                </Text>
                <Text variant="title3">{datos.total}%</Text>
              </View>
              <ProgressBar value={datos.total} label="Progreso de tu hogar" />
              <Text variant="footnote" tone="secondary" style={styles.pie}>
                {datos.members === 1
                  ? `Estás preparado en un ${datos.total}%.`
                  : `Tu hogar está preparado en un ${datos.total}%.`}
              </Text>
            </Card>

            {/* Seis tarjetas de color, en dos columnas.
                El color no es adorno: hace que la tarjeta se reconozca antes de
                leerla, y esta es la pantalla que queremos que alguien abra un
                domingo sin ninguna urgencia. Ver `ModuleColors` en tokens. */}
            <View style={styles.rejilla}>
              {modulos.map((m) => (
                <TarjetaModulo
                  key={m.key}
                  modulo={m}
                  paleta={pastel[m.key]}
                  onPress={() => router.push(m.href)}
                />
              ))}
            </View>
          </>
        ) : soyPremium ? (
          <ArmarHogar
            candidatos={candidatos}
            trabajando={trabajando}
            onArmar={(id) => void armarHogar(id)}
          />
        ) : (
          <Bloqueado />
        )}
      </ScrollView>
    </Screen>
  );
}

type Modulo = {
  key: ModuleKey;
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  detail: string;
  /** `null` en el hogar, que no es una tarea que se complete. */
  pct: number | null;
  href: Href;
};

/**
 * Una tarjeta de módulo.
 *
 * El pozo del ícono y la pista de la barra se pintan con el MISMO `ink` de la
 * tarjeta a baja opacidad (`22` y `26` en hexa) en vez de con un gris del tema:
 * un gris fijo se ve sucio sobre seis fondos distintos, y en modo oscuro
 * desaparece. Así cada tarjeta es un solo color en tres intensidades.
 */
function TarjetaModulo({
  modulo,
  paleta,
  onPress,
}: {
  modulo: Modulo;
  paleta: { bg: string; ink: string };
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${modulo.title}. ${modulo.detail}${
        modulo.pct === null ? '' : `. ${modulo.pct} por ciento`
      }`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tarjeta,
        { backgroundColor: paleta.bg },
        pressed ? styles.presionada : null,
      ]}>
      <View style={styles.tarjetaTope}>
        <View style={[styles.pozo, { backgroundColor: `${paleta.ink}22` }]}>
          <MaterialIcons name={modulo.icon} size={20} color={paleta.ink} />
        </View>
        {modulo.pct === null ? (
          <MaterialIcons name="chevron-right" size={20} color={`${paleta.ink}99`} />
        ) : (
          <Text variant="footnote" weight="700" style={{ color: paleta.ink }}>
            {modulo.pct}%
          </Text>
        )}
      </View>

      <View style={styles.tarjetaTexto}>
        <Text variant="callout" weight="600" numberOfLines={2} style={{ color: paleta.ink }}>
          {modulo.title}
        </Text>
        <Text variant="caption" numberOfLines={2} style={{ color: `${paleta.ink}B3` }}>
          {modulo.detail}
        </Text>
      </View>

      {modulo.pct === null ? null : (
        <ProgressBar
          value={modulo.pct}
          height={5}
          color={paleta.ink}
          trackColor={`${paleta.ink}26`}
        />
      )}
    </Pressable>
  );
}

/**
 * Ya paga, todavía no tiene casa.
 *
 * Se listan **todos** los grupos propios, no una sugerencia: quien ya tenía su
 * «Casa» armada desde antes no debería terminar con dos listas de la misma
 * gente, y quien tiene tres grupos tiene que poder decir cuál es su casa. La
 * elección es irreversible en la práctica —una persona pertenece a un solo
 * hogar— así que se pide explícita.
 */
function ArmarHogar({
  candidatos,
  trabajando,
  onArmar,
}: {
  candidatos: Group[];
  trabajando: boolean;
  onArmar: (desdeGrupo: string | null) => void;
}) {
  const { colors } = useTheme();
  const [elegido, setElegido] = useState<string | null>(null);

  return (
    <Card>
      <Text variant="headline">Arma tu hogar</Text>
      <Text variant="footnote" tone="secondary" style={styles.pie}>
        El Centro es de la casa, no de una persona: una sola mochila, un solo punto de encuentro y
        las tareas repartidas. Se empieza por decir con quién vives.
      </Text>

      {candidatos.length > 0 ? (
        <>
          <Text variant="footnote" tone="secondary" weight="600" style={styles.rotulo}>
            USA UN GRUPO QUE YA TIENES
          </Text>

          <View style={[styles.lista, { borderColor: colors.border }]}>
            {candidatos.map((g, i) => {
              const seleccionado = elegido === g.id;
              return (
                <Pressable
                  key={g.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: seleccionado }}
                  accessibilityLabel={`${g.name}, ${g.members.length} personas`}
                  onPress={() => setElegido(seleccionado ? null : g.id)}
                  style={({ pressed }) => [
                    styles.opcion,
                    i > 0
                      ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                      : null,
                    pressed ? styles.presionada : null,
                  ]}>
                  <MaterialIcons
                    name={seleccionado ? 'radio-button-checked' : 'radio-button-unchecked'}
                    size={22}
                    color={seleccionado ? colors.accent : colors.textTertiary}
                  />
                  <View style={styles.flex}>
                    <Text variant="callout" numberOfLines={1}>
                      {g.name}
                    </Text>
                    <Text variant="caption" tone="tertiary">
                      {g.members.length === 1
                        ? 'Solo tú'
                        : `${g.members.length} personas, contándote`}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Button
            title={elegido ? 'Usar este grupo como mi hogar' : 'Elige un grupo'}
            disabled={!elegido}
            loading={trabajando}
            onPress={() => onArmar(elegido)}
            style={styles.boton}
          />
          <Button title="Mejor crear uno nuevo" variant="ghost" onPress={() => onArmar(null)} />
        </>
      ) : (
        <Button
          title="Crear mi hogar"
          icon="home"
          loading={trabajando}
          onPress={() => onArmar(null)}
          style={styles.boton}
        />
      )}
    </Card>
  );
}

/** Sin Premium y sin hogar: el candado, con la promesa a la vista. */
function Bloqueado() {
  const { colors } = useTheme();
  return (
    <Card>
      <View style={[styles.insignia, { backgroundColor: colors.accentSoft }]}>
        <MaterialIcons name="backpack" size={22} color={colors.accent} />
      </View>
      <Text variant="headline">Prepara a tu casa entera</Text>
      <Text variant="footnote" tone="secondary" style={styles.pie}>
        Una mochila que todos llenan, un punto de encuentro que todos ven, las tareas repartidas y
        un simulacro juntos. Pagas tú y entra tu casa completa, sin límite de personas.
      </Text>
      <PremiumCta />
    </Card>
  );
}

const styles = StyleSheet.create({
  avisoFila: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  barraFila: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  boton: { marginBottom: Spacing.sm },
  content: { gap: Spacing.md, paddingHorizontal: Spacing.lg },
  flex: { flex: 1 },
  insignia: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 44,
    justifyContent: 'center',
    marginBottom: Spacing.md,
    width: 44,
  },
  lista: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  opcion: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    padding: Spacing.md,
  },
  pie: { marginTop: Spacing.xs },
  pozo: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  presionada: { opacity: 0.6 },
  rejilla: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  rotulo: { marginBottom: Spacing.sm, marginTop: Spacing.lg },
  tarjeta: {
    borderRadius: Radius.xl,
    gap: Spacing.md,
    minHeight: 148,
    padding: Spacing.lg,
    // `48%` y no `50%` porque el `gap` de la rejilla ocupa el resto. Con dos
    // columnas exactas la segunda tarjeta se cae a la fila siguiente.
    width: '48%',
  },
  tarjetaTexto: { flex: 1, gap: 2 },
  tarjetaTope: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
