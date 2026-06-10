import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

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

/**
 * TanStack-powered session state (issue #61 / 7.4). Cookies carry the
 * tokens (httpOnly); the http layer transparently single-flight-refreshes;
 * a failed refresh fires AUTH_EXPIRED_EVENT and we drop to anonymous and
 * clear every cached query.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: keys.auth.me(),
    queryFn: authApi.me,
    retry: false,
    staleTime: 60_000,
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
