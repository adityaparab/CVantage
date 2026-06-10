import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FormProvider } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { z } from 'zod';

import { EMPTY_FORM, fromFormModel, resumeFormSchema } from './form-model';
import type { ResumeFormValues } from './form-model';
import { ResumeForm } from './ResumeForm';

import { resumesApi } from '@/api/endpoints/resumes';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import { Field, applyServerFieldErrors, useZodForm } from '@/components/form';
import { Input, useToast } from '@/components/ui';
import { useDirtyGuard } from '@/hooks/useDirtyGuard';
import { usePageTitle } from '@/hooks/usePageTitle';

const createSchema = resumeFormSchema.extend({
  resumeName: z.string().trim().min(1, 'Give the resume a name').max(200),
});

type CreateValues = ResumeFormValues & { resumeName: string };

/** Create-from-scratch flow (issue #69 / 8.5). */
export default function CreateResumeScreen() {
  usePageTitle('Create resume');
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const form = useZodForm<CreateValues>(createSchema as never, {
    defaultValues: { ...EMPTY_FORM, resumeName: '' },
  });
  useDirtyGuard(form.formState.isDirty && !form.formState.isSubmitSuccessful);

  const create = useMutation({
    mutationFn: (values: CreateValues) =>
      resumesApi.create({ name: values.resumeName, jsonResume: fromFormModel(values) }),
    onSuccess: async (resume) => {
      toast('success', 'Resume saved');
      await queryClient.invalidateQueries({ queryKey: keys.resumes.all() });
      navigate(`/resumes/${resume.id}/edit`, { replace: true });
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 422) {
        applyServerFieldErrors(
          form,
          e.fieldErrors?.map((f) => ({
            ...f,
            path: f.path === 'name' ? 'resumeName' : f.path.replace(/^jsonResume\./, ''),
          })),
        );
        return;
      }
      if (e.status === 409) {
        form.setError('resumeName', {
          type: 'server',
          message: 'You already have a resume with that name',
        });
        return;
      }
      toast('danger', 'Could not save the resume', e.message);
    },
  });

  return (
    <div>
      <h1 className="mb-5 text-2xl font-extrabold text-ink">Create resume</h1>
      <ResumeForm
        form={form as never}
        busy={create.isPending}
        onSubmit={(v) => create.mutate(v as CreateValues)}
        headerExtra={
          <FormProvider {...form}>
            <div className="rounded-card border border-line bg-card p-5 shadow-card">
              <Field
                name="resumeName"
                label="Resume name"
                required
                description="Visible only to you, e.g. 'Backend roles 2026'."
              >
                {(ids) => (
                  <Input {...ids} {...form.register('resumeName')} placeholder="My resume" />
                )}
              </Field>
            </div>
          </FormProvider>
        }
      />
    </div>
  );
}
