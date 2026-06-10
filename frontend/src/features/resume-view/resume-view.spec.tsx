import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import ResumeViewScreen from './ResumeViewScreen';
import { setAtPath } from './set-at-path';

import { sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';

describe('setAtPath (issue #70 / 8.6)', () => {
  it('immutably sets scalars, nested values and array elements', () => {
    const base = { basics: { name: 'Ada' }, work: [{ highlights: ['a'] }] };
    const next = setAtPath(base, 'work.0.highlights', ['x', 'y']);
    expect(next.work[0]!.highlights).toEqual(['x', 'y']);
    expect(base.work[0]!.highlights).toEqual(['a']); // original untouched
    expect(setAtPath(base, 'basics.label', 'Engineer').basics).toMatchObject({
      name: 'Ada',
      label: 'Engineer',
    });
  });
});

describe('resume view in-place editing (issue #70 / 8.6)', () => {
  const patchSpy = () => {
    const bodies: Array<Record<string, unknown>> = [];
    server.use(
      mswHttp.patch(`${API}/resumes/:id`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        bodies.push(body);
        return HttpResponse.json({
          ...sampleResume,
          jsonResume: body.jsonResume,
          version: (body.version as number) + 1,
        });
      }),
    );
    return bodies;
  };

  it('pencil edit over scalar, date and array kinds persists the exact change', async () => {
    const bodies = patchSpy();
    const user = userEvent.setup();
    renderWith(<ResumeViewScreen />, {
      route: `/resumes/${sampleResume.id}/edit`,
      path: '/resumes/:id/edit',
    });
    await screen.findByText('Backend Resume');

    // scalar
    await user.click(screen.getByRole('button', { name: 'Edit Professional title' }));
    const input = screen.getByRole('textbox', { name: 'Edit Professional title' });
    await user.clear(input);
    await user.type(input, 'Staff Engineer');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    const sent = bodies[0]!.jsonResume as { basics: { label: string } };
    expect(sent.basics.label).toBe('Staff Engineer');
    expect(bodies[0]!.version).toBe(sampleResume.version);
    expect(await screen.findByText('Staff Engineer')).toBeInTheDocument(); // optimistic

    // date
    await user.click(screen.getAllByRole('button', { name: 'Edit Start date' })[0]!);
    const date = screen.getByRole('textbox', { name: 'Edit Start date' });
    await user.clear(date);
    await user.type(date, '2021-06');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    const sent2 = bodies[1]!.jsonResume as { work: Array<{ startDate: string }> };
    expect(sent2.work[0]!.startDate).toBe('2021-06');

    // array (lines)
    await user.click(screen.getAllByRole('button', { name: /Edit Highlights/ })[0]!);
    const lines = screen.getByRole('textbox', { name: /Edit Highlights/ });
    await user.clear(lines);
    await user.type(lines, 'Did a thing{enter}Did another');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(bodies).toHaveLength(3));
    const sent3 = bodies[2]!.jsonResume as { work: Array<{ highlights: string[] }> };
    expect(sent3.work[0]!.highlights).toEqual(['Did a thing', 'Did another']);
  });

  it('409 conflict rolls back, toasts and refreshes', async () => {
    server.use(
      mswHttp.patch(`${API}/resumes/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: 'Conflict',
            message: 'Version conflict',
            details: { currentVersion: 9 },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<ResumeViewScreen />, {
      route: `/resumes/${sampleResume.id}/edit`,
      path: '/resumes/:id/edit',
    });
    await screen.findByText('Backend Resume');
    await user.click(screen.getByRole('button', { name: 'Edit Professional title' }));
    const input = screen.getByRole('textbox', { name: 'Edit Professional title' });
    await user.clear(input);
    await user.type(input, 'Hijacked');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/changed somewhere else/i)).toBeInTheDocument();
    // rollback to server truth
    expect(screen.queryByText('Hijacked')).not.toBeInTheDocument();
  });

  it('pencil is keyboard-operable: Enter opens, Escape cancels without saving', async () => {
    const bodies = patchSpy();
    const user = userEvent.setup();
    renderWith(<ResumeViewScreen />, {
      route: `/resumes/${sampleResume.id}/edit`,
      path: '/resumes/:id/edit',
    });
    await screen.findByText('Backend Resume');
    const pencil = screen.getByRole('button', { name: 'Edit Professional title' });
    pencil.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('textbox', { name: 'Edit Professional title' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(
      screen.queryByRole('textbox', { name: 'Edit Professional title' }),
    ).not.toBeInTheDocument();
    expect(bodies).toHaveLength(0);
  });
});
