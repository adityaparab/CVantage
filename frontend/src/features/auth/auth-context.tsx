import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLocation } from 'react-router';

import { authApi } from '@/api/endpoints/auth';
import { AUTH_EXPIRED_EVENT } from '@/api/http';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';

export type AuthUser = Types.AuthUser;
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Routes that should not trigger a session check. */
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

/**
 * TanStack-powered session state (issue #61 / 7.4). Cookies carry the
 * tokens (httpOnly); the http layer transparently single-flight-refreshes;
 * a failed refresh fires AUTH_EXPIRED_EVENT and we drop to anonymous and
 * clear every cached query.
 *
 * The `/users/me` query is skipped on auth pages (login, register, etc.)
 * to avoid unnecessary 401 / refresh cycles when the user is clearly
 * unauthenticated. When the user navigates to a protected page the query
 * auto-enables and fetches session state.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const location = useLocation();
  const isAuthPage = AUTH_PAGES.some((p) => location.pathname.startsWith(p));

  const me = useQuery({
    queryKey: keys.auth.me(),
    queryFn: authApi.me,
    retry: false,
    staleTime: 60_000,
    enabled: !isAuthPage,
  });

  const status: AuthStatus = me.isPending
    ? 'loading'
    : me.isSuccess
      ? 'authenticated'
      : 'anonymous';

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: keys.auth.me() });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await authApi.logout().catch(() => undefined);
    queryClient.clear();
    queryClient.setQueryData(keys.auth.me(), undefined);
    await queryClient.invalidateQueries({ queryKey: keys.auth.me() });
  }, [queryClient]);

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      void queryClient.invalidateQueries({ queryKey: keys.auth.me() });
    };
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({ status, user: me.data ?? null, refresh, signOut }),
    [status, me.data, refresh, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
