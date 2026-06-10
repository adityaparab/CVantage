import { Types } from 'mongoose';

import { AppException } from '../common';

import { AnalysesService } from './analyses.service';

const chain = (result: unknown) => ({ exec: jest.fn().mockResolvedValue(result) });

const make = (resumeDoc: unknown) => {
  const analyses = {
    create: jest.fn(async (d: Record<string, unknown>) => ({ ...d, _id: new Types.ObjectId() })),
    findOne: jest.fn((_f: Record<string, unknown>) => chain(null)),
    countDocuments: jest.fn(() => chain(0)),
  };
  const resumes = {
    findOne: jest.fn((_f: Record<string, unknown>) => chain(resumeDoc)),
    updateOne: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) => chain({})),
  };
  const users = {
    updateOne: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) => chain({})),
  };
  return {
    analyses,
    resumes,
    users,
    svc: new AnalysesService(
      analyses as never,
      resumes as never,
      users as never,
      { llm: { userConcurrency: 2 } } as never,
    ),
  };
};

const ids = { user: new Types.ObjectId(), resume: new Types.ObjectId() };
const input = {
  name: 'Backend @ Initech',
  jobDescription: 'x'.repeat(40),
  resumeId: ids.resume,
};

describe('AnalysesService.create (issue #42 / 4.5)', () => {
  it('snapshots the resume, queues pending, sets rollups and counters', async () => {
    const json = { basics: { name: 'Ada' } };
    const { svc, analyses, resumes, users } = make({
      _id: ids.resume,
      toObject: () => ({ jsonResume: json }),
    });
    await svc.create(ids.user, input);
    expect(analyses.create.mock.calls[0]![0]).toMatchObject({
      resumeSnapshot: json,
      jobDescription: input.jobDescription,
    });
    expect(resumes.updateOne).toHaveBeenCalledWith(
      { _id: ids.resume },
      { $set: { analysisStatus: 'in_progress' } },
    );
    expect(users.updateOne).toHaveBeenCalledWith({ _id: ids.user }, { $inc: { analysisCount: 1 } });
  });

  it('content-less resumes are a 422 (not yet parsed / empty form)', async () => {
    const { svc } = make({ _id: ids.resume, toObject: () => ({ jsonResume: {} }) });
    const err = await svc.create(ids.user, input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getStatus()).toBe(422);
  });

  it('foreign resume is an existence-hiding 404', async () => {
    const { svc } = make(null);
    const err = (await svc.create(ids.user, input).catch((e: unknown) => e)) as { status?: number };
    expect(err.status).toBe(404);
  });
});
