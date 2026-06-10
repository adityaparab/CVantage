import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { CallbackHandler } from 'langfuse-langchain';
import { ZodType } from 'zod';

import { AppConfigService } from '../config';
import { AiModelUsage } from '../database/schemas/common';
import { withSpan } from '../observability/otel';

import { AiModelsService, ResolvedModel } from './ai-models.service';
import { FakeLlmProvider } from './fake-llm.provider';
import {
  InvokeOptions,
  LlmError,
  LlmPrompt,
  LlmUsageStats,
  StructuredResult,
  llmAuth,
  llmInvalidOutput,
  llmProvider,
  llmQuota,
  llmTimeout,
} from './llm.types';

/** Bump when prompts change materially - lands in trace metadata. */
export const PROMPT_VERSION = 'v1';

const MAX_USER_PROMPT_CHARS = 260_000; // JD 50k + resume 200k + fencing slack

const REPAIR_INSTRUCTION =
  '\n\nIMPORTANT: your previous reply was not valid for the required schema. ' +
  'Respond ONLY with JSON that exactly matches the schema. No prose, no markdown fences.';

/**
 * The single chokepoint for every LLM call (issue #39 / 4.2, CLAUDE.md:
 * langchain + langchain-openai). Resolution via the model registry (#38),
 * structured output via zod, bounded retries with backoff+jitter, per-call
 * timeout, one schema-repair retry, typed errors, token usage surfaced.
 * LLM_PROVIDER=fake routes to deterministic fixtures (D17).
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  /** Langfuse handler only when configured - otherwise empty (zero overhead). */
  private readonly callbacks: CallbackHandler[];

  constructor(
    private readonly registry: AiModelsService,
    private readonly config: AppConfigService,
    private readonly fake: FakeLlmProvider,
  ) {
    const lf = this.config.observability.langfuse;
    this.callbacks =
      lf.publicKey && lf.secretKey
        ? [
            new CallbackHandler({
              publicKey: lf.publicKey,
              secretKey: lf.secretKey,
              baseUrl: lf.host,
            }),
          ]
        : [];
  }

  async invokeStructured<T>(
    usage: AiModelUsage,
    prompt: LlmPrompt,
    schema: ZodType<T>,
    opts: InvokeOptions = {},
  ): Promise<StructuredResult<T>> {
    if (prompt.user.length > MAX_USER_PROMPT_CHARS) {
      throw llmProvider('input exceeds the configured size limits');
    }
    if (this.config.llm.provider === 'fake') {
      const fake = this.fake.invoke(usage, prompt);
      const parsed = schema.safeParse(fake.output);
      if (!parsed.success) throw llmInvalidOutput(parsed.error.message.slice(0, 300));
      return {
        output: parsed.data,
        usage: fake.usage,
        provider: 'fake',
        modelName: 'fake-fixture',
        source: 'fake',
      };
    }

    const resolved = await this.registry.resolve(usage);
    const timeoutMs = opts.timeoutMs ?? this.config.llm.timeoutMs;
    const maxRetries = opts.maxRetries ?? this.config.llm.maxRetries;

    let lastError: LlmError = llmProvider('no attempts made');
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      if (attempt > 0) await this.backoff(attempt);
      try {
        const result = await withSpan(
          'llm.invoke',
          { 'llm.provider': resolved.provider, 'llm.model': resolved.modelName, 'llm.usage': String(usage) },
          async (span) => {
            const r = await this.withTimeout(
              this.attemptStructured(resolved, prompt, schema, opts),
              timeoutMs,
            );
            // token counts only - never prompt content
            span.setAttributes({
              'llm.tokens.prompt': r.usage.promptTokens,
              'llm.tokens.completion': r.usage.completionTokens,
            });
            return r;
          },
        );
        if (resolved.source === 'db') {
          void this.registry.markUsed(resolved.provider, resolved.modelName).catch(() => undefined);
        }
        return {
          ...result,
          provider: resolved.provider,
          modelName: resolved.modelName,
          source: resolved.source,
        };
      } catch (err) {
        lastError = this.classify(err, resolved.apiKey);
        this.logger.warn(
          `llm attempt ${attempt + 1}/${maxRetries + 1} failed: ${lastError.code} ${lastError.message}`,
        );
        if (!lastError.retryable) throw lastError;
      }
    }
    throw lastError;
  }

  /** One model call; on schema-invalid output, exactly one repair retry. */
  private async attemptStructured<T>(
    resolved: ResolvedModel,
    prompt: LlmPrompt,
    schema: ZodType<T>,
    opts: InvokeOptions = {},
  ): Promise<{ output: T; usage: LlmUsageStats }> {
    const chat = this.buildChat(resolved, opts.maxTokens);
    const callOptions = {
      metadata: { promptVersion: PROMPT_VERSION, source: resolved.source, ...opts.metadata },
      callbacks: this.callbacks,
    };
    const structured = chat.withStructuredOutput<Record<string, unknown>>(schema as never, {
      includeRaw: true,
    });
    const first = await structured.invoke(
      [
        ['system', prompt.system],
        ['human', prompt.user],
      ],
      callOptions,
    );
    const validated = schema.safeParse(first.parsed);
    if (validated.success) {
      return { output: validated.data, usage: this.extractUsage(first.raw) };
    }
    const second = await structured.invoke(
      [
        ['system', prompt.system + REPAIR_INSTRUCTION],
        ['human', prompt.user],
      ],
      callOptions,
    );
    const repaired = schema.safeParse(second.parsed);
    if (repaired.success) {
      return { output: repaired.data, usage: this.extractUsage(second.raw) };
    }
    throw llmInvalidOutput(repaired.error.message.slice(0, 300));
  }

  protected buildChat(resolved: ResolvedModel, maxTokens?: number): ChatOpenAI {
    return new ChatOpenAI({
      model: resolved.modelName,
      apiKey: resolved.apiKey,
      maxTokens,
      maxRetries: 0, // retries are ours: typed + bounded + observable
      configuration: resolved.baseURL ? { baseURL: resolved.baseURL } : undefined,
    });
  }

  private extractUsage(raw: unknown): LlmUsageStats {
    const meta =
      (
        raw as {
          usage_metadata?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
        }
      )?.usage_metadata ?? {};
    const promptTokens = meta.input_tokens ?? 0;
    const completionTokens = meta.output_tokens ?? 0;
    return {
      promptTokens,
      completionTokens,
      totalTokens: meta.total_tokens ?? promptTokens + completionTokens,
    };
  }

  /** Map provider/runtime failures to typed, scrubbed errors. */
  private classify(err: unknown, apiKey: string): LlmError {
    if (err instanceof LlmError) return err;
    const raw = err instanceof Error ? err.message : String(err);
    const msg = this.scrub(raw, apiKey);
    const status = (err as { status?: number; code?: string }).status;
    if (status === 429 || /quota|rate.?limit/i.test(msg)) return llmQuota(msg.slice(0, 200));
    if (status === 401 || status === 403 || /api.?key|unauthorized|authentication/i.test(msg)) {
      return llmAuth();
    }
    if (/abort|timed?.?out/i.test(msg)) return llmTimeout();
    return llmProvider(msg.slice(0, 300));
  }

  private scrub(message: string, apiKey: string): string {
    return apiKey ? message.split(apiKey).join('[redacted]') : message;
  }

  private async withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(llmTimeout()), ms);
      timer.unref();
    });
    try {
      return await Promise.race([work, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Exponential backoff with jitter: 500ms · 2^(n-1) + [0..250)ms. */
  protected backoff(attempt: number): Promise<void> {
    const ms = 500 * 2 ** (attempt - 1) + Math.random() * 250;
    return new Promise((resolve) => {
      setTimeout(resolve, ms).unref();
    });
  }
}
