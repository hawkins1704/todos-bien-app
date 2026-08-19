import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useAppData } from '@/context/app-data';
import { useTheme } from '@/theme/use-theme';

/**
 * Tab bar NATIVA. En iOS 26 toma el aspecto liquid glass por defecto y deriva
 * su fondo del contenido de atrás, así que no se le fija backgroundColor: no
 * tendría efecto y solo rompería el efecto.
 *
 * Los tabs se definen estáticamente: NativeTabs no soporta agregarlos o
 * quitarlos en runtime.
 *
 * ⚠️ Son 5 tabs, que es el MÁXIMO que permite Android (restricción de Material
 * Design). No se puede agregar ninguno más sin agrupar alguno en un "Más".
 */
export default function TabsLayout() {
  const { incomingRequests } = useAppData();
  const { colors } = useTheme();
  const pending = incomingRequests.length;

  return (
    // `tintColor` pinta el tab seleccionado con el azul de marca. Sin esto la
    // barra usa el tint del sistema, que es justo el azul de Apple del que
    // queremos diferenciarnos. El fondo sí se deja al sistema: es glass y se
    // deriva del contenido de atrás.
    <NativeTabs tintColor={colors.accent}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="circle">
        <NativeTabs.Trigger.Label>Círculo</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
        {pending > 0 ? (
          <NativeTabs.Trigger.Badge>{String(pending)}</NativeTabs.Trigger.Badge>
        ) : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="news">
        <NativeTabs.Trigger.Label>Sismos</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="waveform.path.ecg" md="earthquake" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="chats">
        <NativeTabs.Trigger.Label>Chats</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right.fill" md="chat" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>Ajustes</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape.fill" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
