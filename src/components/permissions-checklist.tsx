import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { useAppData } from '@/context/app-data';
import { useAuth } from '@/context/auth';
import {
  usePermissions,
  type PermissionGrade,
  type PermissionKey,
  type PermissionsState,
} from '@/hooks/use-permissions';
import { syncLocationPermission } from '@/lib/alert-response';
import { requestContactsPermission } from '@/lib/contacts';
import { requestBackgroundPermission, requestForegroundPermission } from '@/lib/location';
import { requestNotificationPermission, syncPushToken } from '@/lib/notifications';
import { Radius, Spacing } from '@/theme/tokens';
import { useTheme } from '@/theme/use-theme';

/**
 * Los permisos como lista de tareas, no como tres tarjetas sueltas.
 *
 * Misma forma que el checklist de preparación de la Home a propósito: la
 * pregunta que resuelve es la misma —«¿qué me falta?»— y responderla dos veces
 * con dos diseños distintos obliga a aprender dos cosas.
 *
 * **Por qué importa tenerlo.** Antes el permiso solo se pedía en el onboarding,
 * así que un toque apurado en «No permitir» dejaba a la persona sin alertas
 * **para siempre**, sin ninguna pista dentro de la app. Y no era teórico: de las
 * tres cuentas del proyecto, solo una tenía token de push registrado.
 *
 * ## Tres grados, no dos
 *
 * La ubicación tiene un estado intermedio real —«solo con la app abierta»— que
 * no es lo mismo que nada pero tampoco alcanza. Pintarlo verde mentiría y
 * pintarlo plomo desanimaría a quien ya concedió algo, así que va en ámbar con
 * el texto que dice exactamente qué falta.
 *
 * ## Por qué el que falta va en plomo y no en rojo
 *
 * El rojo de la paleta significa «necesito ayuda» en toda la app (§1.4.1). Un
 * permiso sin conceder no es una emergencia, y teñirlo del mismo color le
 * gastaría el significado al que sí lo es. Se usa el mismo plomo que la Home
 * usa para lo pendiente, más una línea que dice qué se pierde — que informa más
 * que el color.
 */

type Fila = {
  key: PermissionKey;
  label: string;
  /** Qué dice el estado actual, en una línea. */
  estado: string;
  /** Qué se pierde sin él. Solo se pinta cuando falta algo. */
  consecuencia: string | null;
};

function describir(permissions: PermissionsState): Fila[] {
  const { location, notifications, contacts } = permissions;

  return [
    {
      key: 'location',
      label: 'Ubicación',
      estado:
        location.grade === 'granted'
          ? 'Siempre'
          : location.grade === 'partial'
            ? 'Solo con la app abierta'
            : 'Sin conceder',
      consecuencia:
        location.grade === 'granted'
          ? null
          : location.grade === 'partial'
            ? 'Si tiembla con la app cerrada, tu red no va a poder ver dónde estabas.'
            : 'Solo te avisamos de sismos grandes en todo el país, no de los cercanos.',
    },
    {
      key: 'notifications',
      label: 'Notificaciones',
      estado: notifications.grade === 'granted' ? 'Activadas' : 'Sin conceder',
      consecuencia:
        notifications.grade === 'granted'
          ? null
          : 'No te llega nada: ni sismos, ni mensajes, ni si alguien de tu red necesita ayuda.',
    },
    {
      key: 'contacts',
      label: 'Contactos',
      estado: contacts.grade === 'granted' ? 'Concedido' : 'Sin conceder',
      consecuencia:
        contacts.grade === 'granted'
          ? null
          : 'No podemos decirte quiénes de tu agenda ya usan la app. Igual pueden encontrarte a ti y enviarte la solicitud.',
    },
  ];
}

export function PermissionsChecklist() {
  const { colors, status } = useTheme();
  const router = useRouter();
  const { userId } = useAuth();
  const { refresh } = useAppData();
  const { permissions, reload } = usePermissions();

  const [pidiendo, setPidiendo] = useState<PermissionKey | null>(null);

  if (!permissions) {
    return (
      <Card>
        <Text variant="footnote" tone="tertiary">
          Revisando permisos…
        </Text>
      </Card>
    );
  }

  const tocar = async (key: PermissionKey) => {
    const snapshot = permissions[key];

    // Ya concedido del todo, o el sistema ya no vuelve a preguntar: en los dos
    // casos lo único útil es abrir los Ajustes del SO. Que la fila concedida
    // también sea tocable es a propósito — es donde uno va a revocarlo.
    if (snapshot.grade === 'granted' || !snapshot.canAskAgain) {
      await Linking.openSettings();
      return;
    }

    setPidiendo(key);
    try {
      if (key === 'location') {
        // El orden lo exige el SO: primer plano antes que segundo plano.
        if ((await requestForegroundPermission()) === true) await requestBackgroundPermission();
        // Escribe el nivel nuevo y toma la primera posición si todavía no había.
        if (userId) await syncLocationPermission(userId);
        await refresh();
      }

      if (key === 'notifications') {
        const concedido = await requestNotificationPermission();
        // Sin esto, conceder el permiso no sirve de nada: el token es lo que el
        // servidor necesita para poder mandar algo. Es exactamente el paso que
        // faltaba cuando el permiso solo se pedía en el onboarding.
        if (concedido && userId) {
          try {
            await syncPushToken(userId);
          } catch {
            // El token se reintenta solo en el próximo refresco.
          }
        }
      }

      if (key === 'contacts') {
        const concedido = await requestContactsPermission();
        if (concedido) router.push('/add-contacts');
      }
    } catch {
      // Este `catch` faltaba y la barrida de la deuda 1.13 no podía verlo: el
      // archivo tenía un `catch` (el del token, adentro) y un `finally`, así que
      // contarlos daba "equilibrado".
      //
      // Lo que se escapaba: `syncLocationPermission` escribe en el servidor y
      // `refresh()` lee de él. Con mala señal, conceder la ubicación desde acá
      // lanzaba, la fila se quedaba en ámbar y no se decía nada — en la pantalla
      // que existe justamente para que alguien arregle sus permisos.
      //
      // El `reload()` del `finally` corre igual, así que la fila termina
      // mostrando lo que el sistema opina de verdad; lo único que se pierde sin
      // esto es el aviso.
      Alert.alert(
        'No pudimos completar el permiso',
        'Revisa tu conexión e inténtalo otra vez. Si el sistema ya no vuelve a preguntar, actívalo desde los Ajustes del teléfono.',
      );
    } finally {
      setPidiendo(null);
      reload();
    }
  };

  const filas = describir(permissions);
  const faltan = filas.filter((fila) => permissions[fila.key].grade !== 'granted').length;

  return (
    <Card padded={false}>
      <View style={styles.header}>
        <Text variant="headline">Permisos</Text>
        <Text variant="footnote" tone="secondary" style={styles.headerNote}>
          {faltan === 0
            ? // No dice "la app puede hacer lo que promete": tener los tres
              // permisos en verde NO garantiza la captura automática, que
              // además necesita la actualización en segundo plano encendida y
              // el modo de bajo consumo apagado (QUE-PROMETE-LA-APP §4).
              'Todo concedido. Ya podemos avisarte y decirle a tu red dónde estás.'
            : faltan === 1
              ? 'Falta 1 permiso. Toca para resolverlo.'
              : `Faltan ${faltan} permisos. Toca cada uno para resolverlo.`}
        </Text>
      </View>

      {filas.map((fila, index) => {
        const grade: PermissionGrade = permissions[fila.key].grade;
        const tone =
          grade === 'granted'
            ? status.safe
            : grade === 'partial'
              ? status.helping
              : status.unconfirmed;

        const icono =
          grade === 'granted'
            ? 'check-circle'
            : grade === 'partial'
              ? 'error-outline'
              : 'radio-button-unchecked';

        return (
          <Pressable
            key={fila.key}
            accessibilityRole="button"
            accessibilityLabel={`${fila.label}: ${fila.estado}.${
              fila.consecuencia ? ` ${fila.consecuencia}` : ''
            }`}
            disabled={pidiendo !== null}
            onPress={() => void tocar(fila.key)}
            style={({ pressed }) => [
              styles.row,
              index > 0
                ? { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }
                : null,
              pressed ? { backgroundColor: colors.surfaceSunken } : null,
            ]}>
            <View style={[styles.icon, { backgroundColor: tone.soft }]}>
              <MaterialIcons name={icono} size={20} color={tone.strong} />
            </View>

            <View style={styles.copy}>
              <Text variant="callout" weight="500">
                {fila.label}
              </Text>
              <Text variant="footnote" weight="600" style={{ color: tone.strong }}>
                {pidiendo === fila.key ? 'Esperando al sistema…' : fila.estado}
              </Text>
              {fila.consecuencia ? (
                <Text variant="caption" tone="tertiary" style={styles.consecuencia}>
                  {fila.consecuencia}
                </Text>
              ) : null}
            </View>

            <MaterialIcons name="chevron-right" size={22} color={colors.textTertiary} />
          </Pressable>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, paddingBottom: Spacing.md },
  headerNote: { marginTop: 2 },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  icon: {
    alignItems: 'center',
    borderRadius: Radius.pill,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  copy: { flex: 1, gap: 1 },
  consecuencia: { marginTop: 2 },
});
