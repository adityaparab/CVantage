import { Link, NavLink, Outlet, useNavigate } from 'react-router';

import { Badge, Button } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';
import { cn } from '@/lib/cn';
import { toggleTheme } from '@/lib/theme';

const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    'rounded-lg px-3 py-1.5 text-sm font-medium',
    isActive
      ? 'bg-accent-soft font-semibold text-accent-ink'
      : 'text-muted hover:bg-canvas-3 hover:text-ink',
  );

/** Admin chrome (issue #60 / 7.3): dashboard / users / models nav. */
export default function AdminShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-canvas-2">
      <nav className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <Link to="/admin" className="flex items-center gap-2 font-extrabold text-ink">
              <span className="bg-gradient-brand grid size-7 place-items-center rounded-lg text-[0.8rem] font-extrabold text-white">
                CV
              </span>
              CVantage
              <Badge tone="accent">admin</Badge>
            </Link>
            <div className="hidden items-center gap-1 sm:flex">
              <NavLink to="/admin" end className={navLink}>
                Dashboard
              </NavLink>
              <NavLink to="/admin/users" className={navLink}>
                Users
              </NavLink>
              <NavLink to="/admin/settings" className={navLink}>
                Settings
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
            <span className="hidden text-sm text-muted sm:block">{user?.email}</span>
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
