import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router';

import { AnalysisResults } from './AnalysisResults';
import { useAnalysisLive } from './useAnalysisLive';

import { analysesApi } from '@/api/endpoints/analyses';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import { Button, ProgressSteps, Skeleton, Spinner } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

const STEP_LABELS: Record<Types.AnalysisStep['key'], string> = {
  compare_resume_jd: 'Comparing resume & JD',
  generate_suggestions: 'Generating suggestions',
  prepare_interview_questions: 'Preparing interview questions',
};

/** Progress + results host (issues #73/#74). SSE-live with polling fallback. */
export default function AnalysisScreen() {
  const { id = '' } = useParams();
  const analysis = useAnalysisLive(id);
  const queryClient = useQueryClient();
  usePageTitle(analysis.data?.name ?? 'Analysis');

  const retry = useMutation({
    mutationFn: () => analysesApi.retry(id),
    onSuccess: (fresh) => queryClient.setQueryData(keys.analyses.detail(id), fresh),
  });

  if (analysis.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  }
  if (!analysis.data) return <p className="text-muted">Analysis not found.</p>;
  const doc = analysis.data;
  const running = doc.status === 'pending' || doc.status === 'in_progress';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">{doc.name}</h1>
          <p className="text-sm text-muted">
            Started {new Date(doc.createdAt).toLocaleString()}
            {doc.durationMs ? ` · took ${(doc.durationMs / 1000).toFixed(1)}s` : ''}
          </p>
        </div>
        <Link to="/analyses">
          <Button variant="ghost">All analyses</Button>
        </Link>
      </div>

      {running ? (
        <section
          aria-live="polite"
          className="rounded-card border border-line bg-card p-6 shadow-card"
        >
          <div className="flex items-center gap-3">
            <Spinner label="Analysis running" />
            <p className="font-semibold text-ink">
              {doc.status === 'pending'
                ? 'Queued - starting any second…'
                : 'Analyzing your resume…'}
            </p>
          </div>
          <div className="mt-5">
            <ProgressSteps
              steps={doc.steps.map((s) => ({
                key: s.key,
                label: STEP_LABELS[s.key],
                status: s.status,
              }))}
            />
          </div>
          <p className="mt-4 text-[0.78rem] text-muted">
            You can navigate away - the bell will tell you when it is done.
          </p>
        </section>
      ) : null}

      {doc.status === 'failed' ? (
        <section className="rounded-card border border-danger/40 bg-card p-6 shadow-card">
          <p className="font-semibold text-danger">This analysis failed</p>
          <p className="mt-1 text-sm text-muted">
            {doc.error ?? 'Something went wrong while talking to the AI.'}
          </p>
          <div className="mt-3">
            <ProgressSteps
              steps={doc.steps.map((s) => ({
                key: s.key,
                label: STEP_LABELS[s.key],
                status: s.status,
              }))}
            />
          </div>
          <Button className="mt-4" loading={retry.isPending} onClick={() => retry.mutate()}>
            Retry analysis
          </Button>
        </section>
      ) : null}

      {doc.status === 'cancelled' ? (
        <p className="rounded-card border border-line bg-canvas-2 p-6 text-sm text-muted">
          This analysis was cancelled before it started.
        </p>
      ) : null}

      {doc.status === 'completed' ? <AnalysisResults analysis={doc} /> : null}
    </div>
  );
}
