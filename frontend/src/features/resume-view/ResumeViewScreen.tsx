import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { Editable } from './Editable';
import type { EditableKind } from './Editable';
import { setAtPath } from './set-at-path';

import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import type { Types } from '@/api/types';
import { Badge, Button, Skeleton, statusTone, useToast } from '@/components/ui';
import { DownloadMenu } from '@/features/export/DownloadMenu';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { usePageTitle } from '@/hooks/usePageTitle';

type J = Record<string, never>;

/** Formatted resume with per-field pencils (issue #70 / 8.6). */
export default function ResumeViewScreen() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingCount, setEditingCount] = useState(0);
  useDirtyGuard(editingCount > 0);

  const resume = useQuery({
    queryKey: keys.resumes.detail(id),
    queryFn: () => resumesApi.get(id),
  });
  usePageTitle(resume.data?.name ?? 'Resume');

  const patch = useMutation({
    mutationFn: ({ json }: { json: Types.ResumeDetail['jsonResume'] }) =>
      resumesApi.update(id, { jsonResume: json, version: resume.data!.version }),
    onMutate: async ({ json }) => {
      await queryClient.cancelQueries({ queryKey: keys.resumes.detail(id) });
      const snapshot = queryClient.getQueryData<Types.ResumeDetail>(keys.resumes.detail(id));
      queryClient.setQueryData<Types.ResumeDetail>(keys.resumes.detail(id), (prev) =>
        prev ? { ...prev, jsonResume: json } : prev,
      );
      return { snapshot };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(keys.resumes.detail(id), ctx.snapshot);
      const e = normalizeApiError(err);
      if (e.status === 409) {
        toast(
          'danger',
          'This resume changed somewhere else',
          'Reload to get the latest version, then redo your edit.',
        );
        void queryClient.invalidateQueries({ queryKey: keys.resumes.detail(id) });
        return;
      }
      toast('danger', 'Could not save that change', e.message);
    },
    onSuccess: (fresh) => {
      queryClient.setQueryData(keys.resumes.detail(id), fresh);
    },
  });

  if (resume.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (!resume.data) return <p className="text-muted">Resume not found.</p>;
  const doc = resume.data;
  const json = doc.jsonResume as Record<string, J[]> & { basics?: J };

  const save = (path: string, value: unknown) =>
    patch.mutate({ json: setAtPath(doc.jsonResume, path, value) });

  const field = (path: string, label: string, kind: EditableKind = 'text', className?: string) => {
    const segs = path.split('.');
    let v: unknown = doc.jsonResume;
    for (const seg of segs) v = (v as Record<string, unknown> | undefined)?.[seg];
    const value = (kind === 'lines' ? ((v as string[]) ?? []) : ((v as string) ?? '')) as
      | string
      | string[];
    return (
      <Editable
        label={label}
        kind={kind}
        value={value}
        busy={patch.isPending}
        className={className}
        onSave={(next) => save(path, next)}
      />
    );
  };

  const sectionRows = <T,>(
    name: string,
    rows: T[] | undefined,
    render: (row: T, i: number) => React.ReactNode,
  ) =>
    rows && rows.length > 0 ? (
      <section className="mt-8">
        <h2 className="border-b border-line pb-1 text-[0.78rem] font-bold tracking-[0.14em] text-accent-ink uppercase">
          {name}
        </h2>
        <div className="mt-3 flex flex-col gap-5">{rows.map(render)}</div>
      </section>
    ) : null;

  return (
    <div onFocusCapture={() => undefined}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-ink">{doc.name}</h1>
          <Badge tone={statusTone(doc.analysisStatus)}>
            {doc.analysisStatus.replace('_', ' ')}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Link to="/dashboard">
            <Button variant="ghost">Back</Button>
          </Link>
          <DownloadMenu resumeId={doc.id} resumeName={doc.name} />
          <Button onClick={() => navigate(`/resumes/${doc.id}/analyze`)}>Analyze resume</Button>
        </div>
      </div>

      <article
        className="rounded-card border border-line bg-card p-8 shadow-card"
        onFocus={() => setEditingCount((c) => c)}
      >
        {/* basics */}
        <header>
          <div className="text-2xl font-extrabold text-ink">
            {field('basics.name', 'Full name')}
          </div>
          <div className="mt-0.5 text-accent-ink">
            {field('basics.label', 'Professional title')}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            {field('basics.email', 'Email')}
            {field('basics.phone', 'Phone')}
            {field('basics.url', 'Website')}
            {field('basics.location.city', 'City')}
          </div>
          <p className="mt-3 text-sm text-ink">{field('basics.summary', 'Summary', 'textarea')}</p>
        </header>

        {sectionRows('Work experience', json.work, (w: J & { highlights?: string[] }, i) => (
          <div key={i}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-bold text-ink">
                {field(`work.${i}.position`, 'Position')}
                <span className="text-muted"> · </span>
                {field(`work.${i}.name`, 'Company')}
              </p>
              <p className="font-mono text-[0.78rem] text-muted">
                {field(`work.${i}.startDate`, 'Start date', 'date')} —{' '}
                {field(`work.${i}.endDate`, 'End date', 'date')}
              </p>
            </div>
            <p className="mt-1 text-sm text-ink">
              {field(`work.${i}.summary`, 'Summary', 'textarea')}
            </p>
            <div className="mt-1.5 text-sm text-ink">
              <Editable
                label={`Highlights for ${w.position ?? 'role'}`}
                kind="lines"
                value={w.highlights ?? []}
                busy={patch.isPending}
                onSave={(next) => save(`work.${i}.highlights`, next)}
                display={
                  w.highlights && w.highlights.length > 0 ? (
                    <ul className="list-disc pl-5">
                      {w.highlights.map((h, hi) => (
                        <li key={hi}>{h}</li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            </div>
          </div>
        ))}

        {sectionRows('Education', json.education, (_e: J, i) => (
          <div key={i} className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-ink">
              <span className="font-bold">{field(`education.${i}.studyType`, 'Degree')}</span>{' '}
              {field(`education.${i}.area`, 'Area')} ·{' '}
              {field(`education.${i}.institution`, 'Institution')}
            </p>
            <p className="font-mono text-[0.78rem] text-muted">
              {field(`education.${i}.startDate`, 'Start date', 'date')} —{' '}
              {field(`education.${i}.endDate`, 'End date', 'date')}
            </p>
          </div>
        ))}

        {sectionRows('Skills', json.skills, (k: J & { keywords?: string[] }, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-ink">{field(`skills.${i}.name`, 'Skill')}</span>
            <span className="text-muted">{field(`skills.${i}.level`, 'Level')}</span>
            <Editable
              label={`Keywords for ${k.name ?? 'skill'}`}
              kind="lines"
              value={k.keywords ?? []}
              busy={patch.isPending}
              onSave={(next) => save(`skills.${i}.keywords`, next)}
              display={
                k.keywords && k.keywords.length > 0 ? (
                  <span className="flex flex-wrap gap-1">
                    {k.keywords.map((kw, ki) => (
                      <Badge key={ki}>{kw}</Badge>
                    ))}
                  </span>
                ) : undefined
              }
            />
          </div>
        ))}

        {sectionRows('Projects', json.projects, (_p: J, i) => (
          <div key={i}>
            <p className="font-bold text-ink">{field(`projects.${i}.name`, 'Project')}</p>
            <p className="mt-0.5 text-sm text-ink">
              {field(`projects.${i}.description`, 'Description', 'textarea')}
            </p>
          </div>
        ))}

        {sectionRows('Languages', json.languages, (_l: J, i) => (
          <p key={i} className="text-sm text-ink">
            {field(`languages.${i}.language`, 'Language')}{' '}
            <span className="text-muted">{field(`languages.${i}.fluency`, 'Fluency')}</span>
          </p>
        ))}
      </article>

      <p className="mt-3 text-center text-[0.78rem] text-muted">
        Hover any value and click ✎ to edit it in place. For bigger changes use the{' '}
        <Link to="/resumes/new" className="underline">
          full editor
        </Link>
        .
      </p>
    </div>
  );
}
