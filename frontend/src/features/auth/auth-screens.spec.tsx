import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import LoginScreen from './screens/LoginScreen';
import { ForgotPasswordScreen } from './screens/PasswordScreens';
import RegisterScreen, { strengthOf } from './screens/RegisterScreen';

import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';

const providers = (flags: Record<string, boolean>) =>
  mswHttp.get(`${API}/auth/providers`, () => HttpResponse.json(flags));

describe('OAuth buttons (issue #66 / 8.2)', () => {
  it('renders nothing with all flags off; per-provider buttons with flags on', async () => {
    server.use(providers({ google: false, linkedin: false }));
    const { unmount } = renderWith(<LoginScreen />, { auth: 'anonymous' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled());
    expect(screen.queryByText(/Continue with/)).not.toBeInTheDocument();
    unmount();

    server.use(providers({ google: true, linkedin: false }));
    renderWith(<LoginScreen />, { auth: 'anonymous' });
    expect(await screen.findByText('Continue with Google')).toBeInTheDocument();
    expect(screen.queryByText('Continue with LinkedIn')).not.toBeInTheDocument();
  });
});

describe('login error mapping (issue #66 / 8.2)', () => {
  it('401 shows a generic credentials error', async () => {
    server.use(
      providers({}),
      mswHttp.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          { statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' },
          { status: 401 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<LoginScreen />, { auth: 'anonymous' });
    await user.type(screen.getByLabelText(/Email/), 'a@b.co');
    await user.type(screen.getByLabelText(/Password/), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect/i);
  });

  it('429 lockout shows a countdown and disables the submit', async () => {
    server.use(
      providers({}),
      mswHttp.post(`${API}/auth/login`, () =>
        HttpResponse.json(
          {
            statusCode: 429,
            error: 'Too Many Requests',
            message: 'Locked',
            details: { retryAfterS: 90 },
          },
          { status: 429 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<LoginScreen />, { auth: 'anonymous' });
    await user.type(screen.getByLabelText(/Email/), 'a@b.co');
    await user.type(screen.getByLabelText(/Password/), 'whatever-pass');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/try again in \d+s/i);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
  });
});

describe('register (issue #66 / 8.2)', () => {
  it('409 maps inline onto the email field with a sign-in nudge', async () => {
    server.use(
      providers({}),
      mswHttp.post(`${API}/auth/register`, () =>
        HttpResponse.json(
          { statusCode: 409, error: 'Conflict', message: 'Email already registered' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<RegisterScreen />, { auth: 'anonymous' });
    await user.type(screen.getByLabelText(/Full name/), 'Ada Lovelace');
    await user.type(screen.getByLabelText(/Email/), 'taken@b.co');
    await user.type(screen.getByLabelText(/^Password/), 'Engine-4242X');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByText('That email is already registered')).toBeInTheDocument();
    expect(screen.getByText(/sign in instead/)).toBeInTheDocument();
  });

  it('strength meter mirrors the server policy exactly', () => {
    expect(strengthOf('').score).toBe(0);
    expect(strengthOf('short').hints.join(' ')).toMatch(/10 characters/);
    expect(strengthOf('alllowercase1x').hints.join(' ')).toMatch(/uppercase/);
    expect(strengthOf('Engine-4242X').hints).toEqual([]);
    expect(strengthOf('Engine-4242X').score).toBe(4);
  });
});

describe('forgot password (issue #66 / 8.2)', () => {
  it('always shows the neutral confirmation (no account enumeration)', async () => {
    server.use(
      mswHttp.post(`${API}/auth/forgot-password`, () =>
        HttpResponse.json(
          { statusCode: 404, error: 'Not Found', message: 'no user' },
          { status: 404 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<ForgotPasswordScreen />, { auth: 'anonymous' });
    await user.type(screen.getByLabelText(/Email/), 'ghost@b.co');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/on its way/i);
  });
});
