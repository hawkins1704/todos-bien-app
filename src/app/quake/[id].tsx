import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationMap } from '@/components/location-map';
import { QuakeCard, magnitudeSeverity } from '@/components/quake-card';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Screen } from '@/components/ui/screen';
import { Text } from '@/components/ui/text';
import { fetchQuakeById } from '@/lib/api';
import { formatCoords, timeAgo } from '@/lib/format';
import { mapsUrl } from '@/lib/location';
import { Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';
import type { QuakeEvent } from '@/types/domain';

/**
 * Detalle de un sismo de Noticias Sísmicas.
 *
 * La cabecera es el MISMO `QuakeCard` que usa el banner de alerta de la Home,
 * en tono neutral: un sismo se lee igual en toda la app. El tono neutral existe
 * justamente para no pintar de rojo un evento de hace cinco días, que parecería
 * una alerta activa.
 */
export default function QuakeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { colors, status } = useTheme();

  const [quake, setQuake] = useState<QuakeEvent | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;

    void fetchQuakeById(id)
      .then((resultado) => {
        if (!cancelado) setQuake(resultado);
      })
      .catch(() => null)
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => {
      cancelado = true;
    };
  }, [id]);

  if (loading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.centro}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </Screen>
    );
  }

  if (!quake) {
    return (
      <Screen>
        <Stack.Screen options={{ title: '' }} />
        <View style={styles.centro}>
          <Text variant="callout" tone="secondary" center>
            No encontramos este sismo.
          </Text>
        </View>
      </Screen>
    );
  }

  const fecha = new Date(quake.occurredAt);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Detalle del sismo' }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.xl }]}>
        <QuakeCard quake={quake} tone="neutral" />

        {/*
          El encuadre es muy amplio a propósito: un epicentro sirve para saber a
          qué distancia de uno ocurrió, así que necesita entrar la costa y las
          ciudades de referencia. 300 km cubre de sobra el radio de alerta.
          El color del pin es el mismo de la magnitud en la tarjeta de arriba,
          para que el mapa no introduzca una escala de color nueva.
        */}
        <LocationMap
          latitude={quake.latitude}
          longitude={quake.longitude}
          spanKm={300}
          pinColor={status[magnitudeSeverity(quake.magnitude)].base}
          label={`Epicentro · ${quake.place ?? formatCoords(quake.latitude, quake.longitude)}`}
        />

        <Card padded={false}>
          <Dato etiqueta="Epicentro" valor={quake.place ?? 'No especificado'} />
          <Dato
            etiqueta="Coordenadas"
            valor={formatCoords(quake.latitude, quake.longitude)}
            separador
          />
          <Dato
            etiqueta="Profundidad"
            valor={quake.depthKm != null ? `${Math.round(quake.depthKm)} km` : 'No reportada'}
            separador
          />
          <Dato
            etiqueta="Hora local"
            valor={fecha.toLocaleString('es-PE', {
              dateStyle: 'long',
              timeStyle: 'short',
            })}
            separador
          />
          <Dato etiqueta="Hace" valor={timeAgo(quake.occurredAt)} separador />
          {quake.region ? <Dato etiqueta="Región" valor={quake.region} separador /> : null}
          {quake.intensityMmi ? (
            <Dato
              etiqueta="Intensidad"
              valor={`${quake.intensityMmi} en escala de Mercalli`}
              separador
            />
          ) : null}
          <Dato
            etiqueta="Fuente"
            valor={quake.source === 'igp' ? 'Instituto Geofísico del Perú' : 'USGS'}
            separador
          />
        </Card>

        <Button
          title="Ver el epicentro en el mapa"
          icon="map"
          variant="secondary"
          onPress={() =>
            void Linking.openURL(
              mapsUrl(
                quake.latitude,
                quake.longitude,
                `Epicentro · ${quake.place ?? formatCoords(quake.latitude, quake.longitude)}`,
              ),
            )
          }
        />

        <View style={styles.nota}>
          <MaterialIcons name="info-outline" size={15} color={colors.textTertiary} />
          <Text variant="caption" tone="tertiary" style={styles.flex}>
            La magnitud mide la energía liberada en el epicentro. La intensidad de Mercalli
            mide cuánto se sintió en un lugar concreto, así que un sismo lejano y profundo
            puede tener magnitud alta y sentirse poco.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Dato({
  etiqueta,
  valor,
  separador = false,
}: {
  etiqueta: string;
  valor: string;
  separador?: boolean;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.dato,
        separador
          ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
          : null,
      ]}>
      <Text variant="footnote" tone="secondary">
        {etiqueta}
      </Text>
      <Text variant="callout" style={styles.datoValor}>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: Spacing.lg, paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  centro: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  flex: { flex: 1 },
  dato: { gap: 2, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md },
  datoValor: { flexShrink: 1 },
  nota: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xs },
});
