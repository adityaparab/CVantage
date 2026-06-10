import { Types } from 'mongoose';

import { AppException } from '../common';
import { AiModelStatus, AiModelUsage, AuditAction } from '../database/schemas';

import { AdminModelsService } from './admin-models.service';
import { ModelKeyValidator } from './model-key-validator.service';

const actor = new Types.ObjectId();
const modelId = new Types.ObjectId();

const row = (over: Record<string, unknown> = {}) => ({
  _id: modelId,
  provider: 'openai',
  modelName: 'gpt-4o',
  apiKeyLast4: '3kF9',
  usages: [AiModelUsage.ANALYSIS],
  status: AiModelStatus.ACTIVE,
  ...over,
});

const make = (opts: { valid?: boolean; rows?: unknown[]; envKey?: string } = {}) => {
  const registry = {
    list: jest.fn().mockResolvedValue(opts.rows ?? [row()]),
    create: jest.fn(async (d: Record<string, unknown>) => ({ ...row(), ...d })),
    setStatus: jest.fn().mockResolvedValue(row()),
    setUsages: jest.fn().mockResolvedValue(row()),
    rotateKey: jest.fn().mockResolvedValue(row({ apiKeyLast4: 'ZZ77' })),
    remove: jest.fn().mockResolvedValue(true),
  };
  const validator = {
    validate: jest.fn(async () =>
      (opts.valid ?? true)
        ? { ok: true as const }
        : { ok: false as const, reason: 'Incorrect API key provided' },
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const svc = new AdminModelsService(
    registry as never,
    validator as never,
    { llm: { openaiApiKey: opts.envKey } } as never,
    audit as never,
  );
  return { svc, registry, validator, audit };
};

const input = {
  provider: 'openai',
  modelName: 'gpt-4o',
  apiKey: 'sk-test-abcd-3kF9',
  usages: [AiModelUsage.ANALYSIS],
};

describe('AdminModelsService (issue #55 / 6.4)', () => {
  it('create validates the key FIRST; invalid -> 422, nothing persisted', async () => {
    const { svc, registry } = make({ valid: false });
    const err = await svc.create(actor, input).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(422);
    expect((err as Error).message).toContain('Incorrect API key');
    expect(registry.create).not.toHaveBeenCalled();
  });

  it('valid create persists, audits last4 only - raw key never in audit meta', async () => {
    const { svc, audit } = make();
    await svc.create(actor, input);
    const meta = (audit.record.mock.calls[0]![0] as { meta: Record<string, unknown> }).meta;
    expect(meta.last4).toBe('3kF9');
    expect(JSON.stringify(meta)).not.toContain('sk-test-abcd');
  });

  it('duplicate provider/model -> 409', async () => {
    const { svc, registry } = make();
    registry.create.mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    const err = await svc.create(actor, input).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(409);
  });

  it('rotation validates against the existing provider/model and audits last4', async () => {
    const { svc, validator, audit } = make();
    await svc.rotateKey(actor, modelId, 'sk-new-key-ZZ77');
    expect(validator.validate).toHaveBeenCalledWith({
      provider: 'openai',
      modelName: 'gpt-4o',
      apiKey: 'sk-new-key-ZZ77',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.ADMIN_MODEL_KEY_ROTATE,
        meta: { last4: 'ZZ77' },
      }),
    );
  });

  it('delete guard: only-active + no env fallback -> 409 with orphaned usages', async () => {
    const { svc } = make({ envKey: undefined });
    const err = await svc.remove(actor, modelId).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(409);
    expect(
      ((err as AppException).getResponse() as { details: { orphanedUsages: string[] } }).details
        .orphanedUsages,
    ).toEqual([AiModelUsage.ANALYSIS]);
  });

  it('delete allowed when env fallback exists, another active model covers, or model is disabled', async () => {
    // env fallback present
    let ctx = make({ envKey: 'sk-env' });
    await expect(ctx.svc.remove(actor, modelId)).resolves.toBeUndefined();
    // another ACTIVE model covers via FALLBACK usage
    ctx = make({
      rows: [row(), row({ _id: new Types.ObjectId(), usages: [AiModelUsage.FALLBACK] })],
    });
    await expect(ctx.svc.remove(actor, modelId)).resolves.toBeUndefined();
    // target disabled -> no guard
    ctx = make({ rows: [row({ status: AiModelStatus.DISABLED })] });
    await expect(ctx.svc.remove(actor, modelId)).resolves.toBeUndefined();
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: AuditAction.ADMIN_MODEL_REMOVE }),
    );
  });

  it('update/rotate/remove on a missing model -> 404', async () => {
    const { svc, registry } = make({ rows: [] });
    registry.setStatus.mockResolvedValue(null);
    for (const op of [
      () => svc.update(actor, modelId, { status: AiModelStatus.DISABLED }),
      () => svc.rotateKey(actor, modelId, 'sk-whatever-1234'),
      () => svc.remove(actor, modelId),
    ]) {
      await expect(op()).rejects.toMatchObject({ status: 404 });
    }
  });
});

describe('ModelKeyValidator fake hook (issue #55 / 6.4)', () => {
  it('fake provider: accepts normal keys, rejects the !!BAD_KEY!! marker', async () => {
    const v = new ModelKeyValidator({ llm: { provider: 'fake' } } as never);
    expect((await v.validate({ provider: 'openai', modelName: 'x', apiKey: 'sk-ok' })).ok).toBe(
      true,
    );
    const bad = await v.validate({ provider: 'openai', modelName: 'x', apiKey: 'sk-!!BAD_KEY!!' });
    expect(bad.ok).toBe(false);
  });
});
