import mongoose from 'mongoose';

import { UserRole } from '../src/database/schemas';
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
});
