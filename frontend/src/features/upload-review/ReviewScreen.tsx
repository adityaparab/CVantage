import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import { applyServerFieldErrors, useZodForm } from '@/components/form';
import { Button, Skeleton, Tabs, useToast } from '@/components/ui';
import {
  EMPTY_FORM,
  fromFormModel,
  resumeFormSchema,
  toFormModel,
} from '@/features/resume-editor/form-model';
import type { ResumeFormValues } from '@/features/resume-editor/form-model';
import { ResumeForm } from '@/features/resume-editor/ResumeForm';
import { humanizeParseError } from '@/features/upload/UploadScreen';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { usePageTitle } from '@/hooks/usePageTitle';

function OriginalTextPanel({ text }: { text: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col rounded-card border border-line bg-card shadow-card">
      <p className="border-b border-line px-4 py-2.5 text-[0.78rem] font-bold tracking-wide text-muted uppercase">
        Original extracted text
      </p>
      <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[0.8rem] leading-relaxed whitespace-pre-wrap text-ink">
        {text || 'No text was extracted from the original file.'}
      </pre>
    </div>
  );
}

/** Upload review (issue #71 / 8.7): correct the AI's work beside the source. */
export default function ReviewScreen() {
  usePageTitle('Review parsed resume');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savedOnce, setSavedOnce] = useState(false);

  const resume = useQuery({
    queryKey: keys.resumes.detail(id),
    queryFn: () => resumesApi.get(id),
  });

  const form = useZodForm<ResumeFormValues>(resumeFormSchema as never, {
    defaultValues: EMPTY_FORM,
  });
  const { reset } = form;
  useEffect(() => {
    if (resume.data) reset(toFormModel(resume.data.jsonResume));
  }, [resume.data, reset]);
  useDirtyGuard(form.formState.isDirty);

  const save = useMutation({
    mutationFn: (values: ResumeFormValues) =>
      resumesApi.update(id, { jsonResume: fromFormModel(values), version: resume.data!.version }),
    onSuccess: (fresh) => {
      queryClient.setQueryData(keys.resumes.detail(id), fresh);
      reset(toFormModel(fresh.jsonResume));
      setSavedOnce(true);
      toast('success', 'Resume saved', 'Looks good - you can start an analysis now.');
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 422) {
        applyServerFieldErrors(
          form,
          e.fieldErrors?.map((f) => ({ ...f, path: f.path.replace(/^jsonResume\./, '') })),
        );
        return;
      }
      if (e.status === 409) {
        toast('danger', 'This resume changed somewhere else', 'Reload to get the latest version.');
        void queryClient.invalidateQueries({ queryKey: keys.resumes.detail(id) });
        return;
      }
      toast('danger', 'Could not save', e.message);
    },
  });

  if (resume.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (!resume.data) return <p className="text-muted">Resume not found.</p>;
  const doc = resume.data;

  if (doc.uploadParse?.status === 'failed') {
    return (
      <div className="mx-auto max-w-xl rounded-card border border-danger/40 bg-card p-6 shadow-card">
        <h1 className="text-lg font-bold text-danger">Parsing failed for this upload</h1>
        <p className="mt-1 text-sm text-muted">{humanizeParseError(doc.uploadParse.error ?? '')}</p>
        <div className="mt-4 flex gap-2">
          <Link to="/resumes/upload">
            <Button>Try again</Button>
          </Link>
          <Link to={`/resumes/${doc.id}/edit`}>
            <Button variant="ghost">Edit manually instead</Button>
          </Link>
        </div>
      </div>
    );
  }

  const editor = (
    <ResumeForm
      form={form as never}
      busy={save.isPending}
      submitLabel="Save corrections"
      onSubmit={(v) => save.mutate(v)}
    />
  );
  const original = <OriginalTextPanel text={doc.originalText ?? ''} />;
  const canAnalyze = savedOnce || !form.formState.isDirty;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Review &ldquo;{doc.name}&rdquo;</h1>
          <p className="text-sm text-muted">
            The AI filled this in from your file - fix anything it got wrong, then analyze.
          </p>
        </div>
        <Button
          disabled={!canAnalyze}
          title={canAnalyze ? undefined : 'Save your corrections first'}
          onClick={() => navigate(`/resumes/${doc.id}/analyze`)}
        >
          Start analysis
        </Button>
      </div>

      {/* large screens: independent-scroll split view */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">{editor}</div>
        <div className="sticky top-24 h-[calc(100vh-8rem)]">{original}</div>
      </div>

      {/* small screens: tab collapse */}
      <div className="lg:hidden">
        <Tabs
          items={[
            { key: 'form', label: 'Edit resume', content: editor },
            {
              key: 'original',
              label: 'Original text',
              content: <div className="h-[70vh]">{original}</div>,
            },
          ]}
        />
      </div>
    </div>
  );
}
