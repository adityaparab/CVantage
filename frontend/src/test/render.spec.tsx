import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWith } from './render';

import { useAuth } from '@/features/auth/auth-context';

function WhoAmI() {
  const { status, user } = useAuth();
  if (status === 'loading') return <p>loading</p>;
  return <p>{status === 'anonymous' ? 'anon' : `${user?.role}:${user?.email}`}</p>;
}

describe('render helper boots all three auth states (issue #63 / 7.6)', () => {
  it('candidate', async () => {
    renderWith(<WhoAmI />, { auth: 'candidate' });
    await waitFor(() => expect(screen.getByText(/candidate:/)).toBeInTheDocument());
  });

  it('admin', async () => {
    renderWith(<WhoAmI />, { auth: 'admin' });
    await waitFor(() => expect(screen.getByText(/admin:/)).toBeInTheDocument());
  });

  it('anonymous', async () => {
    renderWith(<WhoAmI />, { auth: 'anonymous' });
    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument());
  });
});
