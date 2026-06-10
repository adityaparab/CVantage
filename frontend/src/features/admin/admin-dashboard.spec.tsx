import { screen } from '@testing-library/react';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import AdminDashboardScreen from './AdminDashboardScreen';

import { RequireRole } from '@/app/guards';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';

describe('admin dashboard (issue #78 / 9.1)', () => {
  it('cards match the stats endpoint', async () => {
    server.use(
      mswHttp.get(`${API}/admin/stats`, () =>
        HttpResponse.json({
          users: 1280,
          resumes: 3411,
          analyses: 5120,
          generatedAt: new Date().toISOString(),
        }),
      ),
    );
    renderWith(<AdminDashboardScreen />, { auth: 'admin' });
    expect(await screen.findByText('1,280')).toBeInTheDocument();
    expect(screen.getByText('3,411')).toBeInTheDocument();
    expect(screen.getByText('5,120')).toBeInTheDocument();
    expect(screen.getByText(/cached up to 60s/)).toBeInTheDocument();
  });

  it('error state offers retry', async () => {
    server.use(
      mswHttp.get(`${API}/admin/stats`, () =>
        HttpResponse.json({ statusCode: 500, error: 'Internal', message: 'boom' }, { status: 500 }),
      ),
    );
    renderWith(<AdminDashboardScreen />, { auth: 'admin' });
    expect(await screen.findByText(/Could not load platform stats/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('candidates are blocked by the role guard (403 route)', async () => {
    renderWith(
      <RequireRole requiredRole="admin">
        <AdminDashboardScreen />
      </RequireRole>,
      {
        auth: 'candidate',
        extraRoutes: [{ path: '/403', element: <p>forbidden page</p> }],
      },
    );
    expect(await screen.findByText('forbidden page')).toBeInTheDocument();
  });

  it('admins pass the guard and see the dashboard', async () => {
    renderWith(
      <RequireRole requiredRole="admin">
        <AdminDashboardScreen />
      </RequireRole>,
      { auth: 'admin' },
    );
    expect(await screen.findByText('Platform overview')).toBeInTheDocument();
  });
});
