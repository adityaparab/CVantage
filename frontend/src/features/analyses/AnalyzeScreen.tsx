import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { FormProvider } from 'react-hook-form';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';

import { analysesApi } from '@/api/endpoints/analyses';
import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import { Field, applyServerFieldErrors, useZodForm } from '@/components/form';
import { Button, Input, Skeleton, Textarea, useToast } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn } from '@/lib/cn';

const JD_MIN = 30;
const JD_MAX = 50_000;

const schema = z.object({
  name: z.string().trim().min(1, 'Give this analysis a name').max(200),
  jobDescription: z
    .string()
    .trim()
    .min(JD_MIN, `At least ${JD_MIN} characters`)
    .max(JD_MAX, `At most ${JD_MAX.toLocaleString()} characters`),
});

type Values = z.infer<typeof schema>;

/** Analysis start (issue #72 / 8.8): only reachable WITH a resume. */
export default function AnalyzeScreen() {
  usePageTitle('New analysis');
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const resume = useQuery({
    queryKey: keys.resumes.detail(id),
    queryFn: () => resumesApi.get(id),
    retry: false,
  });

  useEffect(() => {
    if (resume.isError) {
      toast('danger', 'Pick a resume first', 'Choose which resume to analyze from your dashboard.');
      navigate('/dashboard', { replace: true });
    }
  }, [resume.isError, navigate, toast]);

  const form = useZodForm<Values>(schema, {
    defaultValues: { name: '', jobDescription: '' },
  });
  const jd = form.watch('jobDescription');

  const start = useMutation({
    mutationFn: (values: Values) => analysesApi.create({ ...values, resumeId: id }),
    onSuccess: (analysis) => navigate(`/analyses/${analysis.id}`),
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 422) {
        if (e.fieldErrors?.length) applyServerFieldErrors(form, e.fieldErrors);
        else toast('danger', 'Cannot analyze yet', e.message);
        return;
      }
      if (e.status === 429) {
        toast('danger', 'Too many analyses running', e.message);
        return;
      }
      toast('danger', 'Could not start the analysis', e.message);
    },
  });

  if (resume.isPending) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!resume.data) return null; // redirect effect handles it

  const doc = resume.data;
  const counterTone =
    jd.length === 0
      ? 'text-muted'
      : jd.length < JD_MIN || jd.length > JD_MAX
        ? 'text-danger'
        : 'text-success';

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-extrabold text-ink">New analysis</h1>

      {/* the resume being analyzed - route-param driven, survives refresh */}
      <div className="mt-4 flex items-center justify-between rounded-card border border-line bg-card p-4 shadow-card">
        <div>
          <p className="text-[0.78rem] font-semibold tracking-wide text-muted uppercase">
            Analyzing
          </p>
          <p className="font-bold text-ink">{doc.name}</p>
        </div>
        <p className="text-[0.78rem] text-muted">
          Updated {new Date(doc.updatedAt).toLocaleDateString()}
        </p>
      </div>

      <FormProvider {...form}>
        <form
          noValidate
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => void form.handleSubmit((v) => start.mutate(v))(e)}
        >
          <Field
            name="name"
            label="Analysis name"
            required
            description="e.g. the role and company."
          >
            {(ids) => (
              <Input {...ids} placeholder="Platform Engineer @ Acme" {...form.register('name')} />
            )}
          </Field>
          <Field name="jobDescription" label="Job description" required>
            {(ids) => (
              <div>
                <Textarea
                  {...ids}
                  rows={12}
                  placeholder="Paste the full job description here…"
                  {...form.register('jobDescription')}
                />
                <p
                  aria-live="polite"
                  className={cn('mt-1 text-right font-mono text-[0.74rem]', counterTone)}
                >
                  {jd.length.toLocaleString()} / {JD_MAX.toLocaleString()}
                  {jd.length > 0 && jd.length < JD_MIN ? ` (min ${JD_MIN})` : ''}
                </p>
              </div>
            )}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => form.reset({ name: '', jobDescription: '' })}>
              Clear
            </Button>
            <Button
              type="submit"
              loading={start.isPending}
              disabled={!schema.safeParse({ name: form.watch('name'), jobDescription: jd }).success}
            >
              Start analysis
            </Button>
          </div>
        </form>
      </FormProvider>
    </div>
  );
}
