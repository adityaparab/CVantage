import { Types } from 'mongoose';

import { FakeLlmProvider } from '../ai/fake-llm.provider';
import { LlmService } from '../ai/llm.service';
import { AnalysisStepKey } from '../database/schemas';
import { ProgressBusService } from '../events';

import { AnalysisPipelineService } from './analysis-pipeline.service';
import { resolveFieldRef } from './field-ref';

const fakeLlm = () =>
  new LlmService(
    { resolve: jest.fn(), markUsed: jest.fn() } as never,
    {
      llm: { provider: 'fake', timeoutMs: 5000, maxRetries: 0 },
      observability: { langfuse: {} },
    } as never,
    new FakeLlmProvider(),
  );

const updateRecorder = () => {
  const calls: Array<{ filter: Record<string, unknown>; update: Record<string, unknown> }> = [];
  return {
    calls,
    updateOne: jest.fn((filter: Record<string, unknown>, update: Record<string, unknown>) => {
      calls.push({ filter, update });
      return { exec: jest.fn().mockResolvedValue({ modifiedCount: 1 }) };
    }),
  };
};

const SNAPSHOT = {
  basics: { name: 'Ada Lovelace', label: 'Senior Software Engineer' },
  work: [{ name: 'Analytical Engines Ltd', highlights: ['Cut compute time 40%'] }],
  skills: [{ name: 'TypeScript', keywords: ['NestJS', 'React'] }],
};

const job = (jd = 'A perfectly reasonable job description for a platform engineer role.') =>
  ({
    _id: new Types.ObjectId(),
    userId: new Types.ObjectId(),
    resumeId: new Types.ObjectId(),
    jobDescription: jd,
    resumeSnapshot: SNAPSHOT,
    steps: Object.values(AnalysisStepKey).map((key) => ({ key, status: 'pending' })),
  }) as never;

const make = (jd?: string) => {
  const analyses = updateRecorder();
  const resumes = updateRecorder();
  const bus = new ProgressBusService();
  const events: Array<{ status: string; step?: string }> = [];
  bus.subscribeAll((e) => events.push(e as never));
  const svc = new AnalysisPipelineService(
    analyses as never,
    resumes as never,
    fakeLlm(),
    { createRunner: jest.fn() } as never,
    bus,
    { llm: { maxTokensAnalysis: 4096 } } as never,
  );
  return { svc, analyses, resumes, events, theJob: job(jd) };
};

const sets = (rec: ReturnType<typeof updateRecorder>) =>
  rec.calls.map((c) => c.update.$set as Record<string, unknown>).filter(Boolean);

describe('AnalysisPipelineService (issue #42 / 4.5)', () => {
  it('runs all 3 steps sequentially to completed with incremental results', async () => {
    const { svc, analyses, resumes, events, theJob } = make();
    await svc.execute(theJob);
    const all = sets(analyses);
    expect(all.find((s) => s['result.overallScore'] !== undefined)).toMatchObject({
      'result.overallScore': 72,
      'result.atsScore': 64,
    });
    expect(all.find((s) => s['result.projectScore'] !== undefined)).toBeDefined();
    expect(all.find((s) => s['result.interviewQuestions'] !== undefined)).toBeDefined();
    const final = all.find((s) => s.status === 'completed')!;
    expect(final.modelUsed).toBe('fake/fake-fixture');
    expect(final.durationMs as number).toBeGreaterThanOrEqual(0);
    expect(sets(resumes).find((s) => s.analysisStatus === 'completed')).toMatchObject({
      analysisStatus: 'completed',
    });
    const stepEvents = events.filter((e) => e.status === 'step_completed').map((e) => e.step);
    expect(stepEvents).toEqual(Object.values(AnalysisStepKey));
  });

  it('hallucinated fieldRefs are dropped; real ones persist', async () => {
    const { svc, analyses, theJob } = make();
    await svc.execute(theJob);
    const suggestionWrite = sets(analyses).find((s) => s['result.suggestions'] !== undefined)!;
    const suggestions = suggestionWrite['result.suggestions'] as Array<{ fieldRef: string }>;
    const refs = suggestions.map((s) => s.fieldRef);
    expect(refs).toContain('basics.label');
    expect(refs).toContain('work[0].highlights');
    expect(refs).toContain('projects'); // allowed new-section target
    expect(refs).not.toContain('totally.fake[9].path'); // fixture's poisoned ref
  });

  it('step-2 failure keeps step-1 data, fails the analysis and the rollup', async () => {
    const { svc, analyses, resumes, theJob } = make(
      'This JD contains !!FAIL_SUGGESTIONS!! so step two dies.',
    );
    const err = await svc.execute(theJob).catch((e: unknown) => e);
    expect((err as { code?: string }).code).toBe('QUOTA');
    const all = sets(analyses);
    expect(all.find((s) => s['result.overallScore'] !== undefined)).toBeDefined(); // step 1 intact
    expect(all.find((s) => s['result.suggestions'] !== undefined)).toBeUndefined();
    expect(all.find((s) => s['steps.1.status'] === 'failed')).toBeDefined();
    expect(all.find((s) => s.status === 'completed')).toBeUndefined();
    expect(sets(resumes).at(-1)).toMatchObject({ analysisStatus: 'failed' });
  });

  it('works exclusively off the snapshot (prompts embed it; no resume reads)', async () => {
    const { svc, resumes, theJob } = make();
    await svc.execute(theJob);
    // the resumes model only ever receives rollup updateOnes — never finds
    expect((resumes as { updateOne: jest.Mock }).updateOne).toHaveBeenCalled();
    expect(Object.keys(resumes)).not.toContain('findOne');
  });
});

describe('resolveFieldRef (issue #42 / 4.5)', () => {
  it('resolves dot + bracket paths against the snapshot', () => {
    expect(resolveFieldRef(SNAPSHOT, 'basics.label')).toBe(true);
    expect(resolveFieldRef(SNAPSHOT, 'work[0].highlights')).toBe(true);
    expect(resolveFieldRef(SNAPSHOT, 'skills[0].keywords')).toBe(true);
  });

  it('rejects out-of-range indexes, unknown paths and junk', () => {
    expect(resolveFieldRef(SNAPSHOT, 'work[5].highlights')).toBe(false);
    expect(resolveFieldRef(SNAPSHOT, 'basics.nonexistent.deep')).toBe(false);
    expect(resolveFieldRef(SNAPSHOT, 'a;rm -rf /')).toBe(false);
    expect(resolveFieldRef(SNAPSHOT, '')).toBe(false);
  });

  it('allows new-section targets one level deep (projects) but not invented roots', () => {
    expect(resolveFieldRef(SNAPSHOT, 'projects')).toBe(true);
    expect(resolveFieldRef(SNAPSHOT, 'totally')).toBe(false);
  });
});
