import { passwordSchema, registerSchema } from '@cvantage/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider } from 'react-hook-form';
import { useNavigate } from 'react-router';
import type { z } from 'zod';

import { AuthCard, AuthSwitchLink } from './AuthCard';
import { OAuthButtons } from './OAuthButtons';

import { authApi } from '@/api/endpoints/auth';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import { Field, applyServerFieldErrors, useZodForm } from '@/components/form';
import { Button, Input, useToast } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

type RegisterValues = z.infer<typeof registerSchema>;

/** Mirrors the SERVER password policy (shared zod) - same rules, same text. */
export function strengthOf(password: string): { score: number; hints: string[] } {
  const result = passwordSchema.safeParse(password);
  const hints = result.success ? [] : result.error.issues.map((i) => i.message);
  const score = password === '' ? 0 : Math.max(1, 4 - hints.length);
  return { score, hints };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, hints } = strengthOf(password);
  const tones = ['bg-canvas-3', 'bg-danger', 'bg-warn', 'bg-info', 'bg-success'];
  return (
    <div aria-live="polite">
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i <= score ? tones[score] : 'bg-canvas-3'}`}
          />
        ))}
      </div>
      {password && hints.length > 0 ? (
        <p className="mt-1 text-[0.78rem] text-muted">Needs: {hints.join(', ')}.</p>
      ) : null}
    </div>
  );
}

export default function RegisterScreen() {
  usePageTitle('Create account');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const form = useZodForm<RegisterValues>(registerSchema as never, {
    defaultValues: { fullName: '', email: '', password: '' },
  });
  const [emailTaken, setEmailTaken] = useState(false);
  const password = form.watch('password');

  const register = useMutation({
    mutationFn: async (values: RegisterValues) => {
      await authApi.register(values);
      // register does not create a session - sign in right after
      return authApi.login({ email: values.email, password: values.password });
    },
    onSuccess: async () => {
      toast('success', 'Welcome to CVantage!', 'We sent you a verification email.');
      await queryClient.invalidateQueries({ queryKey: keys.auth.me() });
      navigate('/dashboard', { replace: true });
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 409) {
        setEmailTaken(true);
        form.setError('email', { type: 'server', message: 'That email is already registered' });
        return;
      }
      if (e.status === 422) applyServerFieldErrors(form, e.fieldErrors);
    },
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="Free while in preview - no card needed."
      footer={<AuthSwitchLink to="/login" label="Already have an account?" cta="Sign in" />}
    >
      <OAuthButtons />
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(e) => void form.handleSubmit((v) => register.mutate(v))(e)}
          className="flex flex-col gap-4"
        >
          <Field name="fullName" label="Full name" required>
            {(ids) => (
              <Input
                {...ids}
                autoComplete="name"
                placeholder="Ada Lovelace"
                {...form.register('fullName')}
              />
            )}
          </Field>
          <Field name="email" label="Email" required>
            {(ids) => (
              <Input
                {...ids}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...form.register('email', { onChange: () => setEmailTaken(false) })}
              />
            )}
          </Field>
          <Field
            name="password"
            label="Password"
            required
            description="At least 10 characters with upper, lower and a digit."
          >
            {(ids) => (
              <div>
                <Input
                  {...ids}
                  type="password"
                  autoComplete="new-password"
                  {...form.register('password')}
                />
                <StrengthMeter password={password ?? ''} />
              </div>
            )}
          </Field>
          {emailTaken ? (
            <p className="text-sm text-muted">
              Looks like you already have an account -{' '}
              <AuthSwitchLink to="/login" label="" cta="sign in instead" />.
            </p>
          ) : null}
          <Button type="submit" loading={register.isPending} className="w-full">
            Create account
          </Button>
        </form>
      </FormProvider>
    </AuthCard>
  );
}
