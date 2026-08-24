import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
                <StatusBar style="auto" />
                <NotificationRouter />
                <RootNavigator />
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

    void SplashScreen.hideAsync();

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!session) {
      if (!inAuth) router.replace('/welcome');
    } else if (!onboardingCompleted) {
      if (!inOnboarding) router.replace('/profile');
    } else if (inAuth || inOnboarding) {
      router.replace('/');
    }
  }, [ready, session, onboardingCompleted, segments, router]);

  return (
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
        options={{ presentation: 'modal', headerShown: true, title: 'Plan de acción' }}
      />
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
      <Stack.Screen name="drill" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
