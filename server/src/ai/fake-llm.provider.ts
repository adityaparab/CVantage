import { Injectable } from '@nestjs/common';

import { AiModelUsage } from '../database/schemas/common';

import { LlmPrompt, LlmUsageStats, llmInvalidOutput, llmQuota, llmTimeout } from './llm.types';

/**
 * Deterministic LLM stand-in (decision D17; LLM_PROVIDER=fake).
 * Fixtures are keyed by usage; prompt markers trigger failure paths so the
 * whole pyramid (unit -> e2e) exercises error handling without a network.
 * Output is byte-identical across runs by construction (no randomness).
 */
@Injectable()
export class FakeLlmProvider {
  invoke(usage: AiModelUsage, prompt: LlmPrompt): { output: unknown; usage: LlmUsageStats } {
    const text = `${prompt.system}\n${prompt.user}`;
    if (text.includes('!!FAIL_TIMEOUT!!')) throw llmTimeout();
    if (text.includes('!!FAIL_QUOTA!!')) throw llmQuota('fake quota trigger');
    if (text.includes('!!FAIL_INVALID!!')) throw llmInvalidOutput('fake invalid trigger');
    return {
      output: this.fixture(usage, text),
      usage: this.tokenUsage(text),
    };
  }

  /** Deterministic token accounting: ~4 chars per token, fixed completion. */
  private tokenUsage(text: string): LlmUsageStats {
    const promptTokens = Math.ceil(text.length / 4);
    const completionTokens = 128;
    return { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens };
  }

  private fixture(usage: AiModelUsage, text: string): unknown {
    if (usage === AiModelUsage.RESUME_PARSING) return FAKE_PARSED_RESUME;
    if (text.includes('interview')) return FAKE_INTERVIEW_QUESTIONS;
    if (text.includes('suggestion')) return FAKE_SUGGESTIONS;
    return FAKE_COMPARISON;
  }
}

export const FAKE_PARSED_RESUME = {
  basics: {
    name: 'Ada Lovelace',
    label: 'Senior Software Engineer',
    email: 'ada@example.com',
    summary: 'Engineer with 10 years across analytical engines and compilers.',
  },
  work: [
    {
      name: 'Analytical Engines Ltd',
      position: 'Senior Engineer',
      startDate: '2020-01',
      summary: 'Led the difference-engine modernization.',
      highlights: ['Cut compute time 40%', 'Mentored 5 engineers'],
    },
  ],
  skills: [{ name: 'TypeScript', level: 'Expert', keywords: ['NestJS', 'React'] }],
};

export const FAKE_COMPARISON = {
  matchScore: 72,
  matchedSkills: ['TypeScript', 'NestJS', 'MongoDB'],
  missingSkills: ['Kubernetes', 'GraphQL'],
  experienceAlignment: 'Strong backend alignment; the role asks for more infrastructure exposure.',
  summary: 'Good fit on core stack; close the platform-tooling gap to be competitive.',
};

export const FAKE_SUGGESTIONS = {
  suggestions: [
    {
      group: 'ats_improvement',
      title: 'Mirror the job title',
      description: 'Use the exact phrase "Platform Engineer" in your label.',
      targetPath: 'basics.label',
      proposedValue: 'Senior Platform Engineer',
    },
    {
      group: 'skill_emphasis',
      title: 'Surface MongoDB earlier',
      description: 'Move MongoDB into your top-three skills list.',
      targetPath: 'skills.0.keywords',
      proposedValue: ['MongoDB', 'NestJS', 'React'],
    },
  ],
};

export const FAKE_INTERVIEW_QUESTIONS = {
  questions: [
    {
      question: 'Walk me through scaling a NestJS API that hit its event-loop ceiling.',
      focusArea: 'system design',
      rationale: 'JD emphasizes high-throughput services.',
    },
    {
      question: 'How would you model resume versioning in MongoDB?',
      focusArea: 'data modeling',
      rationale: 'Role owns the document store.',
    },
  ],
};
