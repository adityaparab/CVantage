import { Types } from 'mongoose';

import { AppException } from '../common';
import { AnalysisStatus } from '../database/schemas';

import { AnalysesService } from './analyses.service';
import { FieldRefApplyError, applyAtFieldRef } from './field-ref';

describe('applyAtFieldRef deep-path table (issue #43 / 4.6)', () => {
  const base = () => ({
    basics: { name: 'Ada', label: 'Engineer', location: { city: 'London' } },
    work: [
      { name: 'A', highlights: ['one', 'two'] },
      { name: 'B', highlights: [] },
    ],
    skills: [{ name: 'TS', keywords: ['NestJS'] }],
  });

  it('scalar replace: basics.label', () => {
    const doc = base();
    expect(applyAtFieldRef(doc, 'basics.label', 'Platform Engineer')).toBe('set');
    expect(doc.basics.label).toBe('Platform Engineer');
    expect(doc.basics.name).toBe('Ada'); // neighbors untouched
    expect(doc.work).toEqual(base().work);
  });

  it('nested object leaf: basics.location.city', () => {
    const doc = base();
    applyAtFieldRef(doc, 'basics.location.city', 'Cambridge');
    expect(doc.basics.location.city).toBe('Cambridge');
  });

  it('array element replace: work[0].highlights[1]', () => {
    const doc = base();
    expect(applyAtFieldRef(doc, 'work[0].highlights[1]', 'rewritten')).toBe('set');
    expect(doc.work[0]!.highlights).toEqual(['one', 'rewritten']);
    expect(doc.work[1]!.highlights).toEqual([]);
  });

  it('array append: work[1].highlights (ref resolves to the array)', () => {
    const doc = base();
    expect(applyAtFieldRef(doc, 'work[1].highlights', 'fresh highlight')).toBe('appended');
    expect(doc.work[1]!.highlights).toEqual(['fresh highlight']);
    expect(doc.work[0]!.highlights).toHaveLength(2);
  });

  it('creates a missing leaf when the parent exists (basics.summary)', () => {
    const doc = base();
    applyAtFieldRef(doc, 'basics.summary', 'Engineer with a decade of impact.');
    expect((doc.basics as { summary?: string }).summary).toContain('decade');
  });

  it('missing parents and junk refs are not auto-applicable', () => {
    for (const bad of ['projects[0].name', 'nothing.here.at.all', 'a;evil', '']) {
      expect(() => applyAtFieldRef(base(), bad, 'x')).toThrow(FieldRefApplyError);
    }
  });
});

describe('analysis state machine (issue #43 / 4.6)', () => {
  const chain = (r: unknown) => ({ exec: jest.fn().mockResolvedValue(r) });
  const svcWith = (analysisDoc: Record<string, unknown>) => {
    const analyses = {
      findOne: jest.fn(() => chain(analysisDoc)),
      updateOne: jest.fn(() => chain({ modifiedCount: 1 })),
    };
    const resumes = {
      findOne: jest.fn(() => chain({ lastAnalyzedAt: undefined })),
      updateOne: jest.fn(() => chain({})),
    };
    return new AnalysesService(
      analyses as never,
      resumes as never,
      { updateOne: jest.fn(() => chain({})) } as never,
      { llm: { userConcurrency: 2 } } as never,
    );
  };
  const ids = { u: new Types.ObjectId(), a: new Types.ObjectId() };

  it('retry: only failed; others 409 with current state', async () => {
    for (const status of [
      AnalysisStatus.PENDING,
      AnalysisStatus.IN_PROGRESS,
      AnalysisStatus.COMPLETED,
      AnalysisStatus.CANCELLED,
    ]) {
      const err = await svcWith({ _id: ids.a, status })
        .retry(ids.u, ids.a)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(AppException);
      expect(
        ((err as AppException).getResponse() as { details: { currentStatus: string } }).details
          .currentStatus,
      ).toBe(status);
    }
  });

  it('cancel: only pending; others 409', async () => {
    for (const status of [
      AnalysisStatus.IN_PROGRESS,
      AnalysisStatus.COMPLETED,
      AnalysisStatus.FAILED,
    ]) {
      const err = await svcWith({ _id: ids.a, status })
        .cancel(ids.u, ids.a)
        .catch((e: unknown) => e);
      expect((err as AppException).getStatus()).toBe(409);
    }
  });

  it('cancel raced by the runner -> 409 already started', async () => {
    const analyses = {
      findOne: jest.fn(() => chain({ _id: ids.a, status: AnalysisStatus.PENDING })),
      updateOne: jest.fn(() => chain({ modifiedCount: 0 })), // claim won the race
    };
    const svc = new AnalysesService(
      analyses as never,
      { findOne: jest.fn(() => chain({})), updateOne: jest.fn(() => chain({})) } as never,
      { updateOne: jest.fn(() => chain({})) } as never,
      { llm: { userConcurrency: 2 } } as never,
    );
    const err = await svc.cancel(ids.u, ids.a).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(409);
  });

  it('apply: soft-deleted resume -> 410; missing proposedValue -> 422; idempotent second apply', async () => {
    const sid = new Types.ObjectId();
    const mkAnalysis = (over: Record<string, unknown>) => ({
      _id: ids.a,
      resumeId: new Types.ObjectId(),
      status: AnalysisStatus.COMPLETED,
      result: {
        suggestions: [
          { _id: sid, fieldRef: 'basics.label', proposedValue: 'X', applied: false, ...over },
        ],
      },
    });
    // resume gone -> 410
    let svc = new AnalysesService(
      {
        findOne: jest.fn(() => chain(mkAnalysis({}))),
        updateOne: jest.fn(() => chain({})),
      } as never,
      { findOne: jest.fn(() => chain(null)), updateOne: jest.fn(() => chain({})) } as never,
      { updateOne: jest.fn(() => chain({})) } as never,
      { llm: { userConcurrency: 2 } } as never,
    );
    let err = await svc.applySuggestion(ids.u, ids.a, sid).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(410);
    // no proposedValue -> 422
    svc = new AnalysesService(
      {
        findOne: jest.fn(() => chain(mkAnalysis({ proposedValue: undefined }))),
        updateOne: jest.fn(() => chain({})),
      } as never,
      { findOne: jest.fn(() => chain({})), updateOne: jest.fn(() => chain({})) } as never,
      { updateOne: jest.fn(() => chain({})) } as never,
      { llm: { userConcurrency: 2 } } as never,
    );
    err = await svc.applySuggestion(ids.u, ids.a, sid).catch((e: unknown) => e);
    expect((err as AppException).getStatus()).toBe(422);
    // already applied -> idempotent no-op
    svc = new AnalysesService(
      {
        findOne: jest.fn(() => chain(mkAnalysis({ applied: true }))),
        updateOne: jest.fn(() => chain({})),
      } as never,
      { findOne: jest.fn(() => chain({})), updateOne: jest.fn(() => chain({})) } as never,
      { updateOne: jest.fn(() => chain({})) } as never,
      { llm: { userConcurrency: 2 } } as never,
    );
    const ok = await svc.applySuggestion(ids.u, ids.a, sid);
    expect(ok.outcome).toBe('already_applied');
  });
});
