import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';

import { useAuth } from '@/context/auth';

/**
 * Adónde lleva tocar una notificación.
 *
 * Antes no llevaba a ningún lado: cualquier aviso abría la app en la Home y la
 * persona tenía que ir a buscar de qué se trataba. Con un solo tipo de push
 * —el de sismo, que justamente vive en la Home— no se notaba. Con cinco tipos
 * más, sí.
 *
 * ## Dos entradas, no una
 *
 * Un aviso puede tocarse con la app **abierta** (el listener) o con la app
 * **cerrada**, y en ese caso el sistema la levanta desde cero y el toque ya
 * pasó antes de que este componente existiera. Eso es lo que resuelve
 * `getLastNotificationResponseAsync()`. Sin esa segunda entrada, el caso más
 * común de todos —el teléfono en el bolsillo— sería el que no funciona.
 *
 * ## Por qué hay que acordarse de lo ya navegado
 *
 * `getLastNotificationResponseAsync()` devuelve el último toque **siempre**, no
 * solo la primera vez que se pregunta. Sin el registro de identificadores ya
 * atendidos, cada vez que el efecto se vuelva a correr —al iniciar sesión, por
 * ejemplo— la app saltaría sola a una pantalla por un aviso de ayer.
 */
export function NotificationRouter() {
  const router = useRouter();
  const { session, onboardingCompleted } = useAuth();

  const atendidos = useRef(new Set<string>());

  // Sin sesión o a mitad del onboarding no hay adónde navegar: el guardia del
  // layout raíz devolvería a la persona igual, y de paso se perdería el aviso.
  const listo = Boolean(session && onboardingCompleted);

  const navegar = useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) return;

      const id = response.notification.request.identifier;
      if (atendidos.current.has(id)) return;
      atendidos.current.add(id);

      const data = response.notification.request.content.data as
        | {
            type?: string;
            userId?: string;
            conversationId?: string;
            quakeEventId?: string;
            groupId?: string;
          }
        | undefined;

      switch (data?.type) {
        case 'chat':
          if (data.conversationId) router.push(`/chat/${data.conversationId}`);
          return;

        // Todos llevan a la misma persona, que es lo que se quiere ver:
        // dónde está, cómo está y el botón para escribirle.
        case 'contact_needs_help':
        case 'contact_not_responding':
        case 'connection_accepted':
        case 'contact_is_safe':
          if (data.userId) router.push(`/contact/${data.userId}`);
          return;

        // Heredado: «tembló cerca de un contacto» dejó de emitirse en la
        // migración 0030. Se conserva el destino porque un aviso viejo que
        // siga en la bandeja tiene que llevar a algún lado al tocarlo, y con
        // varios contactos `userId` venía nulo.
        case 'contact_in_quake_zone':
          router.push(data.userId ? `/contact/${data.userId}` : '/circle');
          return;

        // Al detalle del grupo y no a Chats: la pregunta que deja el aviso es
        // «¿en qué me metieron y quiénes están?», y ahí es donde se responde
        // —incluido el aviso de quiénes no están en tu red, con su botón de
        // agregar (migración 0040).
        case 'group_added':
          if (data.groupId) router.push(`/group/${data.groupId}`);
          return;

        case 'connection_request':
          // Al círculo y no al contacto: todavía no son contactos, y la
          // solicitud se acepta desde ahí.
          router.push('/circle');
          return;

        // La NOTICIA de un sismo sí necesita destino propio, al revés que la
        // alerta: por definición es un sismo que **no** disparó alerta, así que
        // la Home no lo está mostrando y quedarse ahí no responde a nada.
        case 'quake_news':
          if (data.quakeEventId) router.push(`/quake/${data.quakeEventId}`);
          return;

        // El de ALERTA de sismo, y los dos del simulacro, ya están donde tienen
        // que estar: la Home ES la pantalla de la alerta y del modo simulacro,
        // así que abrir la app **es** la acción. Lo que hace falta —que aparezca
        // `activeDrill`— lo trae el refresco que dispara volver al primer plano.
        case 'drill_started':
        case 'drill_ended':
        default:
          return;
      }
    },
    [router],
  );

  useEffect(() => {
    if (!listo) return;

    // La app estaba cerrada y el toque la levantó.
    void Notifications.getLastNotificationResponseAsync().then(navegar);

    // La app estaba abierta o en segundo plano.
    const subscription = Notifications.addNotificationResponseReceivedListener(navegar);
    return () => subscription.remove();
  }, [listo, navegar]);

  return null;
}
