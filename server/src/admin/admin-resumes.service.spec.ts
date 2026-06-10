import { Types } from 'mongoose';

import { AuditAction } from '../database/schemas';

import { ADMIN_RESUME_ROW_KEYS, toAdminResumeRow } from './admin-resumes.controller';
import { AdminResumesService } from './admin-resumes.service';

const chain = (r: unknown) => ({ exec: jest.fn().mockResolvedValue(r) });

const ids = {
  actor: new Types.ObjectId(),
  resume: new Types.ObjectId(),
  owner: new Types.ObjectId(),
};

const makeDeps = (
  over: {
    resumeDoc?: unknown;
    resumeModified?: number;
    analysesModified?: number;
    notifsModified?: number;
  } = {},
) => {
  const resumes = {
    findById: jest.fn(() =>
      chain('resumeDoc' in over ? over.resumeDoc : { _id: ids.resume, userId: ids.owner }),
    ),
    updateOne: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) =>
      chain({ modifiedCount: over.resumeModified ?? 1 }),
    ),
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    })),
    countDocuments: jest.fn(() => chain(0)),
  };
  const analyses = {
    updateMany: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) =>
      chain({ modifiedCount: over.analysesModified ?? 2 }),
    ),
    find: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId() }]),
    })),
  };
  const notifications = {
    updateMany: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) =>
      chain({ modifiedCount: over.notifsModified ?? 1 }),
    ),
  };
  const users = {
    updateOne: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) => chain({})),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    deps: { resumes, analyses, notifications, users, audit },
    svc: new AdminResumesService(
      resumes as never,
      analyses as never,
      notifications as never,
      users as never,
      audit as never,
    ),
  };
};

describe('admin resume DTO whitelist (issue #54 / 6.3)', () => {
  it('serialized rows contain EXACTLY the allowed fields - additions fail here', () => {
    const row = toAdminResumeRow({
      _id: ids.resume,
      name: 'R',
      source: 'uploaded',
      analysisCount: 2,
      analysisStatus: 'completed',
      createdAt: new Date(),
      // these must never leak even if present on the doc:
      jsonResume: { basics: { name: 'SECRET' } },
      originalText: 'SECRET TEXT',
    } as never);
    expect(Object.keys(row).sort()).toEqual([...ADMIN_RESUME_ROW_KEYS].sort());
    expect(JSON.stringify(row)).not.toContain('SECRET');
  });
});

describe('admin cascade delete (issue #54 / 6.3)', () => {
  it('ordered steps: soft-delete, cascade analyses, clear notifications, fix counters, audit ids-only', async () => {
    const { svc, deps } = makeDeps();
    const out = await svc.cascadeDelete(ids.actor, ids.resume);
    expect(out).toEqual({ resumeDeleted: true, analysesDeleted: 2, notificationsCleared: 1 });
    // guarded soft-delete (only-if-live)
    expect(deps.resumes.updateOne.mock.calls[0]![0]).toMatchObject({ deletedAt: null });
    // counter decs: resume -1 (floor-guarded), analyses -2 (floor-guarded)
    const decs = deps.users.updateOne.mock.calls.map((c) => c[1]);
    expect(decs[0]).toEqual({ $inc: { resumeCount: -1 } });
    expect(decs[1]).toEqual({ $inc: { analysisCount: -2 } });
    const audit = deps.audit.record.mock.calls[0]![0] as {
      action: string;
      meta: Record<string, unknown>;
    };
    expect(audit.action).toBe(AuditAction.ADMIN_RESUME_DELETE);
    expect(JSON.stringify(audit.meta)).not.toMatch(/jsonResume|originalText/);
  });

  it('re-run after partial failure: already-deleted resume decrements nothing extra', async () => {
    const { svc, deps } = makeDeps({ resumeModified: 0, analysesModified: 0, notifsModified: 0 });
    const out = await svc.cascadeDelete(ids.actor, ids.resume);
    expect(out).toEqual({ resumeDeleted: false, analysesDeleted: 0, notificationsCleared: 0 });
    expect(deps.users.updateOne).not.toHaveBeenCalled(); // no double-decrement
  });

  it('missing resume -> 404', async () => {
    const { svc } = makeDeps({ resumeDoc: null });
    await expect(svc.cascadeDelete(ids.actor, ids.resume)).rejects.toMatchObject({ status: 404 });
  });
});
