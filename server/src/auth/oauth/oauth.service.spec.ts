import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { OAuthProvider, UserStatus } from '../../database/schemas';

import type { OAuthProfile, OAuthProviderAdapter } from './oauth-provider';
import { OAuthService } from './oauth.service';

const fakeAdapter = (name: OAuthProvider): OAuthProviderAdapter => ({
  name,
  buildAuthUrl: () => 'https://provider.test/auth',
  exchangeCode: async () => ({ provider: name, providerUserId: 'x', emailVerified: true }),
});

const profile = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({
  provider: OAuthProvider.GOOGLE,
  providerUserId: 'g-123',
  email: 'ada@example.test',
  emailVerified: true,
  fullName: 'Ada Lovelace',
  ...over,
});

describe('OAuthService (issue #25 / 2.4)', () => {
  const audit = { record: jest.fn() };
  const auth = {
    sanitize: (u: { _id: Types.ObjectId; email: string; fullName: string }) => ({
      id: String(u._id),
      email: u.email,
      fullName: u.fullName,
      role: 'candidate',
      emailVerified: true,
    }),
  };

  const makeUsers = () => ({
    byIdentity: null as unknown,
    byEmail: null as unknown,
    created: [] as unknown[],
    findOne: jest.fn(function (this: void, q: Record<string, unknown>) {
      const self = users;
      return { exec: async () => ('email' in q ? self.byEmail : self.byIdentity) };
    }),
    updateOne: jest.fn().mockReturnValue({ exec: async () => ({}) }),
    create: jest.fn(async (doc: Record<string, unknown>) => {
      const created = { _id: new Types.ObjectId(), ...doc };
      users.created.push(created);
      return created;
    }),
  });
  let users = makeUsers();

  const make = (adapters: OAuthProviderAdapter[] = [fakeAdapter(OAuthProvider.GOOGLE)]) =>
    new OAuthService(adapters, users as never, auth as never, audit as never);

  beforeEach(() => {
    users = makeUsers();
    jest.clearAllMocks();
  });

  it('enabledProviders reflects registered adapters; disabled adapter() → 404', () => {
    const svc = make([fakeAdapter(OAuthProvider.GOOGLE)]);
    expect(svc.enabledProviders()).toEqual({ google: true, linkedin: false });
    expect(() => svc.adapter('linkedin')).toThrow(NotFoundException);
    expect(svc.adapter('google').name).toBe('google');
  });

  it('existing identity → login (audited with provider)', async () => {
    users.byIdentity = {
      _id: new Types.ObjectId(),
      email: 'ada@example.test',
      fullName: 'Ada',
      status: UserStatus.ACTIVE,
    };
    const out = await make().resolveProfile(profile(), '1.1.1.1');
    expect(out.email).toBe('ada@example.test');
    expect(users.create).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'user.login',
        meta: expect.objectContaining({ provider: 'google' }),
      }),
    );
  });

  it('verified-email match → links identity, marks verified, logs in', async () => {
    const save = jest.fn();
    users.byEmail = {
      _id: new Types.ObjectId(),
      email: 'ada@example.test',
      fullName: 'Ada',
      status: UserStatus.ACTIVE,
      emailVerified: false,
      oauthIdentities: [] as unknown[],
      save,
    };
    await make().resolveProfile(profile());
    const linked = users.byEmail as { oauthIdentities: unknown[]; emailVerified: boolean };
    expect(linked.oauthIdentities).toHaveLength(1);
    expect(linked.emailVerified).toBe(true);
    expect(save).toHaveBeenCalled();
  });

  it('UNVERIFIED provider email colliding with an account → explicit 409, no link', async () => {
    users.byEmail = { _id: new Types.ObjectId(), oauthIdentities: [], save: jest.fn() };
    await expect(make().resolveProfile(profile({ emailVerified: false }))).rejects.toThrow(
      ConflictException,
    );
  });

  it('fresh profile → creates account (audited as oauth registration)', async () => {
    const out = await make().resolveProfile(profile({ email: 'new@example.test' }));
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'new@example.test',
        emailVerified: true,
        oauthIdentities: [expect.objectContaining({ provider: 'google', providerUserId: 'g-123' })],
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.register', meta: { provider: 'google' } }),
    );
    expect(out.email).toBe('new@example.test');
  });

  it('deactivated account via identity → 403', async () => {
    users.byIdentity = {
      _id: new Types.ObjectId(),
      email: 'ada@example.test',
      fullName: 'Ada',
      status: UserStatus.DEACTIVATED,
    };
    await expect(make().resolveProfile(profile())).rejects.toThrow(ForbiddenException);
  });
});
