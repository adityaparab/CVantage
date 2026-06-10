import mongoose from 'mongoose';

import { JSON_RESUME_DATE } from './common';
import { prune } from './resume.schema';

import {
  AiModelSchema,
  AnalysisSchema,
  AuditLogSchema,
  AuthTokenSchema,
  MODEL_DEFINITIONS,
  NotificationSchema,
  ResumeSchema,
  UserSchema,
} from './index';

/**
 * Connection-free schema tests (issue #12 / 1.3): document validation, hooks
 * and transforms all run client-side in mongoose. Connected behavior (unique
 * indexes, TTL) is exercised against mongodb-memory-server from #19 onward.
 */

const conn = mongoose; // standalone models, never connected
const model = <T>(name: string, schema: mongoose.Schema<T>) =>
  (conn.models[name] as mongoose.Model<T>) ?? conn.model<T>(name, schema);

const UserModel = model('User', UserSchema);
const ResumeModel = model('Resume', ResumeSchema);
const AiModelModel = model('AiModel', AiModelSchema);

afterAll(async () => {
  await mongoose.disconnect();
});

describe('model registry', () => {
  it('registers all 7 collections', () => {
    expect(MODEL_DEFINITIONS.map((d) => d.name).sort()).toEqual(
      ['AiModel', 'Analysis', 'AuditLog', 'AuthToken', 'Notification', 'Resume', 'User'].sort(),
    );
  });
});

describe('resume prune pre-validate hook (placeholders are NEVER stored)', () => {
  const base = {
    userId: new mongoose.Types.ObjectId(),
    name: 'My Resume',
    source: 'created',
  };

  it('strips empty strings, whitespace, empty arrays and empty objects recursively', async () => {
    const doc = new ResumeModel({
      ...base,
      jsonResume: {
        basics: { name: 'Ada Lovelace', summary: '   ', location: { city: '' } },
        work: [
          { name: 'Analytical Engines Ltd', highlights: ['Shipped', '   ', ''] },
          { name: '', highlights: [] },
        ],
        skills: [],
        meta: {},
      },
    });
    await doc.validate();
    const jr = doc.toObject().jsonResume;
    expect(jr.basics?.name).toBe('Ada Lovelace');
    expect(jr.basics?.summary).toBeUndefined();
    expect(jr.basics?.location).toBeUndefined();
    expect(jr.work).toHaveLength(1);
    expect(jr.work?.[0]?.highlights).toEqual(['Shipped']);
    expect(jr.skills).toBeUndefined();
    expect(jr.meta).toBeUndefined();
  });

  it('prune() is idempotent and never leaves empty containers at depth', () => {
    const messy = { a: { b: { c: '  ' }, d: [{ e: '' }, {}] }, f: 'keep' };
    const once = prune(messy);
    expect(once).toEqual({ f: 'keep' });
    expect(prune(once)).toEqual(once);
  });

  it('rejects invalid partial dates and accepts the three valid formats', async () => {
    for (const good of ['2024', '2024-03', '2024-03-01']) {
      const doc = new ResumeModel({ ...base, jsonResume: { work: [{ startDate: good }] } });
      await expect(doc.validate()).resolves.toBeUndefined();
    }
    for (const bad of ['2024-13', '2024-00', '03-2024', 'yesterday']) {
      const doc = new ResumeModel({ ...base, jsonResume: { work: [{ startDate: bad }] } });
      await expect(doc.validate()).rejects.toThrow(/Date must be/);
    }
    expect('2024-02-29').toMatch(JSON_RESUME_DATE); // structural regex, not calendar-aware
  });
});

describe('toJSON redaction (secrets never serialize)', () => {
  it('User.toJSON drops passwordHash and __v', () => {
    const user = new UserModel({
      email: 'a@b.co',
      fullName: 'A B',
      passwordHash: 'super-secret-hash',
    });
    const json = user.toJSON() as Record<string, unknown>;
    expect(json.passwordHash).toBeUndefined();
    expect(json.__v).toBeUndefined();
    expect(json.email).toBe('a@b.co');
  });

  it('AiModel.toJSON drops apiKeyEncrypted but keeps the mask', () => {
    const m = new AiModelModel({
      modelName: 'gpt-4o',
      provider: 'openai',
      apiKeyEncrypted: 'iv.tag.ciphertext',
      apiKeyLast4: '3kF9',
      addedBy: new mongoose.Types.ObjectId(),
    });
    const json = m.toJSON() as Record<string, unknown>;
    expect(json.apiKeyEncrypted).toBeUndefined();
    expect(json.apiKeyLast4).toBe('3kF9');
  });
});

describe('index definitions match the canonical reference', () => {
  const indexKeys = (schema: mongoose.Schema): string[] =>
    schema.indexes().map(([keys, opts]) => JSON.stringify({ keys, u: opts?.unique ?? false }));

  it('users: unique collated email + partial oauth identity + search/sort indexes', () => {
    const idx = UserSchema.indexes();
    expect(idx).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([{ email: 1 }]),
        expect.arrayContaining([
          { 'oauthIdentities.provider': 1, 'oauthIdentities.providerUserId': 1 },
        ]),
      ]),
    );
    const emailIdx = idx.find(([k]) => JSON.stringify(k) === JSON.stringify({ email: 1 }));
    expect(emailIdx?.[1]).toMatchObject({
      unique: true,
      collation: { locale: 'en', strength: 2 },
    });
  });

  it('resumes: per-user unique live name with collation + dashboard listing', () => {
    const named = ResumeSchema.indexes().find(
      ([k]) => JSON.stringify(k) === JSON.stringify({ userId: 1, name: 1 }),
    );
    expect(named?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { deletedAt: null },
    });
  });

  it('analyses: worker-queue partial index on pending/in_progress', () => {
    const queue = AnalysisSchema.indexes().find(
      ([k]) => JSON.stringify(k) === JSON.stringify({ status: 1, createdAt: 1 }),
    );
    expect(queue?.[1]?.partialFilterExpression).toMatchObject({
      status: { $in: ['pending', 'in_progress'] },
    });
  });

  it('notifications: single ACTIVE per analysis + TTL', () => {
    const perAnalysis = NotificationSchema.indexes().find(
      ([k]) => JSON.stringify(k) === JSON.stringify({ analysisId: 1 }),
    );
    expect(perAnalysis?.[1]).toMatchObject({
      unique: true,
      partialFilterExpression: { state: 'active' },
    });
    const ttl = NotificationSchema.indexes().find(([k]) => 'expiresAt' in k);
    expect(ttl?.[1]?.expireAfterSeconds).toBe(0);
  });

  it('authtokens: unique tokenHash + TTL; auditlogs: 400-day TTL', () => {
    const tokenHash = AuthTokenSchema.indexes().find(([k]) => 'tokenHash' in k);
    expect(tokenHash?.[1]?.unique).toBe(true);
    const tokenTtl = AuthTokenSchema.indexes().find(([k]) => 'expiresAt' in k);
    expect(tokenTtl?.[1]?.expireAfterSeconds).toBe(0);
    const auditTtl = AuditLogSchema.indexes().find(
      ([k]) => JSON.stringify(k) === JSON.stringify({ createdAt: 1 }),
    );
    expect(auditTtl?.[1]?.expireAfterSeconds).toBe(400 * 24 * 3600);
  });

  it('every schema with secrets uses select:false', () => {
    expect(UserSchema.path('passwordHash').options.select).toBe(false);
    expect(AiModelSchema.path('apiKeyEncrypted').options.select).toBe(false);
    expect(AuthTokenSchema.path('tokenHash').options.select).toBe(false);
  });

  it('index snapshot is stable (guards accidental index drift)', () => {
    const all = [
      ...indexKeys(UserSchema),
      ...indexKeys(ResumeSchema),
      ...indexKeys(AnalysisSchema),
      ...indexKeys(NotificationSchema),
      ...indexKeys(AuthTokenSchema),
      ...indexKeys(AuditLogSchema),
      ...indexKeys(AiModelSchema),
    ];
    expect(all).toMatchSnapshot();
  });
});
