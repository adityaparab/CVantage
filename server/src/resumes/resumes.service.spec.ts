import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { AppException } from '../common';

import { ResumesService } from './resumes.service';

describe('ResumesService (issue #32 / 3.2)', () => {
  const userId = new Types.ObjectId();
  const resumeId = new Types.ObjectId();
  const audit = { record: jest.fn() };
  const users = { updateOne: jest.fn().mockReturnValue({ exec: async () => ({}) }) };

  const chain = (result: unknown) => {
    const c: Record<string, jest.Mock> = {};
    for (const m of ['select', 'sort', 'skip', 'limit']) c[m] = jest.fn().mockReturnValue(c);
    c.exec = jest.fn().mockResolvedValue(result);
    return c;
  };

  const makeResumes = () => ({
    create: jest.fn(async (d: Record<string, unknown>) => ({ _id: resumeId, __v: 0, ...d })),
    find: jest.fn(),
    countDocuments: jest.fn().mockReturnValue({ exec: async () => 42 }),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  });

  const make = (resumes = makeResumes()) => ({
    resumes,
    service: new ResumesService(resumes as never, users as never, audit as never),
  });

  beforeEach(() => jest.clearAllMocks());

  it('create stores source=created and increments the user counter', async () => {
    const { service, resumes } = make();
    await service.create(userId, { name: 'R', jsonResume: { basics: { name: 'A' } } });
    expect(resumes.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId, source: 'created', name: 'R' }),
    );
    expect(users.updateOne).toHaveBeenCalledWith({ _id: userId }, { $inc: { resumeCount: 1 } });
  });

  it('list scopes to live docs of the user and maps sort/skip/limit', async () => {
    const { service, resumes } = make();
    const c = chain([{ _id: resumeId }]);
    resumes.find.mockReturnValue(c);
    const out = await service.list(userId, { page: 3, limit: 10, sortBy: 'name', order: 'asc' });
    expect(resumes.find).toHaveBeenCalledWith({ userId, deletedAt: null });
    expect(c.sort).toHaveBeenCalledWith({ name: 1, _id: 1 });
    expect(c.skip).toHaveBeenCalledWith(20);
    expect(c.limit).toHaveBeenCalledWith(10);
    expect(out.total).toBe(42);
  });

  it('getById: foreign/deleted/missing are uniformly 404', async () => {
    const { service, resumes } = make();
    resumes.findOne.mockReturnValue({ exec: async () => null });
    await expect(service.getById(userId, resumeId)).rejects.toThrow(NotFoundException);
    expect(resumes.findOne).toHaveBeenCalledWith({ _id: resumeId, userId, deletedAt: null });
  });

  it('update: stale version → 409 AppException carrying currentVersion', async () => {
    const { service, resumes } = make();
    resumes.findOne.mockReturnValue({ exec: async () => ({ __v: 5 }) });
    const err = await service
      .update(userId, resumeId, { name: 'X', version: 3 })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getResponse()).toMatchObject({
      details: { conflict: 'version', currentVersion: 5 },
    });
  });

  it('update: matching version saves and bumps via optimistic concurrency', async () => {
    const { service, resumes } = make();
    const doc = {
      __v: 3,
      name: 'old',
      save: jest.fn(async function (this: { __v: number }) {
        this.__v += 1;
      }),
      markModified: jest.fn(),
    };
    resumes.findOne.mockReturnValue({ exec: async () => doc });
    await service.update(userId, resumeId, {
      jsonResume: { basics: { name: 'B' } },
      version: 3,
    });
    expect(doc.markModified).toHaveBeenCalledWith('jsonResume');
    expect(doc.save).toHaveBeenCalled();
  });

  it('softDelete: scoped conditional update, audited, counter floor-guarded', async () => {
    const { service, resumes } = make();
    resumes.findOneAndUpdate.mockReturnValue({ exec: async () => ({ _id: resumeId }) });
    await service.softDelete(userId, resumeId);
    expect(resumes.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: resumeId, userId, deletedAt: null },
      expect.objectContaining({ $set: expect.objectContaining({ deletedBy: userId }) }),
      { new: true },
    );
    expect(users.updateOne).toHaveBeenCalledWith(
      { _id: userId, resumeCount: { $gt: 0 } },
      { $inc: { resumeCount: -1 } },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'resume.delete', targetId: resumeId }),
    );

    resumes.findOneAndUpdate.mockReturnValue({ exec: async () => null });
    await expect(service.softDelete(userId, resumeId)).rejects.toThrow(NotFoundException);
  });
});
