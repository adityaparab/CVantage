import mongoose from 'mongoose';

import { UserRole } from '../src/database/schemas';
import { reconcileCounters } from '../src/scripts/reconcile-counters';
import { seedAdmin } from '../src/scripts/seed-admin';
import { syncAllIndexes } from '../src/scripts/sync-indexes';

import { mongoAvailable, startMongo, type MongoTestContext } from './mongo-test.util';

const RUN = process.env.CI === 'true' || process.env.FORCE_MONGO_E2E === 'true';

(RUN ? describe : describe.skip)('ops scripts e2e (issue #20 / 1.11)', () => {
  jest.setTimeout(120_000);
  let mongo: MongoTestContext;
  let conn: mongoose.Connection;

  beforeAll(async () => {
    if (!(await mongoAvailable())) throw new Error('mongodb-memory-server unavailable');
    mongo = await startMongo();
    conn = await mongoose.createConnection(mongo.uri).asPromise();
  });

  afterAll(async () => {
    await conn?.close();
    await mongo?.stop();
  });

  it('seed:admin creates exactly one admin across repeated runs (idempotent)', async () => {
    const r1 = await seedAdmin(conn, 'admin@cvantage.test', 'super-secret-password-1');
    const r2 = await seedAdmin(conn, 'admin@cvantage.test', 'different-password-ignored');
    expect(r1.created).toBe(true);
    expect(r2.created).toBe(false);

    const users = conn.models.User!;
    const admins = await users.countDocuments({ role: UserRole.ADMIN });
    expect(admins).toBe(1);
    const doc = await users.findOne({ email: 'admin@cvantage.test' }).select('+passwordHash');
    expect(doc!.get('passwordHash')).toMatch(/^\$argon2id\$/);
  });

  it('db:indexes creates every schema index and is a no-op on re-run', async () => {
    const first = await syncAllIndexes(conn);
    expect(first).toHaveLength(7);
    for (const r of first) expect(r.indexes).toBeGreaterThanOrEqual(1);

    const userReport = first.find((r) => r.model === 'User')!;
    expect(userReport.indexes).toBeGreaterThanOrEqual(5); // _id + 4 defined

    const second = await syncAllIndexes(conn);
    expect(second.flatMap((r) => r.dropped)).toEqual([]);
  });

  it('db:reconcile-counters fixes skew (incl. negatives) and is then a no-op', async () => {
    const users = conn.models.User!;
    const { ResumeSchema } = await import('../src/database/schemas/index.js');
    const resumes = (conn.models.Resume ??
      conn.model('Resume', ResumeSchema)) as mongoose.Model<unknown>;
    const u = await users.create({
      email: 'skew@cvantage.test',
      fullName: 'Skew',
      role: 'candidate',
    });
    await resumes.create([
      { userId: u._id, name: 'R1', source: 'created', jsonResume: { basics: { name: 'A' } } },
      { userId: u._id, name: 'R2', source: 'created', jsonResume: { basics: { name: 'B' } } },
      { userId: u._id, name: 'Gone', source: 'created', jsonResume: {}, deletedAt: new Date() },
    ]);
    await users.updateOne({ _id: u._id }, { $set: { resumeCount: -5, analysisCount: 9 } });

    const first = await reconcileCounters(conn, 50);
    const fixed = await users.findOne({ _id: u._id });
    expect(fixed!.get('resumeCount')).toBe(2); // live only
    expect(fixed!.get('analysisCount')).toBe(0);
    expect(first.filter((c) => c.userId === String(u._id))).toHaveLength(2);

    const second = await reconcileCounters(conn, 50);
    expect(second.filter((c) => c.userId === String(u._id))).toEqual([]);
  });
});

describe('job runner over real mongo (issue #40 / 4.3)', () => {
  jest.setTimeout(120_000);

  let mongo2: MongoTestContext;
  let conn: mongoose.Connection;

  beforeAll(async () => {
    if (!(await mongoAvailable())) {
      throw new Error('mongodb-memory-server unavailable in this environment');
    }
    mongo2 = await startMongo();
    conn = await mongoose.createConnection(mongo2.uri).asPromise();
  });

  afterAll(async () => {
    await conn?.close();
    await mongo2?.stop();
  });

  const jobSchema = new mongoose.Schema(
    {
      status: { type: String, default: 'pending' },
      retryCount: { type: Number, default: 0 },
      claimedBy: String,
      heartbeatAt: Date,
      error: String,
      payload: Number,
    },
    { timestamps: true },
  );

  const queueCfg = (model: mongoose.Model<unknown>) => ({
    name: 'stress',
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

  it('1000-job race across two runners: claimed exactly once each', async () => {
    const { MongoJobRunner } = await import('../src/jobs/job-runner.js');
    const model = conn.model('StressJob', jobSchema, 'stressjobs');
    await model.insertMany(
      Array.from({ length: 1000 }, (_, i) => ({ status: 'pending', payload: i })),
    );
    const seen: number[] = [];
    const handler = async (j: { payload?: number; _id: unknown }) => {
      seen.push(j.payload as number);
      await model.updateOne({ _id: j._id }, { $set: { status: 'completed' } });
    };
    const a = new MongoJobRunner(queueCfg(model as never), handler as never, { concurrency: 4 });
    const b = new MongoJobRunner(queueCfg(model as never), handler as never, { concurrency: 4 });
    while ((await model.countDocuments({ status: 'pending' })) > 0) {
      await Promise.all([a.tick(), b.tick()]);
      await Promise.all([a.idle(), b.idle()]);
    }
    await Promise.all([a.idle(), b.idle()]);
    expect(seen).toHaveLength(1000);
    expect(new Set(seen).size).toBe(1000);
    expect(await model.countDocuments({ status: 'completed' })).toBe(1000);
  });

  it('killed worker: stale claim recovered and completed by the survivor', async () => {
    const { MongoJobRunner } = await import('../src/jobs/job-runner.js');
    const model = conn.model('StressJob', jobSchema, 'stressjobs');
    const dead = await model.create({
      status: 'in_progress',
      claimedBy: 'worker-that-died',
      heartbeatAt: new Date(Date.now() - 120_000),
      payload: -1,
    });
    const survivor = new MongoJobRunner(
      queueCfg(model as never),
      (async (j: { _id: unknown }) => {
        await model.updateOne({ _id: j._id }, { $set: { status: 'completed' } });
      }) as never,
      { concurrency: 1, staleMs: 45_000 },
    );
    await survivor.recover('test');
    await survivor.tick();
    await survivor.idle();
    const after = await model.findById(dead._id).lean();
    expect(after).toMatchObject({ status: 'completed', retryCount: 1 });
  });
});
