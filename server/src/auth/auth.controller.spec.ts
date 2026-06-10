import { UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

import { UserStatus } from '../database/schemas';

import { AuthController } from './auth.controller';

describe('AuthController session plumbing (issues #22/#23)', () => {
  const userId = new Types.ObjectId();
  const sanitized = {
    id: String(userId),
    email: 'ada@x.test',
    fullName: 'Ada',
    role: 'candidate',
    emailVerified: true,
  };
  const auth = {
    register: jest.fn().mockResolvedValue(sanitized),
    login: jest.fn().mockResolvedValue(sanitized),
    sanitize: jest.fn().mockReturnValue(sanitized),
  };
  const tokens = {
    issuePair: jest.fn().mockResolvedValue({ accessToken: 'a.b.c', refreshToken: 'RAW' }),
    consumeRefresh: jest.fn().mockResolvedValue(userId),
    discardRefresh: jest.fn().mockResolvedValue(undefined),
    accessTtlMs: 900_000,
    refreshTtlMs: 2_592_000_000,
  };
  const config = { core: { isProd: false } };
  const activeUser = { status: UserStatus.ACTIVE };
  const users = {
    findById: jest.fn().mockReturnValue({ exec: async () => activeUser }),
  };
  const res = () => {
    const r = { cookie: jest.fn(), clearCookie: jest.fn() };
    return r as never;
  };
  const req = (cookies: Record<string, string> = {}) =>
    ({ cookies, headers: { 'user-agent': 'jest' } }) as never;

  const controller = new AuthController(
    auth as never,
    tokens as never,
    config as never,
    users as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    activeUser.status = UserStatus.ACTIVE;
  });

  it('login establishes the session: pair issued, both cookies set, token in body', async () => {
    const r = res();
    const out = await controller.login(
      { email: 'ada@x.test', password: 'pw' } as never,
      '1.1.1.1',
      req(),
      r as never,
    );
    expect(tokens.issuePair).toHaveBeenCalledWith(
      expect.objectContaining({ id: String(userId) }),
      expect.objectContaining({ ip: '1.1.1.1', userAgent: 'jest' }),
    );
    const cookieCalls = (r as never as { cookie: jest.Mock }).cookie.mock.calls.map((c) => c[0]);
    expect(cookieCalls).toEqual(expect.arrayContaining(['cvantage.access', 'cvantage.refresh']));
    expect(out.accessToken).toBe('a.b.c');
  });

  it('refresh: cookie token consumed, new pair for the live account', async () => {
    const out = await controller.refresh(
      {} as never,
      '2.2.2.2',
      req({ 'cvantage.refresh': 'OLD_RAW' }),
      res(),
    );
    expect(tokens.consumeRefresh).toHaveBeenCalledWith('OLD_RAW', '2.2.2.2');
    expect(out.user).toEqual(sanitized);
  });

  it('refresh without any token → 401; deactivated account → 401 + cookies cleared', async () => {
    await expect(controller.refresh({} as never, 'ip', req(), res())).rejects.toThrow(
      UnauthorizedException,
    );
    activeUser.status = UserStatus.DEACTIVATED;
    const r = res();
    await expect(
      controller.refresh({} as never, 'ip', req({ 'cvantage.refresh': 'X_RAW' }), r),
    ).rejects.toThrow(/deactivated/i);
    expect((r as never as { clearCookie: jest.Mock }).clearCookie).toHaveBeenCalled();
  });

  it('logout discards the presented token and clears cookies (idempotent)', async () => {
    const r = res();
    await controller.logout(req({ 'cvantage.refresh': 'BYE_RAW' }), r, {} as never);
    expect(tokens.discardRefresh).toHaveBeenCalledWith('BYE_RAW');
    expect((r as never as { clearCookie: jest.Mock }).clearCookie).toHaveBeenCalledTimes(2);
    await controller.logout(req(), res(), {} as never); // no token — still fine
  });
});
