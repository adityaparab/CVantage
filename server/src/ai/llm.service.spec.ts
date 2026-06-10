import { z } from 'zod';

import { AiModelUsage } from '../database/schemas/common';

import { FAKE_PARSED_RESUME, FakeLlmProvider } from './fake-llm.provider';
import { LlmService } from './llm.service';
import { LlmError } from './llm.types';

const schema = z.object({ answer: z.string() });
const prompt = { system: 'You are a test.', user: 'Say hi.' };

const registryWith = (resolved: Record<string, unknown>) => ({
  resolve: jest.fn().mockResolvedValue(resolved),
  markUsed: jest.fn().mockResolvedValue(undefined),
});

const config = (over: Record<string, unknown> = {}) =>
  ({
    llm: { provider: 'openai', timeoutMs: 5_000, maxRetries: 2, ...over },
    observability: { langfuse: {} },
  }) as never;

const RESOLVED = {
  provider: 'openai',
  modelName: 'gpt-4o',
  apiKey: 'sk-secret-key-XYZ',
  source: 'env',
};

/** Service with the ChatOpenAI layer replaced by a scripted structured runner. */
const makeService = (invokeImpl: jest.Mock, cfg = config(), registry = registryWith(RESOLVED)) => {
  class Stubbed extends LlmService {
    protected override buildChat(): never {
      return {
        withStructuredOutput: () => ({ invoke: invokeImpl }),
      } as never;
    }

    protected override backoff(): Promise<void> {
      return Promise.resolve(); // timing asserted separately
    }
  }
  return {
    svc: new Stubbed(registry as never, cfg, new FakeLlmProvider()),
    registry,
  };
};

const ok = (answer: string, tokens = { input_tokens: 11, output_tokens: 7, total_tokens: 18 }) => ({
  parsed: { answer },
  raw: { usage_metadata: tokens },
});

describe('LlmService (issue #39 / 4.2)', () => {
  it('returns validated output with token usage and provenance', async () => {
    const { svc, registry } = makeService(jest.fn().mockResolvedValue(ok('hi')));
    const r = await svc.invokeStructured(AiModelUsage.ANALYSIS, prompt, schema);
    expect(r.output).toEqual({ answer: 'hi' });
    expect(r.usage).toEqual({ promptTokens: 11, completionTokens: 7, totalTokens: 18 });
    expect(r).toMatchObject({ provider: 'openai', modelName: 'gpt-4o', source: 'env' });
    expect(registry.resolve).toHaveBeenCalledWith(AiModelUsage.ANALYSIS);
  });

  it('invalid output -> one repair retry (with instruction) -> success', async () => {
    const invoke = jest
      .fn()
      .mockResolvedValueOnce({ parsed: { wrong: true }, raw: {} })
      .mockResolvedValueOnce(ok('repaired'));
    const { svc } = makeService(invoke);
    const r = await svc.invokeStructured(AiModelUsage.ANALYSIS, prompt, schema);
    expect(r.output).toEqual({ answer: 'repaired' });
    expect(invoke).toHaveBeenCalledTimes(2);
    const secondSystem = (invoke.mock.calls[1] as unknown[][])[0]![0] as [string, string];
    expect(secondSystem[1]).toContain('Respond ONLY with JSON');
  });

  it('invalid output twice -> typed INVALID_OUTPUT, not retried further', async () => {
    const invoke = jest.fn().mockResolvedValue({ parsed: { wrong: true }, raw: {} });
    const { svc } = makeService(invoke);
    const err = await svc
      .invokeStructured(AiModelUsage.ANALYSIS, prompt, schema)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('INVALID_OUTPUT');
    expect(invoke).toHaveBeenCalledTimes(2); // repair only — INVALID is terminal
  });

  it('quota (429) is terminal: no further attempts', async () => {
    const invoke = jest
      .fn()
      .mockRejectedValue(Object.assign(new Error('rate limited'), { status: 429 }));
    const { svc } = makeService(invoke);
    const err = await svc
      .invokeStructured(AiModelUsage.ANALYSIS, prompt, schema)
      .catch((e: unknown) => e);
    expect((err as LlmError).code).toBe('QUOTA');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('auth failures are terminal and scrub the api key from messages', async () => {
    const invoke = jest
      .fn()
      .mockRejectedValue(
        Object.assign(new Error('Incorrect API key provided: sk-secret-key-XYZ'), { status: 401 }),
      );
    const { svc } = makeService(invoke);
    const err = (await svc
      .invokeStructured(AiModelUsage.ANALYSIS, prompt, schema)
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('AUTH');
    expect(err.message).not.toContain('sk-secret-key-XYZ');
  });

  it('transient provider errors retry up to the bound, then surface typed', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('connection reset'));
    const { svc } = makeService(invoke); // maxRetries 2 -> 3 attempts
    const err = (await svc
      .invokeStructured(AiModelUsage.ANALYSIS, prompt, schema)
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('PROVIDER');
    expect(invoke).toHaveBeenCalledTimes(3);
  });

  it('recovers when a retry succeeds', async () => {
    const invoke = jest
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValueOnce(ok('second try'));
    const { svc } = makeService(invoke);
    const r = await svc.invokeStructured(AiModelUsage.ANALYSIS, prompt, schema);
    expect(r.output).toEqual({ answer: 'second try' });
  });

  it('per-call timeout maps to typed TIMEOUT', async () => {
    jest.useFakeTimers();
    const invoke = jest.fn(() => new Promise(() => undefined));
    const { svc } = makeService(invoke, config({ maxRetries: 0, timeoutMs: 1_000 }));
    const pending = svc
      .invokeStructured(AiModelUsage.ANALYSIS, prompt, schema)
      .catch((e: unknown) => e);
    await jest.advanceTimersByTimeAsync(1_001);
    const err = (await pending) as LlmError;
    jest.useRealTimers();
    expect(err.code).toBe('TIMEOUT');
  });

  it('backoff grows exponentially with jitter inside bounds', async () => {
    jest.useFakeTimers();
    const svc = new LlmService(registryWith(RESOLVED) as never, config(), new FakeLlmProvider());
    const calls: number[] = [];
    const spy = jest.spyOn(global, 'setTimeout');
    const p1 = (svc as never as { backoff(n: number): Promise<void> }).backoff(1);
    const p2 = (svc as never as { backoff(n: number): Promise<void> }).backoff(3);
    for (const call of spy.mock.calls) calls.push(call[1] as number);
    await jest.runAllTimersAsync();
    await Promise.all([p1, p2]);
    jest.useRealTimers();
    expect(calls[0]).toBeGreaterThanOrEqual(500);
    expect(calls[0]).toBeLessThan(750);
    expect(calls[1]).toBeGreaterThanOrEqual(2000);
    expect(calls[1]).toBeLessThan(2250);
  });
});

describe('FakeLlmProvider via LlmService (issue #39 / 4.2, D17)', () => {
  const fakeCfg = config({ provider: 'fake' });
  const parseSchema = z.looseObject({ basics: z.looseObject({ name: z.string() }) });

  it('routes to fixtures without touching the registry; byte-identical runs', async () => {
    const registry = registryWith(RESOLVED);
    const svc = new LlmService(registry as never, fakeCfg, new FakeLlmProvider());
    const a = await svc.invokeStructured(AiModelUsage.RESUME_PARSING, prompt, parseSchema);
    const b = await svc.invokeStructured(AiModelUsage.RESUME_PARSING, prompt, parseSchema);
    expect(JSON.stringify(a.output)).toBe(JSON.stringify(b.output));
    expect(a.output).toEqual(FAKE_PARSED_RESUME);
    expect(a.source).toBe('fake');
    expect(a.usage.totalTokens).toBeGreaterThan(0);
    expect(registry.resolve).not.toHaveBeenCalled();
  });

  it('failure triggers fire typed errors', async () => {
    const svc = new LlmService(registryWith(RESOLVED) as never, fakeCfg, new FakeLlmProvider());
    for (const [marker, code] of [
      ['!!FAIL_TIMEOUT!!', 'TIMEOUT'],
      ['!!FAIL_QUOTA!!', 'QUOTA'],
      ['!!FAIL_INVALID!!', 'INVALID_OUTPUT'],
    ] as const) {
      const err = (await svc
        .invokeStructured(AiModelUsage.ANALYSIS, { system: 's', user: marker }, schema)
        .catch((e: unknown) => e)) as LlmError;
      expect(err.code).toBe(code);
    }
  });
});
