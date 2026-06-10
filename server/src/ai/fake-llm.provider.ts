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
    // step-scoped failures: only fire when THIS call is for the named step
    const step = this.stepOf(usage, text);
    if (text.includes('!!FAIL_COMPARE!!') && step === 'compare')
      throw llmQuota('fake compare failure');
    if (text.includes('!!FAIL_SUGGESTIONS!!') && step === 'suggestions')
      throw llmQuota('fake suggestions failure');
    if (text.includes('!!FAIL_QUESTIONS!!') && step === 'questions')
      throw llmQuota('fake questions failure');
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

  private stepOf(
    usage: AiModelUsage,
    text: string,
  ): 'parse' | 'compare' | 'suggestions' | 'questions' {
    if (usage === AiModelUsage.RESUME_PARSING) return 'parse';
    if (text.includes('interview')) return 'questions';
    if (text.includes('suggestion')) return 'suggestions';
    return 'compare';
  }

  private fixture(usage: AiModelUsage, text: string): unknown {
    const step = this.stepOf(usage, text);
    if (step === 'parse') return FAKE_PARSED_RESUME;
    if (step === 'questions') return FAKE_INTERVIEW_QUESTIONS;
    if (step === 'suggestions') return FAKE_SUGGESTIONS;
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
  overallScore: 72,
  atsScore: 64,
  strongPoints: ['Deep NestJS and MongoDB experience', 'Clear measurable impact statements'],
  weakPoints: ['No infrastructure/Kubernetes exposure listed'],
  matchingSkills: ['TypeScript', 'NestJS', 'MongoDB'],
  skillGaps: ['Kubernetes', 'GraphQL'],
};

export const FAKE_SUGGESTIONS = {
  projectScore: 58,
  suggestions: [
    {
      group: 'ats_improvement',
      fieldRef: 'basics.label',
      title: 'Mirror the job title',
      description: 'Use the exact phrase from the JD in your professional label.',
      proposedValue: 'Senior Platform Engineer',
    },
    {
      group: 'skill_emphasis',
      fieldRef: 'skills[0].keywords',
      title: 'Surface MongoDB earlier',
      description: 'Move MongoDB into your top-three keywords for this skill.',
      proposedValue: 'MongoDB, NestJS, React',
    },
    {
      group: 'wording',
      fieldRef: 'work[0].highlights',
      title: 'Quantify the modernization win',
      description: 'Lead the first highlight with the 40% compute-time reduction.',
      proposedValue: 'Cut compute time 40% by modernizing the difference engine',
    },
    {
      group: 'project',
      fieldRef: 'projects',
      title: 'Add a platform-tooling project',
      description: 'A small Kubernetes side project would close the biggest gap.',
    },
    {
      group: 'ats_improvement',
      fieldRef: 'totally.fake[9].path',
      title: 'Hallucinated target (must be dropped)',
      description: 'This suggestion points nowhere and must not be persisted.',
    },
  ],
};

export const FAKE_INTERVIEW_QUESTIONS = {
  questions: [
    {
      question: 'Walk me through scaling a NestJS API that hit its event-loop ceiling.',
      suggestedAnswer:
        'Profile first (clinic.js), move CPU work off the loop, add backpressure, then scale horizontally behind a queue.',
    },
    {
      question: 'How would you model resume versioning in MongoDB?',
      suggestedAnswer:
        'Optimistic concurrency on the live doc plus immutable snapshots for derived artifacts like analyses.',
    },
  ],
};
