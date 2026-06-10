import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

import { PasswordHasherService } from '../auth/password-hasher.service';
import type { RequestUser } from '../auth/request-user';

import { UsersController } from './users.controller';

describe('UsersController (issue #27 / 2.6)', () => {
  const hasher = new PasswordHasherService();
  const id = new Types.ObjectId();
  const me: RequestUser = {
    id: String(id),
    email: 'ada@x.test',
    fullName: 'Ada',
    role: 'candidate' as never,
    status: 'active' as never,
    emailVerified: true,
  };

  const baseDoc = async (password?: string) => ({
    _id: id,
    email: 'ada@x.test',
    fullName: 'Ada',
    role: 'candidate',
    emailVerified: true,
    avatarUrl: undefined,
    oauthIdentities: [{ provider: 'google' }],
    resumeCount: 2,
    analysisCount: 5,
    createdAt: new Date('2026-05-01T10:00:00Z'),
    passwordHash: password ? await hasher.hash(password) : undefined,
  });

  const makeUsers = (doc: unknown) => ({
    findById: jest.fn(() => ({
      exec: async () => doc,
      select: () => ({ exec: async () => doc }),
    })),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
  });
  const tokens = { revokeOthersForUser: jest.fn().mockResolvedValue(2) };

  const make = (doc: unknown) =>
    new UsersController(makeUsers(doc) as never, hasher, tokens as never);

  beforeEach(() => jest.clearAllMocks());

  it('GET me projects profile + provider names + counters, never identities or hash', async () => {
    const out = await make(await baseDoc('Engine-4242X')).me(me);
    expect(out).toMatchObject({
      id: String(id),
      providers: ['google'],
      resumeCount: 2,
      analysisCount: 5,
    });
    expect(JSON.stringify(out)).not.toMatch(/passwordHash|providerUserId|argon2/);
  });

  it('PATCH me updates only provided fields', async () => {
    const doc = await baseDoc();
    const controller = make(doc);
    await controller.updateMe(me, { fullName: 'Ada King' } as never);
    const users = (controller as unknown as { users: { updateOne: jest.Mock } }).users;
    expect(users.updateOne).toHaveBeenCalledWith({ _id: id }, { $set: { fullName: 'Ada King' } });
  });

  it('password change: OAuth-only account → explicit 409', async () => {
    await expect(
      make(await baseDoc(undefined)).changePassword(
        me,
        { currentPassword: 'x', newPassword: 'Fresh-Engine-77' } as never,
        { cookies: {} } as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('password change: wrong current → 403; nothing persisted', async () => {
    const controller = make(await baseDoc('Engine-4242X'));
    await expect(
      controller.changePassword(
        me,
        { currentPassword: 'Wrong-12345', newPassword: 'Fresh-Engine-77' } as never,
        { cookies: {} } as never,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(tokens.revokeOthersForUser).not.toHaveBeenCalled();
  });

  it('password change success: rehash + revoke OTHERS keeping the presented refresh', async () => {
    const controller = make(await baseDoc('Engine-4242X'));
    const out = await controller.changePassword(
      me,
      { currentPassword: 'Engine-4242X', newPassword: 'Fresh-Engine-77' } as never,
      { cookies: { 'cvantage.refresh': 'CURRENT_RAW_TOKEN_123456' } } as never,
    );
    expect(tokens.revokeOthersForUser).toHaveBeenCalledWith(id, 'CURRENT_RAW_TOKEN_123456');
    expect(out).toEqual({ changed: true, revokedSessions: 2 });
  });
});
