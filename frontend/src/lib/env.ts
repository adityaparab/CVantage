/**
 * Typed access to client env (issue #58 / 7.1). ONLY `VITE_*` keys exist in
 * the browser bundle; everything else lives server-side. No `process.env`
 * anywhere in frontend code - this module is the single accessor.
 */
export interface ClientEnv {
  /** API origin override; empty = same-origin (dev proxy / prod same host). */
  apiBaseUrl: string;
  mode: 'development' | 'production' | 'test';
  dev: boolean;
}

export const env: ClientEnv = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '',
  mode: import.meta.env.MODE as ClientEnv['mode'],
  dev: import.meta.env.DEV,
};
