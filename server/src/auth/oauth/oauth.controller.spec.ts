import { NotFoundException } from '@nestjs/common';

import { OAuthProvider } from '../../database/schemas';

import { OAuthController } from './oauth.controller';

describe('OAuthController flow (issue #25 / 2.4)', () => {
  const adapter = {
    name: OAuthProvider.GOOGLE,
    buildAuthUrl: jest.fn().mockReturnValue('https://accounts.google.test/auth?x=1'),
    exchangeCode: jest.fn().mockResolvedValue({
      provider: 'google',
      providerUserId: 'g-1',
      email: 'ada@x.test',
      emailVerified: true,
    }),
  };
  const oauth = {
    enabledProviders: jest.fn().mockReturnValue({ google: true, linkedin: false }),
    adapter: jest.fn((name: string) => {
      if (name !== 'google') throw new NotFoundException();
      return adapter;
    }),
    resolveProfile: jest.fn().mockResolvedValue({
      id: 'uid1',
      email: 'ada@x.test',
      fullName: 'Ada',
      role: 'candidate',
      emailVerified: true,
    }),
  };
  const tokens = {
    issuePair: jest.fn().mockResolvedValue({ accessToken: 'a.b.c', refreshToken: 'RAW' }),
    accessTtlMs: 900_000,
    refreshTtlMs: 2_592_000_000,
  };
  const config = {
    core: { isProd: false, appBaseUrl: 'https://app.test' },
    oauth: { callbackBaseUrl: 'https://app.test' },
  };
  const controller = new OAuthController(oauth as never, tokens as never, config as never);

  const res = () => {
    const r = {
      cookies: [] as unknown[],
      redirects: [] as string[],
      cookie: jest.fn(function (this: void, ...args: unknown[]) {
        r.cookies.push(args);
      }),
      clearCookie: jest.fn(),
      redirect: jest.fn(function (this: void, url: string) {
        r.redirects.push(url);
      }),
    };
    return r;
  };
  const stateCookie = (state: string, nonce: string, p = 'google') =>
    JSON.stringify({ state, nonce, p });

  beforeEach(() => jest.clearAllMocks());

  it('providers reports the flag map', () => {
    expect(controller.providers()).toEqual({ google: true, linkedin: false });
  });

  it('start: 302 to the provider with a signed short-lived state cookie', () => {
    const r = res();
    controller.start('google', {} as never, r as never);
    expect(r.redirects[0]).toContain('accounts.google.test');
    const [name, , opts] = r.cookies[0] as [string, string, Record<string, unknown>];
    expect(name).toBe('cvantage.oauth');
    expect(opts).toMatchObject({
      httpOnly: true,
      signed: true,
      sameSite: 'lax',
      path: '/api/v1/auth/oauth',
    });
    expect(opts.maxAge).toBe(600_000);
    expect(adapter.buildAuthUrl).toHaveBeenCalledWith(
      'https://app.test/api/v1/auth/oauth/google/callback',
      expect.any(String),
      expect.any(String),
    );
  });

  it('disabled provider → 404 from start', () => {
    expect(() => controller.start('linkedin', {} as never, res() as never)).toThrow(
      NotFoundException,
    );
  });

  it('callback happy path: exchanges, resolves, sets session cookies, redirects ok', async () => {
    const r = res();
    await controller.callback(
      'google',
      'CODE',
      'STATE1',
      '1.1.1.1',
      {
        signedCookies: { 'cvantage.oauth': stateCookie('STATE1', 'NONCE1') },
        headers: { 'user-agent': 'jest' },
      } as never,
      r as never,
    );
    expect(adapter.exchangeCode).toHaveBeenCalledWith(
      'CODE',
      'https://app.test/api/v1/auth/oauth/google/callback',
      'NONCE1',
    );
    expect(tokens.issuePair).toHaveBeenCalled();
    expect(r.redirects[0]).toBe('https://app.test/auth/callback?status=ok');
    const names = r.cookies.map((c) => (c as [string])[0]);
    expect(names).toEqual(expect.arrayContaining(['cvantage.access', 'cvantage.refresh']));
  });

  it('state mismatch → error redirect, no session', async () => {
    const r = res();
    await controller.callback(
      'google',
      'CODE',
      'TAMPERED',
      'ip',
      { signedCookies: { 'cvantage.oauth': stateCookie('STATE1', 'N') }, headers: {} } as never,
      r as never,
    );
    expect(tokens.issuePair).not.toHaveBeenCalled();
    expect(r.redirects[0]).toContain('status=error');
    expect(r.redirects[0]).toContain('reason=oauth_failed');
  });

  it('user-facing failures (deactivated / linkable conflict) surface their reason', async () => {
    oauth.resolveProfile.mockRejectedValueOnce(
      Object.assign(new Error('This account has been deactivated'), {}),
    );
    const r = res();
    await controller.callback(
      'google',
      'CODE',
      'S',
      'ip',
      { signedCookies: { 'cvantage.oauth': stateCookie('S', 'N') }, headers: {} } as never,
      r as never,
    );
    expect(r.redirects[0]).toContain(encodeURIComponent('deactivated'));
  });
});
