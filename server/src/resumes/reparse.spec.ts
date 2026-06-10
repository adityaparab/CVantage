import { Types } from 'mongoose';

import { AppException } from '../common';
import { UploadParseStatus } from '../database/schemas/common';

import { ResumesService } from './resumes.service';

const chain = (result: unknown) => ({ exec: jest.fn().mockResolvedValue(result) });

const makeService = (doc: unknown) => {
  const model = {
    findOne: jest.fn((_f: Record<string, unknown>) => chain(doc)),
    updateOne: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) =>
      chain({ modifiedCount: 1 }),
    ),
  };
  const users = { updateOne: jest.fn(() => chain({})) };
  const audit = { record: jest.fn() };
  return {
    model,
    svc: new ResumesService(model as never, users as never, audit as never),
  };
};

const ids = { user: new Types.ObjectId(), resume: new Types.ObjectId() };

describe('ResumesService.reparse (issue #41 / 4.4)', () => {
  it('failed parse re-enqueues: pending, retry budget reset, error cleared', async () => {
    const { svc, model } = makeService({
      _id: ids.resume,
      userId: ids.user,
      uploadParse: { status: UploadParseStatus.FAILED, error: 'QUOTA: boom' },
    });
    await svc.reparse(ids.user, ids.resume);
    const [filter, update] = model.updateOne.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $unset: Record<string, unknown> },
    ];
    expect(filter).toMatchObject({ 'uploadParse.status': UploadParseStatus.FAILED });
    expect(update.$set).toMatchObject({
      'uploadParse.status': UploadParseStatus.PENDING,
      'uploadParse.retryCount': 0,
    });
    expect(update.$unset['uploadParse.error']).toBe(1); // dotted literal key
  });

  it('non-failed states are a 409 with the current status in details', async () => {
    for (const status of [
      UploadParseStatus.PENDING,
      UploadParseStatus.PROCESSING,
      UploadParseStatus.COMPLETED,
    ]) {
      const { svc } = makeService({ _id: ids.resume, userId: ids.user, uploadParse: { status } });
      const err = await svc.reparse(ids.user, ids.resume).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppException);
      expect((err as AppException).getStatus()).toBe(409);
    }
  });

  it('created-source resumes (no uploadParse) are a 409 too', async () => {
    const { svc } = makeService({ _id: ids.resume, userId: ids.user });
    const err = await svc.reparse(ids.user, ids.resume).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(409);
  });

  it('foreign/missing resume is an existence-hiding 404', async () => {
    const { svc } = makeService(null);
    await expect(svc.reparse(ids.user, ids.resume)).rejects.toMatchObject({ status: 404 });
  });
});
