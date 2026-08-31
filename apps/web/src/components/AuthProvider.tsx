import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { MeResponse, StudentLoginResponse } from '@apti/shared';
import { supabase } from '../lib/supabase';
import { api, studentToken } from '../lib/api';

interface AuthState {
  profile: MeResponse | null;
  loading: boolean;
  /** Students: roll number + password issued by an admin. */
  signInStudent: (loginId: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Two ways in, one profile out.
 *
 * Students hold a token this API issued and kept in localStorage; admins hold a
 * Supabase session. /auth/me accepts either, so `profile` is the single source
 * of truth for "am I signed in" — there is no separate session to check.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      setProfile(await api.get<MeResponse>('/auth/me'));
    } catch {
      // A rejected or expired token is indistinguishable from signed out here,
      // and treating it as signed out avoids a redirect loop.
      studentToken.clear();
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const settle = async () => {
      const hasStudentToken = Boolean(studentToken.get());
      const { data } = hasStudentToken
        ? { data: { session: null } }
        : await supabase.auth.getSession();

      if (hasStudentToken || data.session) await loadProfile();
      if (!cancelled) setLoading(false);
    };
    void settle();

    // Admin sign-in/out through Supabase. A student session is untouched by it,
    // so ignore the callback entirely while a local token is held.
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (studentToken.get()) return;
      if (next) await loadProfile();
      else setProfile(null);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signInStudent = async (loginId: string, password: string) => {
    const res = await api.post<StudentLoginResponse>('/auth/login', { loginId, password });
    studentToken.set(res.token);
    setProfile(res.user);
  };

  const signOut = async () => {
    studentToken.clear();
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ profile, loading, signInStudent, signOut, refreshProfile: loadProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
