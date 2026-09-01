import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { LocationMap } from '@/components/location-map';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { formatAccuracy, timeAgo } from '@/lib/format';
import { captureLocationOnce, getPermissionLevel } from '@/lib/location';
import { reportMyStatus } from '@/lib/sync';
import { Spacing, type StatusKey } from '@/theme/tokens';
import type { MyStatus } from '@/types/domain';

/**
 * Dónde estoy, y el botón para corregirlo — solo durante una alerta activa.
 *
 * **Por qué existe.** La app captura la posición una sola vez al dispararse la
 * alerta (§1.2, `captureLocationForActiveAlert`). Eso resuelve "dónde estaba
 * cuando ocurrió", pero un sismo no termina en el instante del sismo: la persona
 * evacúa, se mueve al punto de encuentro, sale a buscar a alguien. Sin esto, su
 * círculo se queda mirando durante horas una posición que dejó de ser cierta a
 * los diez minutos, sin ninguna forma de saber que quedó vieja.
 *
 * **No es tracking, y la diferencia es la que sostiene toda la promesa del
 * producto.** La actualización la dispara la persona tocando un botón, nunca la
 * app sola: acá no hay `startLocationUpdatesAsync()` ni nada que corra en
 * segundo plano. Sigue valiendo la regla de oro de §1.2 —una sola captura
 * automática, y solo cuando ocurre un sismo—; esto agrega capturas **manuales**
 * mientras la alerta está activa, que es justo cuando compartir dónde estás es
 * el propósito de la app.
 *
 * **Solo en modo alerta**, por lo mismo: fuera de una alerta no hay nada que
 * avisar y un botón para refrescar la posición sería exactamente el tracking que
 * la app promete no hacer. La Home solo lo monta dentro de la rama de alerta.
 */
export function MyLocationCard({
  myStatus,
  activeQuakeId,
  effectiveStatus,
  isDrill,
  onUpdated,
}: {
  myStatus: MyStatus | null;
  activeQuakeId: string;
  /**
   * El estado ya resuelto contra el sismo activo. Se recibe en vez de leerlo de
   * `myStatus.status` porque ese campo puede venir de un sismo anterior: si
   * alguien reportó "estoy bien" en el sismo de la semana pasada y hoy solo
   * actualiza su ubicación, copiar ese estado lo daría por confirmado en un
   * evento en el que todavía no dijo nada.
   */
  effectiveStatus: StatusKey | null;
  isDrill: boolean;
  onUpdated: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [updating, setUpdating] = useState(false);

  const hasLocation = myStatus?.latitude != null && myStatus?.longitude != null;

  const update = async () => {
    setUpdating(true);
    try {
      const fix = await captureLocationOnce();

      if (!fix) {
        // Un `null` tiene dos causas muy distintas y el consejo cambia según
        // cuál sea, así que recién acá —y solo al fallar— se mira el permiso.
        const level = await getPermissionLevel();
        if (level === 'none') {
          Alert.alert(
            'Necesitamos tu permiso de ubicación',
            'Sin él no podemos decirle a tu red dónde estás. Se activa desde Ajustes.',
            [
              { text: 'Ahora no', style: 'cancel' },
              { text: 'Ir a Ajustes', onPress: () => router.push('/settings') },
            ],
          );
        } else {
          Alert.alert(
            'No pudimos tomar tu ubicación',
            'El GPS no respondió a tiempo. Si estás bajo techo, acércate a una ventana e intenta de nuevo.',
          );
        }
        return;
      }

      await reportMyStatus({
        status: effectiveStatus ?? 'unconfirmed',
        message: myStatus?.message ?? null,
        location: fix,
        quakeEventId: activeQuakeId,
        isDrill,
      });

      await onUpdated();
    } catch {
      // Este `catch` faltaba, igual que en el reporte de estado de la Home. Sin
      // él, un fallo del GPS o del permiso escapaba como promesa no capturada:
      // el botón dejaba de girar y no pasaba nada más, que se lee como «ya se
      // actualizó». Los casos esperables de "no hubo ubicación" ya se avisan
      // arriba con su propio texto; esto cubre lo que revienta antes de llegar.
      Alert.alert(
        'No pudimos actualizar tu ubicación',
        'Intenta de nuevo en un momento. Tu estado reportado no cambió.',
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Card>
      <Text variant="headline">Mi ubicación</Text>
      <Text variant="footnote" tone="secondary" style={styles.subline}>
        {hasLocation
          ? `Registrada ${timeAgo(myStatus?.locationAt)} ${formatAccuracy(myStatus?.locationAccuracyM ?? null)}`.trim()
          : 'Tu red todavía no sabe dónde estás'}
      </Text>

      {hasLocation ? (
        <View style={styles.mapa}>
          <LocationMap
            latitude={myStatus!.latitude!}
            longitude={myStatus!.longitude!}
            spanKm={3}
            label="Mi ubicación"
            height={150}
          />
        </View>
      ) : null}

      <View style={styles.accion}>
        <Button
          title={hasLocation ? 'Actualizar mi ubicación' : 'Compartir mi ubicación'}
          icon="my-location"
          variant={hasLocation ? 'secondary' : 'primary'}
          loading={updating}
          onPress={() => void update()}
        />
      </View>

      {hasLocation ? (
        <Text variant="caption" tone="tertiary" style={styles.nota}>
          Si te moviste, tócalo para que tu red vea dónde estás ahora. Tu estado no
          cambia.
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  subline: { marginTop: 2 },
  mapa: { marginTop: Spacing.lg },
  accion: { marginTop: Spacing.lg },
  nota: { marginTop: Spacing.sm },
});
