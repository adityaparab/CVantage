import { passwordSchema } from '@cvantage/shared';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { FormProvider } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { z } from 'zod';

import { AuthCard, AuthSwitchLink } from './AuthCard';

import { authApi } from '@/api/endpoints/auth';
import { normalizeApiError } from '@/api/errors';
import { Field, useZodForm } from '@/components/form';
import { Button, Input, useToast } from '@/components/ui';
import { usePageTitle } from '@/hooks/usePageTitle';

const forgotSchema = z.object({ email: z.string().email('Enter a valid email') });

export function ForgotPasswordScreen() {
  usePageTitle('Reset password');
  const [sent, setSent] = useState(false);
  const form = useZodForm(forgotSchema, { defaultValues: { email: '' } });
  const send = useMutation({
    mutationFn: ({ email }: { email: string }) => authApi.forgotPassword(email),
    onSuccess: () => setSent(true),
    onError: () => setSent(true), // never reveal whether the email exists
  });
  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="We will email you a reset link if the account exists."
      footer={<AuthSwitchLink to="/login" label="Remembered it?" cta="Back to sign in" />}
    >
      {sent ? (
        <p role="status" className="rounded-lg bg-success-bg px-3 py-3 text-sm text-success">
          If an account exists for that address, a reset link is on its way. Check your inbox.
        </p>
      ) : (
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={(e) => void form.handleSubmit((v) => send.mutate(v))(e)}
            className="flex flex-col gap-4"
          >
            <Field name="email" label="Email" required>
              {(ids) => (
                <Input {...ids} type="email" autoComplete="email" {...form.register('email')} />
              )}
            </Field>
            <Button type="submit" loading={send.isPending} className="w-full">
              Send reset link
            </Button>
          </form>
        </FormProvider>
      )}
    </AuthCard>
  );
}

const resetSchema = z.object({ password: passwordSchema });

export function ResetPasswordScreen() {
  usePageTitle('Choose a new password');
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const token = params.get('token') ?? '';
  const [dead, setDead] = useState(!token);
  const form = useZodForm(resetSchema, { defaultValues: { password: '' } });
  const reset = useMutation({
    mutationFn: ({ password }: { password: string }) => authApi.resetPassword(token, password),
    onSuccess: () => {
      toast('success', 'Password updated', 'Sign in with your new password.');
      navigate('/login', { replace: true });
    },
    onError: (err) => {
      const e = normalizeApiError(err);
      if (e.status === 400 || e.status === 401 || e.status === 404 || e.status === 410)
        setDead(true);
    },
  });
  return (
    <AuthCard title="Choose a new password">
      {dead ? (
        <div role="alert" className="rounded-lg bg-danger-bg px-3 py-3 text-sm text-danger">
          This reset link is invalid or has expired.{' '}
          <Link to="/forgot-password" className="font-semibold underline">
            Request a new one
          </Link>
          .
        </div>
      ) : (
        <FormProvider {...form}>
          <form
            noValidate
            onSubmit={(e) => void form.handleSubmit((v) => reset.mutate(v))(e)}
            className="flex flex-col gap-4"
          >
            <Field
              name="password"
              label="New password"
              required
              description="At least 10 characters with upper, lower and a digit."
            >
              {(ids) => (
                <Input
                  {...ids}
                  type="password"
                  autoComplete="new-password"
                  {...form.register('password')}
                />
              )}
            </Field>
            <Button type="submit" loading={reset.isPending} className="w-full">
              Update password
            </Button>
          </form>
        </FormProvider>
      )}
    </AuthCard>
  );
}

export function VerifyEmailScreen() {
  usePageTitle('Verify email');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useMutation({
    mutationFn: () => authApi.verifyEmail(token),
  });
  const state = !token
    ? 'missing'
    : verify.isIdle
      ? 'ready'
      : verify.isPending
        ? 'pending'
        : verify.isSuccess
          ? 'done'
          : 'failed';
  return (
    <AuthCard title="Verify your email">
      {state === 'missing' || state === 'failed' ? (
        <p role="alert" className="rounded-lg bg-danger-bg px-3 py-3 text-sm text-danger">
          This verification link is invalid or has expired. Request a fresh one from your account
          settings after signing in.
        </p>
      ) : state === 'done' ? (
        <div role="status" className="rounded-lg bg-success-bg px-3 py-3 text-sm text-success">
          Your email is verified - you are all set.{' '}
          <Link to="/dashboard" className="font-semibold underline">
            Go to your dashboard
          </Link>
          .
        </div>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <p className="text-sm text-muted">Click below to confirm this email address.</p>
          <Button loading={state === 'pending'} onClick={() => verify.mutate()}>
            Verify email
          </Button>
        </div>
      )}
    </AuthCard>
  );
}
