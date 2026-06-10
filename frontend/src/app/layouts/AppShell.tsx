import { Link, NavLink, Outlet, useNavigate } from 'react-router';

import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { cn } from '@/lib/cn';
import { toggleTheme } from '@/lib/theme';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-1.5 text-sm font-medium',
    isActive
      ? 'bg-accent-soft font-semibold text-accent-ink'
      : 'text-muted hover:bg-canvas-3 hover:text-ink',
  );

/** Candidate app chrome: top nav + bell + user menu (issue #60 / 7.3). */
export default function AppShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-canvas-2">
      <nav className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/dashboard" className="flex items-center gap-2 font-extrabold text-ink">
              <span className="bg-gradient-brand grid size-7 place-items-center rounded-lg text-[0.8rem] font-extrabold text-white">
                CV
              </span>
              CVantage
            </Link>
            <div className="hidden items-center gap-1 sm:flex">
              <NavLink to="/dashboard" className={navLink}>
                Dashboard
              </NavLink>
              <NavLink to="/analyses" className={navLink}>
                Analyses
              </NavLink>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleTheme()}
              aria-label="Toggle theme"
            >
              ◐
            </Button>
            <NotificationsBell />
            <div
              className="bg-gradient-brand grid size-9 place-items-center rounded-full text-[0.78rem] font-bold text-white"
              title={user?.fullName}
              aria-label={`Signed in as ${user?.fullName ?? 'user'}`}
            >
              {(user?.fullName ?? '?')
                .split(' ')
                .map((p) => p[0])
                .slice(0, 2)
                .join('')}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void signOut().then(() => navigate('/login'));
              }}
            >
              Sign out
            </Button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
