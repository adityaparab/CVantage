import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { Spinner } from '@/components/ui';
import { useAuth } from '@/features/auth/auth-context';

function FullPageSpinner() {
  return (
    <div className="grid min-h-screen place-items-center">
      <Spinner size={28} label="Checking your session" />
    </div>
  );
}

/** Logged-out users go to login carrying the deep link (issue #60 / 7.3). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }
  return children;
}

/** Candidates hitting /admin/** see a 403 page (never a blank redirect). */
export function RequireRole({
  requiredRole,
  children,
}: {
  requiredRole: 'admin';
  children: ReactNode;
}) {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') return <Navigate to="/login" replace />;
  if (user?.role !== requiredRole) return <Navigate to="/403" replace />;
  return children;
}

/** Login/register bounce authenticated users to their home. */
export function RedirectIfAuthed({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') {
    return <Navigate to={user?.role === 'admin' ? '/admin' : '/dashboard'} replace />;
  }
  return children;
}
