import { Types } from 'mongoose';

import { AnalysesController } from './analyses.controller';

const doc = (over: Record<string, unknown> = {}) =>
  ({
    _id: new Types.ObjectId(),
    resumeId: new Types.ObjectId(),
    name: 'PE @ Acme',
    status: 'completed',
    steps: [{ key: 'compare_resume_jd', status: 'completed' }],
    result: { overallScore: 72, suggestions: [] },
    tokensUsed: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    durationMs: 1200,
    createdAt: new Date(),
    ...over,
  }) as never;

const user = { id: new Types.ObjectId().toHexString() } as never;
const oid = () => new Types.ObjectId();

describe('AnalysesController mapping + delegation (issue #43 / 4.6)', () => {
  it('create/get map documents to the wire shape (tokensUsed included, #44)', async () => {
    const svc = {
      create: jest.fn().mockResolvedValue(doc({ status: 'pending' })),
      getById: jest.fn().mockResolvedValue(doc()),
    };
    const ctl = new AnalysesController(svc as never);
    const created = await ctl.create(user, {
      name: 'n',
      jobDescription: 'x'.repeat(40),
      resumeId: oid(),
    } as never);
    expect(created.status).toBe('pending');
    const got = await ctl.get(user, oid());
    expect(got.tokensUsed).toMatchObject({ totalTokens: 15 });
    expect(got.id).toHaveLength(24);
  });

  it('list passes filters through and maps items', async () => {
    const svc = { list: jest.fn().mockResolvedValue({ items: [doc()], total: 1 }) };
    const ctl = new AnalysesController(svc as never);
    const q = { page: 2, limit: 5, status: 'failed' } as never;
    const out = await ctl.listAnalyses(user, q);
    expect(svc.list).toHaveBeenCalledWith(expect.any(Types.ObjectId), q);
    expect(out.total).toBe(1);
    expect((out.items[0] as { id: string }).id).toHaveLength(24);
  });

  it('retry/cancel/apply/dismiss delegate with parsed ids', async () => {
    const sid = new Types.ObjectId();
    const svc = {
      retry: jest.fn().mockResolvedValue(doc({ status: 'pending' })),
      cancel: jest.fn().mockResolvedValue(doc({ status: 'cancelled' })),
      applySuggestion: jest.fn().mockResolvedValue({
        analysis: doc({
          result: { suggestions: [{ _id: sid, applied: true, fieldRef: 'basics.label' }] },
        }),
        outcome: 'applied',
      }),
      dismissSuggestion: jest.fn().mockResolvedValue(doc()),
    };
    const ctl = new AnalysesController(svc as never);
    expect((await ctl.retry(user, oid())).status).toBe('pending');
    expect((await ctl.cancel(user, oid())).status).toBe('cancelled');
    const applied = await ctl.applySuggestion(user, oid(), sid);
    expect(applied.outcome).toBe('applied');
    expect((applied.suggestion as { applied: boolean }).applied).toBe(true);
    const dismissed = await ctl.dismissSuggestion(user, oid(), sid);
    expect(dismissed).toEqual({ id: String(sid), dismissed: true });
  });
});
