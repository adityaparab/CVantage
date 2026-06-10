import { loginSchema } from '@cvantage/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { FormProvider } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router';
import type { z } from 'zod';

import { AuthCard, AuthSwitchLink } from './AuthCard';
import { OAuthButtons } from './OAuthButtons';

import { authApi } from '@/api/endpoints/auth';
import { normalizeApiError } from '@/api/errors';
import { keys } from '@/api/keys';
import { Field, applyServerFieldErrors, useZodForm } from '@/components/form';
import { Button, Input } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

type LoginValues = z.infer<typeof loginSchema>;

/** Lockout countdown (429 with details.retryAfterS) re-enables the form. */
function useLockout() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  const secondsLeft = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return {
    locked: secondsLeft > 0,
    secondsLeft,
    lock: (seconds: number) => setUntil(Date.now() + seconds * 1000),
  };
}

export default function LoginScreen() {
  usePageTitle('Sign in');
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const form = useZodForm<LoginValues>(loginSchema as never, {
    defaultValues: { email: '', password: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);
  const lockout = useLockout();

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: async ({ user }) => {
      await queryClient.invalidateQueries({ queryKey: keys.auth.me() });
      const returnTo = params.get('returnTo');
      navigate(returnTo ?? (user.role === 'admin' ? '/admin' : '/dashboard'), { replace: true });
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 422) {
        applyServerFieldErrors(form, e.fieldErrors);
        return;
      }
      if (e.status === 429) {
        const retryAfterS = (e.details as { retryAfterS?: number } | undefined)?.retryAfterS ?? 60;
        lockout.lock(retryAfterS);
        setFormError(null);
        return;
      }
      if (e.status === 403) {
        setFormError(
          'This account is deactivated. Contact support if you think that is a mistake.',
        );
        return;
      }
      setFormError('Email or password is incorrect.');
    },
  });

  const oauthError = params.get('error');

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your CVantage account."
      footer={<AuthSwitchLink to="/register" label="New here?" cta="Create an account" />}
    >
      <OAuthButtons />
      {oauthError ? (
        <p role="alert" className="mb-4 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
          Sign-in with the provider failed. Try again or use your password.
        </p>
      ) : null}
      <FormProvider {...form}>
        <form
          noValidate
          onSubmit={(e) => void form.handleSubmit((v) => login.mutate(v))(e)}
          className="flex flex-col gap-4"
        >
          <Field name="email" label="Email" required>
            {(ids) => (
              <Input
                {...ids}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...form.register('email')}
              />
            )}
          </Field>
          <Field name="password" label="Password" required>
            {(ids) => (
              <Input
                {...ids}
                type="password"
                autoComplete="current-password"
                {...form.register('password')}
              />
            )}
          </Field>
          {formError ? (
            <p role="alert" className="rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
          {lockout.locked ? (
            <p role="alert" className="rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn">
              Too many attempts. Try again in {lockout.secondsLeft}s.
            </p>
          ) : null}
          <Button
            type="submit"
            loading={login.isPending}
            disabled={lockout.locked}
            className="w-full"
          >
            Sign in
          </Button>
          <p className="text-center text-sm">
            <AuthSwitchLink to="/forgot-password" label="" cta="Forgot your password?" />
          </p>
        </form>
      </FormProvider>
    </AuthCard>
  );
}
