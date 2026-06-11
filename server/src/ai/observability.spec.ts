import { Types } from 'mongoose';
import { z } from 'zod';

import { AnalysesService } from '../analyses/analyses.service';
import { AnalysisPipelineService } from '../analyses/analysis-pipeline.service';
import { AppException } from '../common';
import { AnalysisStepKey } from '../database/schemas';
import { ProgressBusService } from '../events';

import { AnonymizationService } from './anonymize.service';
import { FakeLlmProvider } from './fake-llm.provider';
import { LlmService, PROMPT_VERSION } from './llm.service';

jest.mock('langfuse-langchain', () => ({
  CallbackHandler: jest.fn().mockImplementation(() => ({ name: 'langfuse-mock' })),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { CallbackHandler } = require('langfuse-langchain') as { CallbackHandler: jest.Mock };

const schema = z.object({ answer: z.string() });
const prompt = { system: 'sys', user: 'usr' };
const RESOLVED = { provider: 'openai', modelName: 'gpt-4o', apiKey: 'sk-x', source: 'env' };

const cfg = (langfuse: Record<string, string | undefined> = {}) =>
  ({
    llm: { provider: 'openai', timeoutMs: 5000, maxRetries: 0 },
    observability: { langfuse },
  }) as never;

const registry = () =>
  ({ resolve: jest.fn().mockResolvedValue(RESOLVED), markUsed: jest.fn() }) as never;

describe('LLM observability gating (issue #44 / 4.7)', () => {
  beforeEach(() => CallbackHandler.mockClear());

  it('no LANGFUSE_* config -> handler never constructed, zero callbacks', () => {
    const svc = new LlmService(registry(), cfg(), new FakeLlmProvider());
    expect(CallbackHandler).not.toHaveBeenCalled();
    expect((svc as unknown as { callbacks: unknown[] }).callbacks).toEqual([]);
  });

  it('with keys -> exactly one handler with the configured host', () => {
    new LlmService(
      registry(),
      cfg({ publicKey: 'pk', secretKey: 'sk', host: 'https://lf.example' }),
      new FakeLlmProvider(),
    );
    expect(CallbackHandler).toHaveBeenCalledTimes(1);
    expect(CallbackHandler).toHaveBeenCalledWith({
      publicKey: 'pk',
      secretKey: 'sk',
      baseUrl: 'https://lf.example',
    });
  });

  it('per-call options carry metadata (prompt version + custom) and maxTokens reaches the chat', async () => {
    const invoke = jest.fn().mockResolvedValue({
      parsed: { answer: 'hi' },
      raw: { usage_metadata: { input_tokens: 5, output_tokens: 3, total_tokens: 8 } },
    });
    const seenChatArgs: Array<number | undefined> = [];
    class Probe extends LlmService {
      protected override buildChat(_r: never, maxTokens?: number): never {
        seenChatArgs.push(maxTokens);
        return { withStructuredOutput: () => ({ invoke }) } as never;
      }
    }
    const svc = new Probe(registry(), cfg(), new FakeLlmProvider());
    await svc.invokeStructured('analysis' as never, prompt, schema, {
      maxTokens: 1234,
      metadata: { usage: 'analysis', step: 'compare_resume_jd' },
    });
    expect(seenChatArgs).toEqual([1234]);
    const options = (invoke.mock.calls[0] as unknown[])[1] as {
      metadata: Record<string, string>;
      callbacks: unknown[];
    };
    expect(options.metadata).toMatchObject({
      promptVersion: PROMPT_VERSION,
      usage: 'analysis',
      step: 'compare_resume_jd',
      source: 'env',
    });
    expect(options.callbacks).toEqual([]); // observability off -> nothing attached
  });

  it('oversized input is rejected before any network call', async () => {
    const svc = new LlmService(registry(), cfg(), new FakeLlmProvider());
    const err = await svc
      .invokeStructured('analysis' as never, { system: 's', user: 'x'.repeat(260_001) }, schema)
      .catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('PROVIDER');
    expect((err as Error).message).toMatch(/size limits/);
  });
});

describe('per-user analysis concurrency guard (issue #44 / 4.7)', () => {
  const chain = (r: unknown) => ({ exec: jest.fn().mockResolvedValue(r) });
  const make = (running: number) =>
    new AnalysesService(
      {
        countDocuments: jest.fn(() => chain(running)),
        create: jest.fn(async (d: Record<string, unknown>) => ({
          ...d,
          _id: new Types.ObjectId(),
        })),
        findOne: jest.fn(() => chain(null)),
      } as never,
      {
        findOne: jest.fn(() => chain({ toObject: () => ({ jsonResume: { a: 1 } }) })),
        updateOne: jest.fn(() => chain({})),
      } as never,
      { updateOne: jest.fn(() => chain({})) } as never,
      { llm: { userConcurrency: 2 } } as never,
    );
  const input = {
    name: 'n',
    jobDescription: 'x'.repeat(40),
    resumeId: new Types.ObjectId(),
  };

  it('third concurrent analysis -> 429 with a clear message', async () => {
    const err = await make(2)
      .create(new Types.ObjectId(), input)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getStatus()).toBe(429);
    expect((err as Error).message).toMatch(/wait for one to finish/i);
  });

  it('under the limit -> proceeds (per-user scope keeps others unaffected)', async () => {
    const svc = make(1);
    await expect(svc.create(new Types.ObjectId(), input)).resolves.toBeDefined();
  });
});

describe('token rollups (issue #44 / 4.7)', () => {
  it('analysis pipeline $incs tokensUsed once per step (3 steps)', async () => {
    // covered structurally: AnalysisPipelineService.addTokens is invoked per
    // step; asserted via the pipeline spec's update recorder below.
    const calls: Array<Record<string, unknown>> = [];
    const analyses = {
      updateOne: jest.fn((_f: Record<string, unknown>, u: Record<string, unknown>) => {
        calls.push(u);
        return chainOk();
      }),
    };
    const resumes = { updateOne: jest.fn(() => chainOk()) };
    const llm = new LlmService(
      registry(),
      {
        llm: { provider: 'fake', timeoutMs: 5000, maxRetries: 0 },
        observability: { langfuse: {} },
      } as never,
      new FakeLlmProvider(),
    );
    const svc = new AnalysisPipelineService(
      analyses as never,
      resumes as never,
      llm,
      new AnonymizationService(),
      { createRunner: jest.fn() } as never,
      new ProgressBusService(),
      { llm: { maxTokensAnalysis: 4096 } } as never,
    );
    await svc.execute({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(),
      resumeId: new Types.ObjectId(),
      jobDescription: 'a fine job description for this test case',
      resumeSnapshot: { basics: { name: 'A' } },
      steps: Object.values(AnalysisStepKey).map((key) => ({ key, status: 'pending' })),
    } as never);
    const tokenIncs = calls.filter(
      (u) => (u.$inc as Record<string, unknown>)?.['tokensUsed.totalTokens'] !== undefined,
    );
    expect(tokenIncs).toHaveLength(3);
  });
});

const chainOk = () => ({ exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) });
