import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthProvider';

type Tab = 'student' | 'admin';

export function Login() {
  const { profile, loading, signInStudent } = useAuth();
  const [tab, setTab] = useState<Tab>('student');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && profile) {
    return (
      <Navigate to={profile.role === 'STUDENT' ? '/student/dashboard' : '/admin/dashboard'} replace />
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (tab === 'student') {
        await signInStudent(loginId, password);
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw new Error(err.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  const switchTo = (next: Tab) => {
    setTab(next);
    setError(null);
    setPassword('');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <h1 className="mb-1 text-center text-2xl font-semibold text-slate-900">Apti Kiosk</h1>
        <p className="mb-6 text-center text-sm text-slate-500">Aptitude assessment platform</p>

        <div role="tablist" aria-label="Account type" className="mb-4 flex rounded-md bg-slate-200 p-1">
          {(['student', 'admin'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              type="button"
              aria-selected={tab === t}
              onClick={() => switchTo(t)}
              className={`flex-1 rounded px-3 py-1.5 text-sm capitalize ${
                tab === t ? 'bg-white font-medium text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="card space-y-4">
          {tab === 'student' ? (
            <div>
              <label className="label" htmlFor="loginId">Roll number</label>
              <input
                id="loginId"
                className="input"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                required
              />
            </div>
          ) : (
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          )}

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              className="input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? 'Please wait…' : 'Sign in'}
          </button>

          <p className="text-center text-xs text-slate-500">
            {tab === 'student'
              ? 'Your college issues your roll number and password. There is nothing to sign up for.'
              : 'Admin accounts sign in with the email registered for this platform.'}
          </p>
        </form>
      </div>
    </div>
  );
}
