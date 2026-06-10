import { Types } from 'mongoose';

import { AppException } from '../common';
import { AuditAction, UserStatus } from '../database/schemas';

import { AdminUsersService } from './admin-users.service';

const chain = (r: unknown) => ({ exec: jest.fn().mockResolvedValue(r) });

const makeModel = (doc?: Record<string, unknown> | null) => ({
  find: jest.fn((_f: Record<string, unknown>) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
  countDocuments: jest.fn(() => chain(0)),
  findById: jest.fn(() => chain(doc ?? null)),
});

const deps = () => ({
  hasher: { hash: jest.fn(async (p: string) => `hashed(${p})`) },
  tokens: { revokeAllForUser: jest.fn().mockResolvedValue(1) },
  verification: { issue: jest.fn().mockResolvedValue('reset-token') },
  mail: { sendPasswordReset: jest.fn().mockResolvedValue(undefined) },
  audit: { record: jest.fn().mockResolvedValue(undefined) },
});

const make = (model: ReturnType<typeof makeModel>, d = deps()) => ({
  svc: new AdminUsersService(
    model as never,
    d.hasher as never,
    d.tokens as never,
    d.verification as never,
    d.mail as never,
    d.audit as never,
  ),
  d,
  model,
});

const baseQuery = { page: 1, limit: 20, sortBy: 'createdAt', order: 'desc' } as const;

describe('AdminUsersService search (issue #53 / 6.2)', () => {
  it('24-hex search is an exact id match; text search is an escaped prefix on email+name', async () => {
    const model = makeModel();
    const { svc } = make(model);
    const id = new Types.ObjectId().toHexString();
    await svc.list({ ...baseQuery, search: id });
    expect(model.find.mock.calls[0]![0]).toMatchObject({ _id: new Types.ObjectId(id) });

    await svc.list({ ...baseQuery, search: 'ada+lovelace' });
    const or = (model.find.mock.calls[1]![0] as { $or: Array<Record<string, RegExp>> }).$or;
    expect(or[0]!.email!.source).toBe('^ada\\+lovelace');
    expect(or[0]!.email!.flags).toContain('i');
  });
});

describe('AdminUsersService mutations + audit table (issue #53 / 6.2)', () => {
  const actor = new Types.ObjectId();
  const target = new Types.ObjectId();

  const userDoc = (over: Record<string, unknown> = {}) => ({
    _id: target,
    fullName: 'Old Name',
    email: 'old@example.com',
    status: UserStatus.ACTIVE,
    save: jest.fn().mockResolvedValue(undefined),
    ...over,
  });

  it('update writes a field diff audit row; email dup -> 409', async () => {
    const doc = userDoc();
    const { svc, d } = make(makeModel(doc));
    await svc.update(actor, target, { fullName: 'New Name' });
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ADMIN_USER_UPDATE,
        meta: expect.objectContaining({ changedFields: ['fullName'] }),
      }),
    );
    const dupDoc = userDoc({
      save: jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 })),
    });
    const { svc: svc2 } = make(makeModel(dupDoc));
    const err = await svc2
      .update(actor, target, { email: 'taken@example.com' })
      .catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(409);
  });

  it('temporary reset: hashed storage, single-shot return, revocation, audit, force-change flag', async () => {
    const doc = userDoc();
    const { svc, d } = make(makeModel(doc));
    const out = await svc.resetPassword(actor, target, 'temporary');
    expect(out.temporaryPassword).toBeDefined();
    expect((doc as { passwordHash?: string }).passwordHash).toBe(
      `hashed(${out.temporaryPassword})`,
    );
    expect((doc as { mustChangePassword?: boolean }).mustChangePassword).toBe(true);
    expect(d.tokens.revokeAllForUser).toHaveBeenCalledWith(target);
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.ADMIN_PASSWORD_RESET }),
    );
  });

  it('email reset issues a token and mails it', async () => {
    const { svc, d } = make(makeModel(userDoc()));
    const out = await svc.resetPassword(actor, target, 'email');
    expect(out.temporaryPassword).toBeUndefined();
    expect(d.verification.issue).toHaveBeenCalled();
    expect(d.mail.sendPasswordReset).toHaveBeenCalledWith('old@example.com', 'reset-token');
  });

  it('deactivation revokes tokens and audits; self-deactivation -> 409; idempotent', async () => {
    const doc = userDoc();
    const { svc, d } = make(makeModel(doc));
    await svc.setStatus(actor, target, UserStatus.DEACTIVATED);
    expect(d.tokens.revokeAllForUser).toHaveBeenCalledWith(target);
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.ADMIN_USER_DEACTIVATE }),
    );
    const self = await svc.setStatus(actor, actor, UserStatus.DEACTIVATED).catch((e: unknown) => e);
    expect((self as AppException).getStatus()).toBe(409);

    const already = userDoc({ status: UserStatus.DEACTIVATED });
    const { svc: svc2, d: d2 } = make(makeModel(already));
    await svc2.setStatus(actor, target, UserStatus.DEACTIVATED);
    expect(already.save as jest.Mock).not.toHaveBeenCalled();
    expect(d2.audit.record).not.toHaveBeenCalled();
  });

  it('missing user is a 404 everywhere', async () => {
    const { svc } = make(makeModel(null));
    for (const op of [
      () => svc.getById(target),
      () => svc.update(actor, target, { fullName: 'x' }),
      () => svc.resetPassword(actor, target, 'email'),
      () => svc.setStatus(actor, target, UserStatus.ACTIVE),
    ]) {
      await expect(op()).rejects.toMatchObject({ status: 404 });
    }
  });
});
