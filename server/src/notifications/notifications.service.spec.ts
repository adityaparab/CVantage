import { Types } from 'mongoose';

import { NotificationState, NotificationType } from '../database/schemas';
import { ProgressBusService } from '../events';

import { NotificationsService } from './notifications.service';

const chain = (r: unknown) => ({ exec: jest.fn().mockResolvedValue(r) });

const modelMock = () => ({
  findOneAndUpdate: jest.fn(
    (_f: Record<string, unknown>, _u: Record<string, unknown>, _o?: Record<string, unknown>) =>
      chain({}),
  ),
  findOne: jest.fn((_f: Record<string, unknown>) => chain(null)),
  find: jest.fn(() => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue([]),
  })),
  countDocuments: jest.fn(() => chain(0)),
  updateMany: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) =>
    chain({ modifiedCount: 1 }),
  ),
});

const make = (model = modelMock()) => {
  const bus = new ProgressBusService();
  const events: unknown[] = [];
  bus.subscribeAll((e) => events.push(e));
  return { svc: new NotificationsService(model as never, bus), model, events };
};

const ids = {
  analysisId: new Types.ObjectId().toHexString(),
  resumeId: new Types.ObjectId().toHexString(),
  userId: new Types.ObjectId().toHexString(),
};

const event = (status: string, over: Record<string, unknown> = {}) =>
  ({ type: 'analysis', ...ids, status, name: 'PE @ Acme', ...over }) as never;

describe('NotificationsService lifecycle (issue #48 / 5.1)', () => {
  it('analysis start upserts an in_progress notification into the active slot', async () => {
    const { svc, model } = make();
    await svc.onAnalysisEvent(event('in_progress'));
    const [filter, update, opts] = model.findOneAndUpdate.mock.calls[0] as [
      Record<string, unknown>,
      { $set: Record<string, unknown>; $setOnInsert: Record<string, unknown> },
      { upsert: boolean },
    ];
    expect(filter).toMatchObject({ state: NotificationState.ACTIVE });
    expect(update.$set.type).toBe(NotificationType.ANALYSIS_IN_PROGRESS);
    expect(update.$set.title).toContain('PE @ Acme');
    expect(update.$setOnInsert.expiresAt).toBeInstanceOf(Date);
    expect(opts.upsert).toBe(true);
  });

  it('completion/failure REPLACE in place (same active-slot filter)', async () => {
    const { svc, model } = make();
    await svc.onAnalysisEvent(event('completed'));
    await svc.onAnalysisEvent(event('failed'));
    const types = model.findOneAndUpdate.mock.calls.map(
      (c) => ((c as unknown[])[1] as { $set: { type: string } }).$set.type,
    );
    expect(types).toEqual([NotificationType.ANALYSIS_COMPLETED, NotificationType.ANALYSIS_FAILED]);
    for (const c of model.findOneAndUpdate.mock.calls) {
      expect((c as unknown[])[0]).toMatchObject({ state: NotificationState.ACTIVE });
    }
  });

  it('step events do not touch notifications', async () => {
    const { svc, model } = make();
    await svc.onAnalysisEvent(event('in_progress', { step: 'compare_resume_jd' }));
    await svc.onAnalysisEvent(event('step_completed', { step: 'compare_resume_jd' }));
    expect(model.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('upsert race (E11000) retries as a plain update - never two rows', async () => {
    const model = modelMock();
    model.findOneAndUpdate
      .mockImplementationOnce(() => ({
        exec: jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 })),
      }))
      .mockImplementationOnce((_f, _u, o) => {
        expect((o as { upsert: boolean }).upsert).toBe(false);
        return chain({});
      });
    const { svc } = make(model);
    await svc.onAnalysisEvent(event('completed'));
    expect(model.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('clear: foreign -> 404; own cleared row is an idempotent no-op', async () => {
    const { svc } = make();
    await expect(svc.clear(new Types.ObjectId(), new Types.ObjectId())).rejects.toMatchObject({
      status: 404,
    });

    const cleared = { state: NotificationState.CLEARED, save: jest.fn() };
    const model = modelMock();
    model.findOne.mockImplementation(() => chain(cleared));
    const { svc: svc2 } = make(model);
    const out = await svc2.clear(new Types.ObjectId(), new Types.ObjectId());
    expect(out.state).toBe(NotificationState.CLEARED);
    expect(cleared.save).not.toHaveBeenCalled();
  });

  it('visit rule publishes a bus event only when something was cleared', async () => {
    const model = modelMock();
    const { svc, events } = make(model);
    await svc.clearByAnalysis(new Types.ObjectId(), new Types.ObjectId());
    expect(events.filter((e) => (e as { type: string }).type === 'notification')).toHaveLength(1);
    model.updateMany.mockImplementation(() => chain({ modifiedCount: 0 }));
    await svc.clearByAnalysis(new Types.ObjectId(), new Types.ObjectId());
    expect(events.filter((e) => (e as { type: string }).type === 'notification')).toHaveLength(1);
  });
});
