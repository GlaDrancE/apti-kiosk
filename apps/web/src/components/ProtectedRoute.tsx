import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { Role } from '@apti/shared';
import { useAuth } from './AuthProvider';

/**
 * Route gate. This is UX only — every rule here is enforced again server-side,
 * because a client-side check protects nothing.
 */
export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading…</div>;
  }
  if (!profile) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={profile.role === 'STUDENT' ? '/student/dashboard' : '/admin/dashboard'} replace />;
  }
  return <>{children}</>;
}
