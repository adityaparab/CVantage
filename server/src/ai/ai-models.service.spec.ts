import { randomBytes } from 'node:crypto';

import { Types } from 'mongoose';

import { AiModelStatus, AiModelUsage } from '../database/schemas/common';

import { AiModelsService, NoModelAvailableError } from './ai-models.service';
import { CryptoService } from './crypto.service';

const crypto = new CryptoService({
  crypto: { masterKeyBase64: randomBytes(32).toString('base64') },
} as never);

type Row = {
  provider: string;
  modelName: string;
  apiKeyEncrypted: string;
  apiKeyLast4: string;
  usages: AiModelUsage[];
  status: AiModelStatus;
  updatedAt: Date;
};

/** Tiny in-memory stand-in honoring the exact query shapes the service uses. */
const fakeModel = (rows: Row[]) => {
  const matches = (row: Row, q: Record<string, unknown>) =>
    Object.entries(q).every(([k, v]) =>
      k === 'usages' ? row.usages.includes(v as AiModelUsage) : row[k as keyof Row] === v,
    );
  const chain = (result: unknown) => ({
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  });
  return {
    rows,
    create: jest.fn(async (doc: Row) => ({ ...doc, _id: new Types.ObjectId() })),
    findOne: jest.fn((q: Record<string, unknown>) => {
      const hits = rows
        .filter((r) => matches(r, q))
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return chain(hits[0] ?? null);
    }),
    find: jest.fn(() => chain(rows)),
    findByIdAndUpdate: jest.fn(() => chain(null)),
    deleteOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) })),
    updateOne: jest.fn(() => ({ exec: jest.fn().mockResolvedValue({}) })),
  };
};

const env = (apiKey?: string) =>
  ({
    llm: {
      provider: 'openai',
      openaiApiKey: apiKey,
      openaiBaseUrl: undefined,
      parsingModel: 'gpt-4o-mini',
      analysisModel: 'gpt-4o',
    },
  }) as never;

const row = (over: Partial<Row>): Row => ({
  provider: 'openai',
  modelName: 'db-model',
  apiKeyEncrypted: crypto.encrypt('sk-db-key-9999'),
  apiKeyLast4: '9999',
  usages: [AiModelUsage.ANALYSIS],
  status: AiModelStatus.ACTIVE,
  updatedAt: new Date('2026-01-01'),
  ...over,
});

describe('AiModelsService resolution matrix (issue #38 / 4.1)', () => {
  it('prefers the ACTIVE db model for the usage and decrypts its key', async () => {
    const svc = new AiModelsService(fakeModel([row({})]) as never, crypto, env('sk-env'));
    const r = await svc.resolve(AiModelUsage.ANALYSIS);
    expect(r).toMatchObject({ source: 'db', modelName: 'db-model', apiKey: 'sk-db-key-9999' });
  });

  it('skips DISABLED models and falls through to env', async () => {
    const svc = new AiModelsService(
      fakeModel([row({ status: AiModelStatus.DISABLED })]) as never,
      crypto,
      env('sk-env-key'),
    );
    const r = await svc.resolve(AiModelUsage.ANALYSIS);
    expect(r).toMatchObject({ source: 'env', modelName: 'gpt-4o', apiKey: 'sk-env-key' });
  });

  it('uses the FALLBACK-usage db model before env', async () => {
    const svc = new AiModelsService(
      fakeModel([row({ usages: [AiModelUsage.FALLBACK], modelName: 'fb-model' })]) as never,
      crypto,
      env('sk-env'),
    );
    const r = await svc.resolve(AiModelUsage.RESUME_PARSING);
    expect(r).toMatchObject({ source: 'db', modelName: 'fb-model' });
  });

  it('env fallback picks the per-usage model name', async () => {
    const svc = new AiModelsService(fakeModel([]) as never, crypto, env('sk-env'));
    expect((await svc.resolve(AiModelUsage.RESUME_PARSING)).modelName).toBe('gpt-4o-mini');
    expect((await svc.resolve(AiModelUsage.ANALYSIS)).modelName).toBe('gpt-4o');
  });

  it('no db model and no env key → typed 503', async () => {
    const svc = new AiModelsService(fakeModel([]) as never, crypto, env(undefined));
    await expect(svc.resolve(AiModelUsage.ANALYSIS)).rejects.toThrow(NoModelAvailableError);
  });

  it('newest updatedAt wins among multiple matches', async () => {
    const svc = new AiModelsService(
      fakeModel([
        row({ modelName: 'older', updatedAt: new Date('2025-01-01') }),
        row({ modelName: 'newer', updatedAt: new Date('2026-02-02') }),
      ]) as never,
      crypto,
      env('sk-env'),
    );
    expect((await svc.resolve(AiModelUsage.ANALYSIS)).modelName).toBe('newer');
  });
});

describe('AiModelsService write paths (issue #38 / 4.1)', () => {
  it('create encrypts the key and stores only last4 in the clear', async () => {
    const m = fakeModel([]);
    const svc = new AiModelsService(m as never, crypto, env('x'));
    await svc.create({
      modelName: 'gpt-4o',
      provider: 'openai',
      apiKey: 'sk-live-abcd-3kF9',
      usages: [AiModelUsage.ANALYSIS],
      addedBy: new Types.ObjectId(),
    });
    const stored = m.create.mock.calls[0]![0] as Row;
    expect(stored.apiKeyEncrypted).not.toContain('sk-live');
    expect(crypto.decrypt(stored.apiKeyEncrypted)).toBe('sk-live-abcd-3kF9');
    expect(stored.apiKeyLast4).toBe('3kF9');
  });

  it('rotateKey re-encrypts and updates the mask', async () => {
    const m = fakeModel([]);
    const svc = new AiModelsService(m as never, crypto, env('x'));
    await svc.rotateKey(new Types.ObjectId(), 'sk-rotated-ZZ77');
    const update = (m.findByIdAndUpdate.mock.calls[0] as unknown[])[1] as {
      $set: { apiKeyEncrypted: string; apiKeyLast4: string };
    };
    expect(crypto.decrypt(update.$set.apiKeyEncrypted)).toBe('sk-rotated-ZZ77');
    expect(update.$set.apiKeyLast4).toBe('ZZ77');
  });
});
