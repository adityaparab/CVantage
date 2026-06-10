import { Types } from 'mongoose';

import { TokenKind } from '../database/schemas';

import { AccountController } from './account.controller';

describe('AccountController (issue #26 / 2.5)', () => {
  const userId = new Types.ObjectId();
  const users = {
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
    findOne: jest.fn(),
  };
  const verification = {
    consume: jest.fn().mockResolvedValue(userId),
    issue: jest.fn().mockResolvedValue('RAWTOKEN1234567890123456'),
  };
  const mail = {
    background: jest.fn(),
    sendPasswordReset: jest.fn().mockResolvedValue(undefined),
  };
  const hasher = { hash: jest.fn().mockResolvedValue('$argon2id$fresh') };
  const tokens = { revokeAllForUser: jest.fn().mockResolvedValue(2) };
  const audit = { record: jest.fn() };

  const controller = new AccountController(
    users as never,
    verification as never,
    mail as never,
    hasher as never,
    tokens as never,
    audit as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('verify-email consumes the token and flips the flag', async () => {
    const out = await controller.verifyEmail({ token: 'T'.repeat(24) } as never);
    expect(verification.consume).toHaveBeenCalledWith(TokenKind.EMAIL_VERIFY, 'T'.repeat(24));
    expect(users.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { emailVerified: true } },
    );
    expect(out).toEqual({ verified: true });
  });

  it('forgot-password issues + mails for existing accounts', async () => {
    users.findOne.mockReturnValue({
      exec: async () => ({ _id: userId, email: 'ada@x.test' }),
    });
    const out = await controller.forgotPassword({ email: 'ADA@x.test' } as never);
    expect(verification.issue).toHaveBeenCalledWith(TokenKind.PASSWORD_RESET, userId);
    expect(mail.background).toHaveBeenCalled();
    expect(out.message).toMatch(/reset link/);
  });

  it('forgot-password for unknown email: identical body, no token, no mail', async () => {
    users.findOne.mockReturnValue({ exec: async () => null });
    const out = await controller.forgotPassword({ email: 'ghost@x.test' } as never);
    expect(verification.issue).not.toHaveBeenCalled();
    expect(mail.background).not.toHaveBeenCalled();
    expect(out.message).toMatch(/reset link/);
  });

  it('reset-password rehashes, revokes all sessions and audits', async () => {
    const out = await controller.resetPassword(
      { token: 'T'.repeat(24), password: 'Fresh-Engine-77' } as never,
      '1.2.3.4',
    );
    expect(hasher.hash).toHaveBeenCalledWith('Fresh-Engine-77');
    expect(users.updateOne).toHaveBeenCalledWith(
      { _id: userId },
      { $set: { passwordHash: '$argon2id$fresh' } },
    );
    expect(tokens.revokeAllForUser).toHaveBeenCalledWith(userId);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.password_reset', ip: '1.2.3.4' }),
    );
    expect(out).toEqual({ reset: true });
  });
});
