import { AnalysisDocument } from '../database/schemas';

/** Wire shape shared by REST and SSE (issues #43/#49) - polling fallback
 *  and stream payloads are structurally identical by construction. */
export const toAnalysisView = (doc: AnalysisDocument) => ({
  id: String(doc._id),
  resumeId: String(doc.resumeId),
  name: doc.name,
  status: doc.status,
  steps: doc.steps.map((s) => ({
    key: s.key,
    status: s.status,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    error: s.error,
  })),
  result: doc.result,
  tokensUsed: doc.tokensUsed,
  modelUsed: doc.modelUsed,
  error: doc.error,
  startedAt: doc.startedAt,
  completedAt: doc.completedAt,
  durationMs: doc.durationMs,
  createdAt: (doc as unknown as { createdAt: Date }).createdAt,
});
