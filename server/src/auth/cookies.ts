import type { CookieOptions, Response } from 'express';

export const ACCESS_COOKIE = 'cvantage.access';
export const REFRESH_COOKIE = 'cvantage.refresh';
/** Refresh cookie only travels to the auth endpoints. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

const base = (isProd: boolean): CookieOptions => ({
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax',
});

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
  opts: { isProd: boolean; accessMaxAgeMs: number; refreshMaxAgeMs: number },
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base(opts.isProd),
    path: '/',
    maxAge: opts.accessMaxAgeMs,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base(opts.isProd),
    path: REFRESH_COOKIE_PATH,
    maxAge: opts.refreshMaxAgeMs,
  });
}

export function clearAuthCookies(res: Response, isProd: boolean): void {
  res.clearCookie(ACCESS_COOKIE, { ...base(isProd), path: '/' });
  res.clearCookie(REFRESH_COOKIE, { ...base(isProd), path: REFRESH_COOKIE_PATH });
}
