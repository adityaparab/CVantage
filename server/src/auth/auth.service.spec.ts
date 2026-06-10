import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Types } from 'mongoose';

import { UserStatus } from '../database/schemas';

import { AuthService } from './auth.service';
import { PasswordHasherService } from './password-hasher.service';

describe('AuthService (issue #22 / 2.1)', () => {
  const hasher = new PasswordHasherService();
  const audit = { record: jest.fn() };

  const makeModel = () => ({
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({}) }),
  });

  const found = (doc: unknown) => ({
    select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(doc) }),
  });

  const makeUserDoc = async (password: string, overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    email: 'ada@example.test',
    fullName: 'Ada Lovelace',
    role: 'candidate',
    emailVerified: false,
    status: UserStatus.ACTIVE,
    passwordHash: await hasher.hash(password),
    ...overrides,
  });

  beforeEach(() => jest.clearAllMocks());

  it('register hashes with argon2id, audits, and returns sanitized user', async () => {
    const model = makeModel();
    model.create.mockImplementation(async (input: Record<string, unknown>) => ({
      _id: new Types.ObjectId(),
      emailVerified: false,
      role: 'candidate',
      ...input,
    }));
    const service = new AuthService(model as never, hasher, audit as never);

    const out = await service.register(
      { email: 'ada@example.test', fullName: 'Ada', password: 'Engine-4242' },
      '1.2.3.4',
    );

    const created = model.create.mock.calls[0]![0] as { passwordHash: string };
    expect(created.passwordHash).toMatch(/^\$argon2id\$/);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user.register', ip: '1.2.3.4' }),
    );
    expect(JSON.stringify(out)).not.toContain('argon2');
    expect(out.email).toBe('ada@example.test');
  });

  it('login succeeds, bumps lastActiveAt and audits', async () => {
    const doc = await makeUserDoc('Engine-4242');
    const model = makeModel();
    model.findOne.mockReturnValue(found(doc));
    const service = new AuthService(model as never, hasher, audit as never);

    const out = await service.login({ email: 'ADA@example.test', password: 'Engine-4242' });
    expect(out.id).toBe(String(doc._id));
    expect(model.findOne).toHaveBeenCalledWith({ email: 'ada@example.test' });
    expect(model.updateOne).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'user.login' }));
  });

  it('wrong password and unknown email return the identical 401', async () => {
    const doc = await makeUserDoc('Engine-4242');
    const model = makeModel();
    model.findOne.mockReturnValueOnce(found(doc)).mockReturnValueOnce(found(null));
    const service = new AuthService(model as never, hasher, audit as never);

    const wrongPw = service.login({ email: 'ada@example.test', password: 'Wrong-99999' });
    await expect(wrongPw).rejects.toThrow(UnauthorizedException);
    const unknown = service.login({ email: 'ghost@example.test', password: 'Wrong-99999' });
    await expect(unknown).rejects.toThrow('Invalid email or password');
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('burns hashing work for unknown users (timing-equalized)', async () => {
    const spy = jest.spyOn(hasher, 'verify');
    const model = makeModel();
    model.findOne.mockReturnValue(found(null));
    const service = new AuthService(model as never, hasher, audit as never);

    await expect(
      service.login({ email: 'ghost@example.test', password: 'Whatever-123' }),
    ).rejects.toThrow(UnauthorizedException);
    expect(spy).toHaveBeenCalledTimes(1); // dummy verification actually ran
    spy.mockRestore();
  });

  it('deactivated accounts get an explicit 403 (after credential check)', async () => {
    const doc = await makeUserDoc('Engine-4242', { status: UserStatus.DEACTIVATED });
    const model = makeModel();
    model.findOne.mockReturnValue(found(doc));
    const service = new AuthService(model as never, hasher, audit as never);

    await expect(
      service.login({ email: 'ada@example.test', password: 'Engine-4242' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
