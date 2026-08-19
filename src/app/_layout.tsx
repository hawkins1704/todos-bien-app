import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppDataProvider } from '@/context/app-data';
import { AuthProvider, useAuth } from '@/context/auth';
import { DrillProvider } from '@/context/drill';
import { useColorSchemeName } from '@/theme/use-theme';

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const scheme = useColorSchemeName();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
          <AuthProvider>
            <AppDataProvider>
              <DrillProvider>
                <StatusBar style="auto" />
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
      <Stack.Screen name="chat/[id]" options={{ headerShown: true, title: '' }} />
      <Stack.Screen
        name="quake/[id]"
        options={{ presentation: 'modal', headerShown: true, title: '' }}
      />
      <Stack.Screen
        name="account"
        options={{ presentation: 'modal', headerShown: true, title: 'Mi cuenta' }}
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
        name="invite"
        options={{ presentation: 'modal', headerShown: true, title: 'Invitar' }}
      />
      <Stack.Screen name="drill" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
