import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { fetchMySettings } from '@/lib/api';
import { wipeLocalCache } from '@/lib/db';
import { KV, kvGet, kvSet } from '@/lib/db/kv';
import { supabase } from '@/lib/supabase';
import type { MySettings } from '@/types/domain';

type AuthState = {
  session: Session | null;
  userId: string | null;
  /** null mientras todavía no sabemos: sirve para no parpadear al arrancar. */
  onboardingCompleted: boolean | null;
  loading: boolean;
  sendEmailCode: (email: string) => Promise<void>;
  verifyEmailCode: (email: string, token: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshOnboardingState: () => Promise<void>;
  markOnboardingComplete: () => void;
};

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


  const sendEmailCode = useCallback(async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    if (error) throw error;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error) throw error;
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
      sendEmailCode,
      verifyEmailCode,
      signOut,
      refreshOnboardingState,
      markOnboardingComplete,
    }),
    [
      session,
      onboardingCompleted,
      loading,
      sendEmailCode,
      verifyEmailCode,
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
