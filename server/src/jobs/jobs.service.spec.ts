import { JobsService } from './jobs.service';

const queueCfg = (model: unknown) =>
  ({
    name: 'spec',
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
  }) as never;

const emptyModel = () => ({
  findOneAndUpdate: jest.fn(() => ({ exec: jest.fn().mockResolvedValue(null) })),
  updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) })),
  updateMany: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }) })),
});

describe('JobsService factory (issue #40 / 4.3)', () => {
  it('applies configured concurrency and registers a drain hook per runner', async () => {
    const hooks: Array<() => Promise<void>> = [];
    const shutdown = { registerDrainHook: jest.fn((h: () => Promise<void>) => hooks.push(h)) };
    const svc = new JobsService({ jobs: { concurrency: 7 } } as never, shutdown as never);
    const runner = svc.createRunner(queueCfg(emptyModel()), async () => undefined);
    expect(shutdown.registerDrainHook).toHaveBeenCalledTimes(1);
    expect((runner as unknown as { opts: { concurrency: number } }).opts.concurrency).toBe(7);
    await hooks[0]!(); // drain through the hook resolves cleanly
    expect(runner.active).toBe(0);
  });

  it('per-runner overrides beat the config default', () => {
    const svc = new JobsService(
      { jobs: { concurrency: 2 } } as never,
      { registerDrainHook: jest.fn() } as never,
    );
    const runner = svc.createRunner(queueCfg(emptyModel()), async () => undefined, {
      concurrency: 1,
      maxRetries: 9,
    });
    const opts = (runner as unknown as { opts: { concurrency: number; maxRetries: number } }).opts;
    expect(opts).toMatchObject({ concurrency: 1, maxRetries: 9 });
  });
});

describe('MongoJobRunner timers (issue #40 / 4.3)', () => {
  afterEach(() => jest.useRealTimers());

  it('start() polls, heartbeats and recovers on their intervals; drain stops them', async () => {
    jest.useFakeTimers();
    const model = emptyModel();
    const { MongoJobRunner } = jest.requireActual<typeof import('./job-runner')>('./job-runner');
    const runner = new MongoJobRunner(queueCfg(model), async () => undefined, {
      concurrency: 1,
      pollMs: 100,
      heartbeatMs: 200,
      recoveryMs: 300,
    });
    runner.start();
    await jest.advanceTimersByTimeAsync(0); // settle async boot recovery
    expect(model.updateMany).toHaveBeenCalledTimes(2); // boot recovery (requeue+exhaust)
    await jest.advanceTimersByTimeAsync(100);
    expect(model.findOneAndUpdate).toHaveBeenCalled(); // poll claimed
    await jest.advanceTimersByTimeAsync(200);
    // heartbeat with zero in-flight is a no-op (no extra updateMany beyond recovery)
    const beforeRecovery = model.updateMany.mock.calls.length;
    await jest.advanceTimersByTimeAsync(300);
    expect(model.updateMany.mock.calls.length).toBeGreaterThan(beforeRecovery); // recovery scan
    const claimsBefore = model.findOneAndUpdate.mock.calls.length;
    await runner.drain();
    await jest.advanceTimersByTimeAsync(1000);
    expect(model.findOneAndUpdate.mock.calls.length).toBe(claimsBefore); // no claims after drain
  });

  it('beat() refreshes heartbeats for in-flight work', async () => {
    jest.useFakeTimers();
    const job = { _id: 'j1', status: 'pending', retryCount: 0, createdAt: new Date() };
    const model = {
      findOneAndUpdate: jest.fn(() => ({
        exec: jest.fn(async () => {
          job.status = 'in_progress';
          return job;
        }),
      })),
      updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
      updateMany: jest.fn((_f: Record<string, unknown>, _u: Record<string, unknown>) => ({
        exec: jest.fn().mockResolvedValue({ modifiedCount: 0 }),
      })),
    };
    const { MongoJobRunner } = jest.requireActual<typeof import('./job-runner')>('./job-runner');
    let release!: () => void;
    const runner = new MongoJobRunner(
      queueCfg(model),
      () =>
        new Promise<void>((r) => {
          release = r;
        }),
      { concurrency: 1, heartbeatMs: 50 },
    );
    await runner.tick();
    expect(runner.active).toBe(1);
    runner.start();
    const beatsBefore = model.updateMany.mock.calls.filter(
      (c) => (c[1] as { $set?: Record<string, unknown> }).$set?.heartbeatAt !== undefined,
    ).length;
    await jest.advanceTimersByTimeAsync(60);
    const beatsAfter = model.updateMany.mock.calls.filter(
      (c) => (c[1] as { $set?: Record<string, unknown> }).$set?.heartbeatAt !== undefined,
    ).length;
    expect(beatsAfter).toBeGreaterThan(beatsBefore);
    release();
    await runner.drain();
  });
});
