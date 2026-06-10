import { Link, Outlet } from 'react-router';

import { Button } from '@/components/ui';
import { toggleTheme } from '@/lib/theme';

export default function MarketingLayout() {
  return (
    <div className="min-h-screen bg-canvas">
      <nav className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 font-extrabold text-ink">
            <span className="bg-gradient-brand grid size-7 place-items-center rounded-lg text-[0.8rem] font-extrabold text-white">
              CV
            </span>
            CVantage
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleTheme()}
              aria-label="Toggle theme"
            >
              ◐
            </Button>
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Get started</Button>
            </Link>
          </div>
        </div>
      </nav>
      <Outlet />
    </div>
  );
}
