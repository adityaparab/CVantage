import { Link } from 'react-router';

import type { Types } from '@/api/types';
import { Badge, Button, EmptyState } from '@/components/ui';
import { cn } from '@/lib/cn';

const GROUP_LABELS: Record<string, string> = {
  ats_improvement: 'ATS improvements',
  skill_emphasis: 'Skill emphasis',
  wording: 'Wording',
  skill_addition: 'Skill additions',
  project: 'Projects',
};

function scoreTone(score: number): string {
  if (score >= 75) return 'text-success';
  if (score >= 50) return 'text-warn';
  return 'text-danger';
}

function Gauge({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-card border border-line bg-card p-5 text-center shadow-card">
      <p
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
        className={cn('text-4xl font-extrabold', scoreTone(score))}
      >
        {score}
      </p>
      <p className="mt-1 text-[0.78rem] font-semibold tracking-wide text-muted uppercase">
        {label}
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-3" aria-hidden="true">
        <div
          className={cn(
            'h-full rounded-full',
            score >= 75 ? 'bg-success' : score >= 50 ? 'bg-warn' : 'bg-danger',
          )}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function Chips({ items, tone }: { items: string[]; tone: 'success' | 'danger' }) {
  if (items.length === 0) return <p className="text-sm text-muted">Nothing here.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => (
        <Badge key={s} tone={tone}>
          {s}
        </Badge>
      ))}
    </div>
  );
}

/** Results layout (issue #74 / 8.10). Print-friendly by construction. */
export function AnalysisResults({ analysis }: { analysis: Types.Analysis }) {
  const r = analysis.result ?? {};
  const suggestions = r.suggestions ?? [];
  const grouped = new Map<string, Types.Suggestion[]>();
  for (const s of suggestions) {
    grouped.set(s.group, [...(grouped.get(s.group) ?? []), s]);
  }
  const questions = r.interviewQuestions ?? [];

  return (
    <div className="flex flex-col gap-6 print:gap-4">
      {/* scores */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Gauge label="Overall match" score={r.overallScore ?? 0} />
        <Gauge label="ATS score" score={r.atsScore ?? 0} />
        {r.projectScore !== undefined ? (
          <Gauge label="Project score" score={r.projectScore} />
        ) : null}
      </div>

      {/* strong/weak + skills */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Strong points</h2>
          {(r.strongPoints ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted">None detected.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm text-ink">
              {(r.strongPoints ?? []).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Weak points</h2>
          {(r.weakPoints ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-muted">None - nice.</p>
          ) : (
            <ul className="mt-2 list-disc pl-5 text-sm text-ink">
              {(r.weakPoints ?? []).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Matching skills</h2>
          <div className="mt-2">
            <Chips items={r.matchingSkills ?? []} tone="success" />
          </div>
        </section>
        <section className="rounded-card border border-line bg-card p-5 shadow-card">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">Skill gaps</h2>
          <div className="mt-2">
            <Chips items={r.skillGaps ?? []} tone="danger" />
          </div>
        </section>
      </div>

      {/* suggestions */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold tracking-wide text-muted uppercase">
            Improvement suggestions
          </h2>
          {suggestions.length > 0 ? (
            <Link to={`/analyses/${analysis.id}/apply`} className="print:hidden">
              <Button>Apply suggestions to the resume</Button>
            </Link>
          ) : null}
        </div>
        {suggestions.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              title="No suggestions"
              description="The AI found nothing concrete to improve."
            />
          </div>
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            {[...grouped.entries()].map(([group, items]) => (
              <div key={group}>
                <h3 className="text-sm font-bold text-accent-ink">
                  {GROUP_LABELS[group] ?? group}
                </h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {items.map((sg) => (
                    <li key={sg._id} className="rounded-lg border border-line-2 bg-canvas-2 p-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink">{sg.title}</p>
                        <code className="rounded bg-canvas-3 px-1.5 py-0.5 font-mono text-[0.7rem] text-muted">
                          {sg.fieldRef}
                        </code>
                        {sg.applied ? <Badge tone="success">applied</Badge> : null}
                        {sg.dismissed ? <Badge>dismissed</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted">{sg.description}</p>
                      {sg.proposedValue ? (
                        <p className="mt-1.5 rounded bg-accent-soft px-2 py-1 text-sm text-accent-ink">
                          → {sg.proposedValue}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* interview prep */}
      <section className="rounded-card border border-line bg-card p-5 shadow-card">
        <h2 className="text-sm font-bold tracking-wide text-muted uppercase">
          Interview preparation
        </h2>
        {questions.length === 0 ? (
          <div className="mt-3">
            <EmptyState title="No questions generated" />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            {questions.map((q) => (
              <details
                key={q.question}
                className="group rounded-lg border border-line-2 bg-canvas-2 p-3"
              >
                <summary className="cursor-pointer font-semibold text-ink marker:text-accent-ink">
                  {q.question}
                </summary>
                <p className="mt-2 text-sm whitespace-pre-wrap text-muted">{q.suggestedAnswer}</p>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
