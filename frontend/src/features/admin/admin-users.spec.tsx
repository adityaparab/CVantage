import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import AdminUserDetailScreen from './AdminUserDetailScreen';
import AdminUsersScreen from './AdminUsersScreen';

import { adminUser } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';
const TARGET = {
  id: '665f1c2ab79e8e3d4c8a9f99',
  fullName: 'Vic Tim',
  email: 'vic@example.com',
  role: 'candidate' as const,
  status: 'active' as const,
  createdAt: '2026-06-01T00:00:00.000Z',
  lastActiveAt: '2026-06-09T00:00:00.000Z',
  resumeCount: 2,
  analysisCount: 5,
};
const detailAt = { route: `/admin/users/${TARGET.id}`, path: '/admin/users/:id' };

describe('admin users list (issue #79 / 9.2)', () => {
  it('debounced search drives server queries; empty state renders', async () => {
    const seen: string[] = [];
    server.use(
      mswHttp.get(`${API}/admin/users`, ({ request }) => {
        const url = new URL(request.url);
        seen.push(url.searchParams.get('search') ?? '');
        return HttpResponse.json({ items: [], total: 0 });
      }),
    );
    const user = userEvent.setup();
    renderWith(<AdminUsersScreen />, { auth: 'admin' });
    await screen.findByText('No users match');
    await user.type(screen.getByLabelText('Search users'), 'vic@');
    await waitFor(() => expect(seen).toContain('vic@'), { timeout: 3000 });
  });

  it('renders the PROMPT.md columns and the deactivate confirm flow', async () => {
    let deactivated = false;
    server.use(
      mswHttp.get(`${API}/admin/users`, () =>
        HttpResponse.json({
          items: [{ ...TARGET, status: deactivated ? 'deactivated' : 'active' }],
          total: 1,
        }),
      ),
      mswHttp.post(`${API}/admin/users/:id/deactivate`, () => {
        deactivated = true;
        return HttpResponse.json({ id: TARGET.id, status: 'deactivated' });
      }),
    );
    const user = userEvent.setup();
    renderWith(<AdminUsersScreen />, { auth: 'admin' });
    for (const col of ['Full name', 'Email', 'Registered', 'Last active', 'Resumes', 'Analyses']) {
      expect(
        await screen.findByRole('columnheader', { name: new RegExp(col) }),
      ).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: /Deactivate Vic Tim/ }));
    await user.click(screen.getByRole('button', { name: 'Deactivate' })); // confirm
    expect(await screen.findByText('deactivated')).toBeInTheDocument();
  });
});

describe('admin user details (issue #79 / 9.2)', () => {
  const baseHandlers = (over: Partial<typeof TARGET> = {}) => [
    mswHttp.get(`${API}/admin/users/:id`, () => HttpResponse.json({ ...TARGET, ...over })),
    mswHttp.get(`${API}/admin/users/:id/resumes`, () =>
      HttpResponse.json({
        items: [
          {
            id: 'r1',
            name: 'Backend CV',
            source: 'uploaded',
            createdAt: '',
            analysisCount: 3,
            analysisStatus: 'completed',
          },
        ],
        total: 1,
      }),
    ),
  ];

  it('temp password is shown exactly once with copy; email mode toasts', async () => {
    server.use(
      ...baseHandlers(),
      mswHttp.post(`${API}/admin/users/:id/reset-password`, async ({ request }) => {
        const body = (await request.json()) as { mode: string };
        return HttpResponse.json(
          body.mode === 'temporary'
            ? { mode: 'temporary', temporaryPassword: 'tmp-SECRET-99' }
            : { mode: 'email' },
        );
      }),
    );
    const user = userEvent.setup();
    renderWith(<AdminUserDetailScreen />, { auth: 'admin', ...detailAt });
    await screen.findByText('Vic Tim');
    await user.click(screen.getByRole('button', { name: 'Reset password' }));
    await user.click(screen.getByRole('button', { name: 'Generate temporary password' }));
    expect(await screen.findByText('tmp-SECRET-99')).toBeInTheDocument();
    expect(screen.getByText(/shown ONCE/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Done - I copied it/ }));
    expect(screen.queryByText('tmp-SECRET-99')).not.toBeInTheDocument(); // gone for good
  });

  it('resume metadata list shows NO content fields; cascade delete warns', async () => {
    let deleted = false;
    server.use(
      ...baseHandlers(),
      mswHttp.delete(`${API}/admin/resumes/:id`, () => {
        deleted = true;
        return HttpResponse.json({ resumeDeleted: true, analysesDeleted: 3 });
      }),
    );
    const user = userEvent.setup();
    const { container } = renderWith(<AdminUserDetailScreen />, { auth: 'admin', ...detailAt });
    await screen.findByText('Backend CV');
    // structural privacy: nothing resembling content in the DOM
    expect(container.innerHTML).not.toMatch(/jsonResume|originalText|summary|highlights/);
    await user.click(screen.getByRole('button', { name: /Delete resume Backend CV/ }));
    expect(await screen.findByText(/cascades/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete everything' }));
    await waitFor(() => expect(deleted).toBe(true));
    expect(await screen.findByText(/3 analyses removed/)).toBeInTheDocument();
  });

  it('edit collision shows the 409 toast; self account hides deactivation', async () => {
    server.use(
      ...baseHandlers({ id: adminUser.id, fullName: adminUser.fullName, email: adminUser.email }),
      mswHttp.patch(`${API}/admin/users/:id`, () =>
        HttpResponse.json({ statusCode: 409, error: 'Conflict', message: 'dup' }, { status: 409 }),
      ),
    );
    const user = userEvent.setup();
    renderWith(<AdminUserDetailScreen />, {
      auth: 'admin',
      route: `/admin/users/${adminUser.id}`,
      path: '/admin/users/:id',
    });
    await screen.findAllByText(adminUser.fullName);
    expect(screen.getByText('This is your own account.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Deactivate' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    await user.clear(screen.getByLabelText('Email'));
    await user.type(screen.getByLabelText('Email'), 'taken@example.com');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('That email is already in use')).toBeInTheDocument();
  });
});
