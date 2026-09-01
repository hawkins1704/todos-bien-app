import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DrillBanner } from '@/components/drill-banner';
import { DrillTour, DrillTourProvider } from '@/components/drill-tour';
import { NotificationRouter } from '@/components/notification-router';
import { AppDataProvider } from '@/context/app-data';
import { AuthProvider, useAuth } from '@/context/auth';
import { DrillProvider } from '@/context/drill';
import { configurePurchases, syncPurchasesUser } from '@/lib/purchases';
import { useColorSchemeName } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync();

// RevenueCat pide arrancar lo antes posible, antes del primer render: así el
// SDK ya tiene las ofertas en caché cuando alguien abre el paywall.
configurePurchases();

// La tarea de fondo del push silencioso NO se registra acá: vive en `index.js`,
// el punto de entrada. Este archivo es una pantalla del router, y en un arranque
// headless —el que provoca un push con la app cerrada— puede no evaluarse nunca.
// Ver el comentario de `index.js`.

export default function RootLayout() {
  const scheme = useColorSchemeName();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthProvider>
            <PurchasesIdentity />
            <AppDataProvider>
              <DrillProvider>
                <DrillTourProvider>
                  <StatusBar style="auto" />
                  <NotificationRouter />
                  <RootNavigator />
                </DrillTourProvider>
              </DrillProvider>
            </AppDataProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Ata la sesión de RevenueCat a la de Supabase.
 *
 * Va en su propio componente y no dentro de `AuthProvider` porque el cobro no
 * es asunto de la autenticación: si mañana se saca RevenueCat, se borra esta
 * línea y nada más. No pinta nada.
 */
function PurchasesIdentity() {
  const { userId } = useAuth();

  useEffect(() => {
    void syncPurchasesUser(userId);
  }, [userId]);

  return null;
}

/**
 * Guardia de navegación. Tres estados posibles:
 *   sin sesión              → (auth)
 *   con sesión, sin terminar onboarding → (onboarding)
 *   con sesión y onboarding listo       → (tabs)
 */
function RootNavigator() {
  const { session, loading, onboardingCompleted } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Con sesión hay que esperar a saber si el onboarding está completo, si no
  // la app parpadea entre onboarding y tabs al arrancar.
  const ready = !loading && (!session || onboardingCompleted !== null);

  useEffect(() => {
    if (!ready) return;

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    let destino: '/welcome' | '/profile' | '/' | null = null;
    if (!session) {
      if (!inAuth) destino = '/welcome';
    } else if (!onboardingCompleted) {
      if (!inOnboarding) destino = '/profile';
    } else if (inAuth || inOnboarding) {
      destino = '/';
    }

    // El splash se oculta DESPUÉS de llegar a la ruta correcta, no antes.
    //
    // Antes se ocultaba al entrar a este efecto, y como `router.replace` tarda
    // un frame en aplicarse quedaba un parpadeo: el splash se iba, la Home
    // asomaba un instante y recién entonces entraba el onboarding. Al depender
    // de `segments`, el efecto se vuelve a ejecutar ya en destino y ahí sí cae
    // en el `hideAsync` de abajo.
    if (destino) {
      router.replace(destino);
      return;
    }

    void SplashScreen.hideAsync();
  }, [ready, session, onboardingCompleted, segments, router]);

  return (
    // La franja del simulacro y la guía van ACÁ, envolviendo al `Stack`, y no
    // dentro de cada pantalla. Es lo que hace que la marca amarilla esté en
    // todas —incluidas las modales— sin que ninguna se acuerde de pintarla, y
    // que el foco de la guía pueda apuntar también a la barra de pestañas.
    <View style={styles.raiz}>
      <DrillBanner />

      <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="contact/[id]"
          options={{ presentation: 'modal', headerShown: true, title: '' }}
        />
        {/* `headerBackButtonDisplayMode: 'minimal'` deja solo la flecha.
            Sin eso, iOS rotula el botón con el título de la pantalla anterior, y
            como los tabs son un grupo de expo-router sin título, el rótulo que
            salía era literalmente "(tabs)". Poner "Chats" tampoco serviría: al
            chat también se entra desde el detalle de un contacto. */}
        <Stack.Screen
          name="chat/[id]"
          options={{ headerShown: true, title: '', headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.Screen
          name="quake/[id]"
          options={{ presentation: 'modal', headerShown: true, title: '' }}
        />
        <Stack.Screen
          name="account"
          options={{ presentation: 'modal', headerShown: true, title: 'Mi cuenta' }}
        />
        <Stack.Screen
          name="change-password"
          options={{ presentation: 'modal', headerShown: true, title: 'Cambiar contraseña' }}
        />
        <Stack.Screen
          name="delete-account"
          options={{ presentation: 'modal', headerShown: true, title: 'Borrar cuenta' }}
        />
        <Stack.Screen
          name="action-plan"
          options={{ presentation: 'modal', headerShown: true, title: 'Mis planes de acción' }}
        />
        {/* El editor va apilado DENTRO del modal de la lista, no como modal
            propio: así «volver» regresa a la lista y no cierra todo de golpe. */}
        <Stack.Screen name="action-plan/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen
          name="add-contacts"
          options={{ presentation: 'modal', headerShown: true, title: 'Agregar contactos' }}
        />
        <Stack.Screen
          name="report"
          options={{ presentation: 'modal', headerShown: true, title: 'Denunciar' }}
        />
        <Stack.Screen
          name="blocked"
          options={{ presentation: 'modal', headerShown: true, title: 'Personas bloqueadas' }}
        />
        {/* Apilado y no modal: se llega desde «Mis grupos», desde la ficha de un
            contacto y desde la lista de Chats, y en los tres casos «volver» tiene
            que regresar ahí.

            Y con `headerBackButtonDisplayMode: 'minimal'` por lo mismo que el chat
            de arriba: sin eso iOS rotula la flecha con el título de la pantalla
            anterior, que al venir de los tabs es literalmente "(tabs)". Ningún
            rótulo fijo serviría, justamente porque se entra desde tres lados. */}
        <Stack.Screen
          name="group/[id]"
          options={{ headerShown: true, title: 'Grupo', headerBackButtonDisplayMode: 'minimal' }}
        />
        <Stack.Screen
          name="new-chat"
          options={{ presentation: 'modal', headerShown: true, title: 'Nueva conversación' }}
        />
      <Stack.Screen name="drill" options={{ presentation: 'fullScreenModal' }} />
      </Stack>

      <DrillTour />
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
});
