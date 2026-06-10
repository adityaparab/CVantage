import { JobQueueConfig, MongoJobRunner } from './job-runner';

type Job = {
  _id: string;
  status: string;
  retryCount: number;
  claimedBy?: string;
  heartbeatAt?: Date;
  error?: string;
  createdAt: Date;
};

/** In-memory model honoring the exact query shapes the runner issues. */
const makeModel = (jobs: Job[]) => {
  const get = (j: Job, path: string) => (j as Record<string, unknown>)[path];
  const matches = (j: Job, q: Record<string, unknown>) =>
    Object.entries(q).every(([k, v]) => {
      const val = get(j, k);
      if (v !== null && typeof v === 'object' && '$lt' in (v as object)) {
        return val !== undefined && (val as Date) < (v as { $lt: Date }).$lt;
      }
      if (v !== null && typeof v === 'object' && '$gte' in (v as object)) {
        return ((val as number) ?? 0) >= (v as { $gte: number }).$gte;
      }
      return val === v;
    });
  const apply = (j: Job, u: Record<string, Record<string, unknown>>) => {
    for (const [k, v] of Object.entries(u.$set ?? {})) (j as Record<string, unknown>)[k] = v;
    for (const [k, v] of Object.entries(u.$inc ?? {}))
      (j as Record<string, unknown>)[k] =
        (((j as Record<string, unknown>)[k] as number) ?? 0) + (v as number);
    for (const k of Object.keys(u.$unset ?? {})) delete (j as Record<string, unknown>)[k];
  };
  return {
    jobs,
    findOneAndUpdate: jest.fn(
      (q: Record<string, unknown>, u: Record<string, Record<string, unknown>>) => ({
        exec: async () => {
          const hit = jobs
            .filter((j) => matches(j, q))
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
          if (!hit) return null;
          apply(hit, u);
          return hit;
        },
      }),
    ),
    updateOne: jest.fn(
      (q: Record<string, unknown>, u: Record<string, Record<string, unknown>>) => ({
        exec: async () => {
          const hit = jobs.find((j) => matches(j, q));
          if (hit) apply(hit, u);
          return { modifiedCount: hit ? 1 : 0 };
        },
      }),
    ),
    updateMany: jest.fn(
      (q: Record<string, unknown>, u: Record<string, Record<string, unknown>>) => ({
        exec: async () => {
          const hits = jobs.filter((j) => matches(j, q));
          for (const h of hits) apply(h, u);
          return { modifiedCount: hits.length };
        },
      }),
    ),
  };
};

const cfg = (model: unknown): JobQueueConfig<Job> => ({
  name: 'test',
  model: model as never,
  statusPath: 'status',
  pendingValue: 'pending',
  processingValue: 'in_progress',
  failedValue: 'failed',
  ownerPath: 'claimedBy',
  heartbeatPath: 'heartbeatAt',
  retryPath: 'retryCount',
  errorPath: 'error',
  sortField: 'createdAt',
});

const job = (id: string, over: Partial<Job> = {}): Job => ({
  _id: id,
  status: 'pending',
  retryCount: 0,
  createdAt: new Date(Number(id.replace(/\D/g, '') || 0)),
  ...over,
});

describe('MongoJobRunner (issue #40 / 4.3)', () => {
  it('claims oldest-first, atomically flipping status with owner + heartbeat', async () => {
    const model = makeModel([job('j2'), job('j1')]);
    const seen: string[] = [];
    const runner = new MongoJobRunner(
      cfg(model),
      async (j) => {
        seen.push(j._id);
        j.status = 'completed';
      },
      { concurrency: 1 },
    );
    await runner.tick();
    await runner.idle();
    expect(seen).toEqual(['j1']);
    expect(model.jobs.find((j) => j._id === 'j1')!.status).toBe('completed');
  });

  it('handler success without terminal status is finalized (never wedges)', async () => {
    const model = makeModel([job('j1')]);
    const runner = new MongoJobRunner(cfg(model), async () => undefined, { concurrency: 1 });
    await runner.tick();
    await runner.idle();
    const j = model.jobs[0]!;
    expect(j.claimedBy).toBeUndefined();
    expect(j.heartbeatAt).toBeUndefined();
  });

  it('retryable failure re-queues with retryCount++ until the budget, then fails', async () => {
    const model = makeModel([job('j1')]);
    const runner = new MongoJobRunner(
      cfg(model),
      async () => {
        throw new Error('transient boom');
      },
      { concurrency: 1, maxRetries: 2 },
    );
    await runner.tick(); // retry 1
    await runner.idle();
    expect(model.jobs[0]!).toMatchObject({ status: 'pending', retryCount: 1 });
    await runner.tick(); // retry 2
    await runner.idle();
    expect(model.jobs[0]!).toMatchObject({ status: 'pending', retryCount: 2 });
    await runner.tick(); // budget spent -> failed
    await runner.idle();
    expect(model.jobs[0]!.status).toBe('failed');
    expect(model.jobs[0]!.error).toContain('transient boom');
  });

  it('errors marked retryable:false fail immediately', async () => {
    const model = makeModel([job('j1')]);
    const runner = new MongoJobRunner(
      cfg(model),
      async () => {
        throw Object.assign(new Error('bad input'), { retryable: false });
      },
      { concurrency: 1, maxRetries: 5 },
    );
    await runner.tick();
    await runner.idle();
    expect(model.jobs[0]!).toMatchObject({ status: 'failed', retryCount: 0 });
  });

  it('concurrency cap holds under a burst of claimable jobs', async () => {
    const model = makeModel(Array.from({ length: 10 }, (_, i) => job(`j${i}`)));
    let peak = 0;
    let live = 0;
    const gate: Array<() => void> = [];
    const runner = new MongoJobRunner(
      cfg(model),
      (j) =>
        new Promise<void>((resolve) => {
          live += 1;
          peak = Math.max(peak, live);
          gate.push(() => {
            live -= 1;
            j.status = 'completed';
            resolve();
          });
        }),
      { concurrency: 3 },
    );
    await runner.tick();
    expect(runner.active).toBe(3);
    expect(peak).toBe(3);
    gate.splice(0).forEach((open) => open());
    await new Promise((r) => setImmediate(r));
    await runner.tick();
    expect(peak).toBe(3); // refills, never exceeds
  });

  it('recovery re-queues stale claims and exhausts over-budget ones', async () => {
    const old = new Date(Date.now() - 60_000);
    const model = makeModel([
      job('j1', { status: 'in_progress', heartbeatAt: old, retryCount: 1, claimedBy: 'dead' }),
      job('j2', { status: 'in_progress', heartbeatAt: old, retryCount: 5, claimedBy: 'dead' }),
      job('j3', { status: 'in_progress', heartbeatAt: new Date(), retryCount: 0, claimedBy: 'me' }),
    ]);
    const runner = new MongoJobRunner(cfg(model), async () => undefined, {
      concurrency: 1,
      staleMs: 45_000,
      maxRetries: 5,
    });
    await runner.recover('test');
    expect(model.jobs.find((j) => j._id === 'j1')!).toMatchObject({
      status: 'pending',
      retryCount: 2,
    });
    expect(model.jobs.find((j) => j._id === 'j2')!).toMatchObject({ status: 'failed' });
    expect(model.jobs.find((j) => j._id === 'j2')!.error).toContain('retry budget');
    expect(model.jobs.find((j) => j._id === 'j3')!.status).toBe('in_progress'); // live claim untouched
  });

  it('drain stops claiming and waits for in-flight work', async () => {
    const model = makeModel([job('j1'), job('j2')]);
    let finish!: () => void;
    const runner = new MongoJobRunner(
      cfg(model),
      (j) =>
        new Promise<void>((resolve) => {
          finish = () => {
            j.status = 'completed';
            resolve();
          };
        }),
      { concurrency: 1 },
    );
    await runner.tick();
    expect(runner.active).toBe(1);
    let drained = false;
    const draining = runner.drain().then(() => {
      drained = true;
    });
    await new Promise((r) => setImmediate(r));
    expect(drained).toBe(false); // still waiting on in-flight
    finish();
    await draining;
    expect(drained).toBe(true);
    await runner.tick(); // accepting=false -> no new claims
    expect(model.jobs.find((j) => j._id === 'j2')!.status).toBe('pending');
  });

  it('two runner instances over one queue never double-claim (interleaved)', async () => {
    const model = makeModel(Array.from({ length: 50 }, (_, i) => job(`j${i}`)));
    const claims: string[] = [];
    const handler = async (j: Job) => {
      claims.push(j._id);
      j.status = 'completed';
    };
    const a = new MongoJobRunner(cfg(model), handler, { concurrency: 2 });
    const b = new MongoJobRunner(cfg(model), handler, { concurrency: 2 });
    for (let i = 0; i < 30; i += 1) {
      await Promise.all([a.tick(), b.tick()]);
      await Promise.all([a.idle(), b.idle()]);
    }
    expect(claims.length).toBe(50);
    expect(new Set(claims).size).toBe(50); // exactly-once
  });
});
