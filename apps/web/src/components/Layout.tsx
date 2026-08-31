import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

const adminNav = [
  { to: '/admin/dashboard', label: 'Dashboard' },
  { to: '/admin/questions', label: 'Questions' },
  { to: '/admin/exams', label: 'Exams' },
  { to: '/admin/students', label: 'Students' },
  { to: '/admin/hackerrank-import', label: 'HackerRank Import' },
];

const studentNav = [{ to: '/student/dashboard', label: 'My Exams' }];

export function Layout() {
  const { profile, signOut } = useAuth();
  const nav = profile?.role === 'STUDENT' ? studentNav : adminNav;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="text-lg font-semibold text-slate-900">
            Apti Kiosk
          </Link>
          <nav className="flex items-center gap-1">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm ${
                    isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-slate-500 sm:inline">
              {profile?.fullName ?? profile?.loginId ?? profile?.email}
            </span>
            <button onClick={signOut} className="btn-secondary">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
