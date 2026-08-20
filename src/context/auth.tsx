import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchMySettings } from '@/lib/api';
import { wipeLocalCache } from '@/lib/db';
import { KV, kvGet, kvSet } from '@/lib/db/kv';
import { supabase } from '@/lib/supabase';
import type { MySettings } from '@/types/domain';

/**
 * Resultado de crear una cuenta. Los tres casos existen de verdad y la pantalla
 * tiene que distinguirlos:
 *
 * - `signed-in`: el proyecto tiene "Confirm email" apagado, así que Supabase
 *   devuelve sesión al instante y no manda ningún correo.
 * - `needs-confirmation`: "Confirm email" está prendido; hay que verificar el
 *   código que llega por correo antes de tener sesión.
 * - `already-registered`: con la confirmación prendida, Supabase **no delata**
 *   que el correo ya existe (evita que alguien use el registro para averiguar
 *   quién tiene cuenta): responde 200 con `identities: []` en vez de un error.
 */
export type SignUpResult = 'signed-in' | 'needs-confirmation' | 'already-registered';

type AuthState = {
  session: Session | null;
  userId: string | null;
  /** null mientras todavía no sabemos: sirve para no parpadear al arrancar. */
  onboardingCompleted: boolean | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<SignUpResult>;
  confirmEmailCode: (email: string, token: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (email: string, token: string, newPassword: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshOnboardingState: () => Promise<void>;
  markOnboardingComplete: () => void;
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const refreshOnboardingState = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;

    // Primero la caché local: si la persona ya terminó el onboarding, abrir la
    // app sin red no debe mandarla de vuelta al onboarding.
    const cached = await kvGet<MySettings>(KV.mySettings);
    if (cached) setOnboardingCompleted(Boolean(cached.onboardingCompletedAt));

    try {
      const settings = await fetchMySettings(userId);
      if (settings) {
        await kvSet(KV.mySettings, settings);
        setOnboardingCompleted(Boolean(settings.onboardingCompletedAt));
      } else if (!cached) {
        setOnboardingCompleted(false);
      }
    } catch {
      if (!cached) setOnboardingCompleted(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    // El primer setState ocurre después de leer SQLite, no en el cuerpo del
    // efecto; el linter no puede ver a través del límite async.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshOnboardingState();
  }, [refreshOnboardingState]);


  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (email: string, password: string): Promise<SignUpResult> => {
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw error;

    if (data.user && data.user.identities?.length === 0) return 'already-registered';
    return data.session ? 'signed-in' : 'needs-confirmation';
  }, []);

  const confirmEmailCode = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: token.trim(),
      type: 'signup',
    });
    if (error) throw error;
  }, []);

  const resendConfirmation = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: normalizeEmail(email) });
    if (error) throw error;
  }, []);

  const requestPasswordReset = useCallback(async (email: string) => {
    // Sin `redirectTo`: la plantilla manda `{{ .Token }}`, o sea un código que se
    // escribe dentro de la app. Un link abriría el navegador del teléfono y
    // habría que resolver el deep link de vuelta para nada.
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email));
    if (error) throw error;
  }, []);

  const resetPassword = useCallback(
    async (email: string, token: string, newPassword: string) => {
      // El código de recuperación **abre sesión**: recién con esa sesión se puede
      // escribir la contraseña nueva. El efecto secundario es que entre las dos
      // llamadas la persona ya está autenticada, así que el guardia de navegación
      // la va a sacar de la pantalla. Por eso la contraseña se valida antes de
      // llegar acá y un fallo del `updateUser` cierra la sesión: quedar adentro
      // con la contraseña vieja, y creyendo que se cambió, es peor que no entrar.
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: normalizeEmail(email),
        token: token.trim(),
        type: 'recovery',
      });
      if (verifyError) throw verifyError;

      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

      // Escribir la misma contraseña que ya tenía no es un fallo: es exactamente
      // el estado que la persona pidió, y ya entró.
      if (updateError && (updateError as { code?: string }).code !== 'same_password') {
        await supabase.auth.signOut();
        throw updateError;
      }
    },
    [],
  );

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const email = session?.user.email;
    if (!email) throw new Error('no hay sesión');

    // Reautenticar antes de cambiar. No es un chequeo cosmético del cliente:
    // `signInWithPassword` es una llamada real que el servidor rechaza si la
    // contraseña no es la correcta. Sin esto, cualquiera con el teléfono
    // desbloqueado se queda con la cuenta, porque `updateUser` no pregunta nada.
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (reauthError) throw reauthError;

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;

    // Cerrar las demás sesiones es la mitad del sentido de cambiar la
    // contraseña: si alguien te la sabía, cambiarla sin echarlo del teléfono
    // donde ya entró no lo saca de ningún lado. `others` no toca la de acá.
    await supabase.auth.signOut({ scope: 'others' });
  }, [session?.user.email]);

  const deleteAccount = useCallback(async (password: string) => {
    // La contraseña la valida el RPC contra `auth.users`, no la app: alguien con
    // el token de sesión podría llamarlo directo saltándose cualquier chequeo
    // que hiciéramos acá (migración 0013).
    const { error } = await supabase.rpc('delete_my_account', { password_attempt: password });
    if (error) throw error;

    // `scope: 'local'` a propósito: la fila del usuario ya no existe, así que
    // pedirle al servidor que cierre la sesión devolvería un error por una
    // sesión que de todos modos quedó muerta. Lo que importa es limpiar acá.
    await supabase.auth.signOut({ scope: 'local' });
    await wipeLocalCache();
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    await wipeLocalCache();
  }, []);

  const markOnboardingComplete = useCallback(() => {
    setOnboardingCompleted(true);
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      userId: session?.user.id ?? null,
      // Sin sesión se deriva a null en vez de limpiarlo desde un efecto: así
      // cerrar sesión no dispara un render en cascada.
      onboardingCompleted: session ? onboardingCompleted : null,
      loading,
      signIn,
      signUp,
      confirmEmailCode,
      resendConfirmation,
      requestPasswordReset,
      resetPassword,
      changePassword,
      deleteAccount,
      signOut,
      refreshOnboardingState,
      markOnboardingComplete,
    }),
    [
      session,
      onboardingCompleted,
      loading,
      signIn,
      signUp,
      confirmEmailCode,
      resendConfirmation,
      requestPasswordReset,
      resetPassword,
      changePassword,
      deleteAccount,
      signOut,
      refreshOnboardingState,
      markOnboardingComplete,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return context;
}
