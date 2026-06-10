import { ChatOpenAI } from '@langchain/openai';
import { Injectable } from '@nestjs/common';

import { AppConfigService } from '../config';

/**
 * Live key validation (issue #55 / 6.4): a 1-token ping before any key is
 * stored. Under LLM_PROVIDER=fake the network is skipped and the magic
 * marker !!BAD_KEY!! simulates provider rejection for tests.
 */
@Injectable()
export class ModelKeyValidator {
  constructor(private readonly config: AppConfigService) {}

  async validate(opts: {
    provider: string;
    modelName: string;
    apiKey: string;
  }): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (this.config.llm.provider === 'fake') {
      return opts.apiKey.includes('!!BAD_KEY!!')
        ? { ok: false, reason: 'Incorrect API key provided (simulated)' }
        : { ok: true };
    }
    try {
      const chat = new ChatOpenAI({
        model: opts.modelName,
        apiKey: opts.apiKey,
        maxTokens: 1,
        maxRetries: 0,
        configuration: this.config.llm.openaiBaseUrl
          ? { baseURL: this.config.llm.openaiBaseUrl }
          : undefined,
      });
      await chat.invoke('ping');
      return { ok: true };
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      return { ok: false, reason: raw.split(opts.apiKey).join('[redacted]').slice(0, 300) };
    }
  }
}
