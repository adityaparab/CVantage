import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import DashboardScreen from './DashboardScreen';

import { sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  emit(type: string, data: unknown) {
    for (const fn of this.listeners.get(type) ?? []) {
      fn(new MessageEvent(type, { data: JSON.stringify(data) }));
    }
  }
  close() {
    /* noop */
  }
}

describe('dashboard (issue #67 / 8.3)', () => {
  it('renders the PROMPT.md columns and rows', async () => {
    renderWith(<DashboardScreen />);
    expect(await screen.findByText('Backend Resume')).toBeInTheDocument();
    for (const header of ['Name', 'Uploaded', 'Last analysis', 'Status']) {
      expect(screen.getByRole('columnheader', { name: new RegExp(header) })).toBeInTheDocument();
    }
    const row = screen.getByText('Backend Resume').closest('tr')!;
    expect(within(row).getByRole('button', { name: 'Analyze' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: /Delete/ })).toBeInTheDocument();
    expect(within(row).getByText('Completed')).toBeInTheDocument();
  });

  it('empty state renders for fresh accounts with working CTAs', async () => {
    server.use(
      mswHttp.get(`${API}/resumes`, () => HttpResponse.json({ items: [], total: 0 })),
      mswHttp.get(`${API}/users/me/stats`, () =>
        HttpResponse.json({ resumeCount: 0, analysisCount: 0 }),
      ),
    );
    renderWith(<DashboardScreen />);
    expect(await screen.findByText('No resumes yet')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Create resume' })) {
      expect(link).toHaveAttribute('href', '/resumes/new');
    }
  });

  it('delete: confirm -> optimistic removal -> rollback + toast on API failure', async () => {
    server.use(
      mswHttp.delete(`${API}/resumes/:id`, async () => {
        await new Promise((r) => setTimeout(r, 250)); // keep the optimistic window observable
        return HttpResponse.json(
          { statusCode: 500, error: 'Internal Server Error', message: 'boom', requestId: 'r1' },
          { status: 500 },
        );
      }),
    );
    const user = userEvent.setup();
    renderWith(<DashboardScreen />);
    await screen.findByText('Backend Resume');
    await user.click(screen.getByRole('button', { name: /Delete Backend Resume/ }));
    await user.click(screen.getByRole('button', { name: 'Delete' })); // confirm dialog
    // optimistic: row vanishes immediately
    await waitFor(() => expect(screen.queryByText('Backend Resume')).not.toBeInTheDocument());
    // rollback once the 500 lands + toast
    expect(await screen.findByText('Backend Resume')).toBeInTheDocument();
    expect(screen.getByText(/could not delete/i)).toBeInTheDocument();
  });

  it('live SSE bell event flips the status badge without refresh', async () => {
    vi.stubGlobal('EventSource', FakeEventSource as never);
    let status = 'in_progress';
    server.use(
      mswHttp.get(`${API}/resumes`, () =>
        HttpResponse.json({ items: [{ ...sampleResume, analysisStatus: status }], total: 1 }),
      ),
    );
    renderWith(<DashboardScreen />);
    expect(await screen.findByText('In progress')).toBeInTheDocument();
    status = 'completed';
    FakeEventSource.instances.at(-1)!.emit('bell', { items: [], total: 0 });
    expect(await screen.findByText('Completed')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
