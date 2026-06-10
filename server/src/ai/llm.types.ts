import { AiModelUsage } from '../database/schemas/common';

export interface LlmUsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmPrompt {
  system: string;
  user: string;
}

export interface StructuredResult<T> {
  output: T;
  usage: LlmUsageStats;
  provider: string;
  modelName: string;
  source: 'db' | 'env' | 'fake';
}

export interface InvokeOptions {
  timeoutMs?: number;
  maxRetries?: number;
}

export type LlmErrorCode = 'TIMEOUT' | 'QUOTA' | 'AUTH' | 'INVALID_OUTPUT' | 'PROVIDER';

/** Base typed LLM failure. Messages are scrubbed — never contain API keys. */
export class LlmError extends Error {
  constructor(
    readonly code: LlmErrorCode,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = `Llm${code
      .toLowerCase()
      .replace(/(^|_)([a-z])/g, (_m, _p, c: string) => c.toUpperCase())}Error`;
  }
}

export const llmTimeout = () => new LlmError('TIMEOUT', 'LLM call timed out', true);
export const llmQuota = (detail: string) =>
  new LlmError('QUOTA', `LLM quota/rate limit: ${detail}`, false);
export const llmAuth = () =>
  new LlmError('AUTH', 'LLM authentication failed - check the configured API key', false);
export const llmInvalidOutput = (detail: string) =>
  new LlmError(
    'INVALID_OUTPUT',
    `LLM returned output that failed schema validation: ${detail}`,
    false,
  );
export const llmProvider = (detail: string) =>
  new LlmError('PROVIDER', `LLM provider error: ${detail}`, true);

export { AiModelUsage };
