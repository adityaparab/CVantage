import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { analysesApi } from '@/api/endpoints/analyses';
import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import { Badge, Button, Skeleton, useToast } from '@/components/ui';
import { DownloadMenu } from '@/features/export/DownloadMenu';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/cn';

/** "work[0].highlights" -> "work.0"; "basics.label" -> "basics"; "projects" -> "projects". */
export function anchorOf(fieldRef: string): string {
  const norm = fieldRef.replace(/\[(\d+)\]/g, '.$1');
  const parts = norm.split('.');
  if (parts.length >= 2 && /^\d+$/.test(parts[1]!)) return `${parts[0]}.${parts[1]}`;
  return parts[0]!;
}

const GROUP_LABELS: Record<string, string> = {
  ats_improvement: 'ATS improvements',
  skill_emphasis: 'Skill emphasis',
  wording: 'Wording',
  skill_addition: 'Skill additions',
  project: 'Projects',
};

type J = Record<string, never>;

function ResumePane({
  resume,
  activeAnchor,
}: {
  resume: Types.ResumeDetail;
  activeAnchor: string | null;
}) {
  const json = resume.jsonResume as Record<string, J[]> & { basics?: J };
  const mark = (anchor: string) =>
    cn(
      'rounded-lg p-2 transition-shadow',
      activeAnchor === anchor && 'ring-2 ring-accent bg-accent-soft/40',
    );
  return (
    <article className="rounded-card border border-line bg-card p-6 shadow-card">
      <div data-field="basics" className={mark('basics')}>
        <p className="text-xl font-extrabold text-ink">{json.basics?.name ?? 'Unnamed'}</p>
        <p className="text-accent-ink">{json.basics?.label ?? ''}</p>
        {json.basics?.summary ? (
          <p className="mt-1 text-sm text-muted">{json.basics.summary}</p>
        ) : null}
      </div>
      {(json.work ?? []).map((w: J & { highlights?: string[] }, i) => (
        <div key={i} data-field={`work.${i}`} className={cn('mt-3', mark(`work.${i}`))}>
          <p className="text-sm font-bold text-ink">
            {w.position ?? ''} · {w.name ?? ''}
          </p>
          {w.highlights && w.highlights.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm text-ink">
              {w.highlights.map((h, hi) => (
                <li key={hi}>{h}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      {(json.skills ?? []).map((k: J & { keywords?: string[] }, i) => (
        <div key={i} data-field={`skills.${i}`} className={cn('mt-2', mark(`skills.${i}`))}>
          <span className="text-sm font-semibold text-ink">{k.name ?? ''}</span>{' '}
          <span className="text-[0.78rem] text-muted">{(k.keywords ?? []).join(', ')}</span>
        </div>
      ))}
      {(json.projects ?? []).map((p: J, i) => (
        <div key={i} data-field={`projects.${i}`} className={cn('mt-2', mark(`projects.${i}`))}>
          <p className="text-sm font-bold text-ink">{p.name ?? ''}</p>
        </div>
      ))}
      <div data-field="projects" className={mark('projects')} />
    </article>
  );
}

/** Apply-suggestions screen (issue #75 / 8.11). */
export default function ApplyScreen() {
  usePageTitle('Apply suggestions');
  const { id = '' } = useParams();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeAnchor, setActiveAnchor] = useState<string | null>(null);

  const analysis = useQuery({
    queryKey: keys.analyses.detail(id),
    queryFn: () => analysesApi.get(id),
  });
  const resumeId = analysis.data?.resumeId ?? '';
  const resume = useQuery({
    queryKey: keys.resumes.detail(resumeId),
    queryFn: () => resumesApi.get(resumeId),
    enabled: resumeId !== '',
  });

  const refreshBoth = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.analyses.detail(id) }),
      queryClient.invalidateQueries({ queryKey: keys.resumes.detail(resumeId) }),
    ]);
  };

  const apply = useMutation({
    mutationFn: (sid: string) => analysesApi.applySuggestion(id, sid),
    onSuccess: async (out) => {
      if (out.outcome === 'already_applied') toast('info', 'Already applied');
      else toast('success', 'Suggestion applied to your resume');
      await refreshBoth();
    },
    onError: async (err) => {
      const e = normalizeApiError(err);
      if (e.status === 409) {
        toast('danger', 'Your resume changed elsewhere', 'Refreshed - try applying again.');
        await refreshBoth();
        return;
      }
      if (e.status === 410) {
        toast('danger', 'The resume was deleted', 'This analysis is read-only now.');
        return;
      }
      toast('danger', 'Could not apply the suggestion', e.message);
    },
  });

  const dismiss = useMutation({
    mutationFn: (sid: string) => analysesApi.dismissSuggestion(id, sid),
    onSuccess: () => void refreshBoth(),
  });

  if (analysis.isPending || (resumeId && resume.isPending)) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }
  if (!analysis.data) return <p className="text-muted">Analysis not found.</p>;

  const suggestions = analysis.data.result?.suggestions ?? [];
  const applied = suggestions.filter((s) => s.applied);
  const grouped = new Map<string, Types.Suggestion[]>();
  for (const s of suggestions) grouped.set(s.group, [...(grouped.get(s.group) ?? []), s]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Apply suggestions</h1>
          <p className="text-sm text-muted">
            {applied.length} of {suggestions.length} applied · changes hit your live resume
            immediately
          </p>
        </div>
        <div className="flex gap-2">
          <Link to={`/analyses/${id}`}>
            <Button variant="ghost">Back to results</Button>
          </Link>
          {resume.data ? (
            <DownloadMenu resumeId={resume.data.id} resumeName={resume.data.name} />
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* live resume - the document being mutated */}
        <div>
          {resume.data ? (
            <ResumePane resume={resume.data} activeAnchor={activeAnchor} />
          ) : (
            <p className="rounded-card border border-line bg-canvas-2 p-6 text-sm text-muted">
              The resume behind this analysis is gone (deleted) - suggestions are read-only.
            </p>
          )}
        </div>

        {/* suggestion cards */}
        <div className="flex flex-col gap-5">
          {[...grouped.entries()].map(([group, items]) => (
            <section key={group}>
              <h2 className="text-sm font-bold text-accent-ink">{GROUP_LABELS[group] ?? group}</h2>
              <ul className="mt-2 flex flex-col gap-2">
                {items.map((s) => (
                  <li
                    key={s._id}
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- focus drives the documented highlight pairing for keyboard users
                    tabIndex={0}
                    onMouseEnter={() => setActiveAnchor(anchorOf(s.fieldRef))}
                    onMouseLeave={() => setActiveAnchor(null)}
                    onFocus={() => setActiveAnchor(anchorOf(s.fieldRef))}
                    onBlur={() => setActiveAnchor(null)}
                    className={cn(
                      'rounded-card border bg-card p-4 shadow-card outline-none focus:ring-2 focus:ring-accent',
                      s.applied
                        ? 'border-success/40'
                        : s.dismissed
                          ? 'border-line opacity-60'
                          : 'border-line',
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{s.title}</p>
                      <code className="rounded bg-canvas-3 px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">
                        {s.fieldRef}
                      </code>
                      {s.applied ? <Badge tone="success">applied</Badge> : null}
                      {s.dismissed && !s.applied ? <Badge>dismissed</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">{s.description}</p>
                    {s.proposedValue ? (
                      <p className="mt-1.5 rounded bg-accent-soft px-2 py-1 text-sm text-accent-ink">
                        → {s.proposedValue}
                      </p>
                    ) : null}
                    <div className="mt-3 flex gap-2">
                      <Button
                        size="sm"
                        disabled={s.applied || !s.proposedValue || !resume.data}
                        loading={apply.isPending && apply.variables === s._id}
                        onClick={() => apply.mutate(s._id)}
                        aria-label={`Apply: ${s.title}`}
                      >
                        {s.applied ? 'Applied' : s.proposedValue ? 'Apply' : 'Manual change'}
                      </Button>
                      {!s.applied && !s.dismissed ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => dismiss.mutate(s._id)}
                          aria-label={`Dismiss: ${s.title}`}
                        >
                          Dismiss
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {suggestions.length === 0 ? (
            <p className="rounded-card border border-line bg-canvas-2 p-6 text-sm text-muted">
              No suggestions on this analysis.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
