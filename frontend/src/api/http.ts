import axios, { AxiosError } from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { env } from '@/lib/env';

/** Fired when a refresh attempt fails - the auth layer logs out on it. */
export const AUTH_EXPIRED_EVENT = 'cvantage:auth-expired';

const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/users/me',
];

export const http: AxiosInstance = axios.create({
  baseURL: `${env.apiBaseUrl}/api/v1`,
  withCredentials: true, // httpOnly cookies - no token ever touches JS
  timeout: 30_000,
});

/** Exactly ONE refresh under any number of concurrent 401s (issue #61 / 7.4). */
let refreshInFlight: Promise<void> | null = null;

function refreshSession(): Promise<void> {
  refreshInFlight ??= http
    .post('/auth/refresh')
    .then(() => undefined)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RetriableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean;
}

http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetriableConfig | undefined;
  const status = error.response?.status;
  const path = config?.url ?? '';
  const refreshable =
    status === 401 && config && !config._retried && !NO_REFRESH_PATHS.some((p) => path.includes(p));
  if (!refreshable) throw error;
  try {
    await refreshSession();
  } catch {
    window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
    throw error;
  }
  config._retried = true;
  return http.request(config);
});
