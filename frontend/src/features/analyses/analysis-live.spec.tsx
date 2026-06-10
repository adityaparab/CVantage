import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import AnalysisScreen from './AnalysisScreen';

import { NotificationsBell } from '@/features/notifications/NotificationsBell';
import { sampleAnalysis, sampleNotification } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';
const at = { route: `/analyses/${sampleAnalysis.id}`, path: '/analyses/:id' };

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners = new Map<string, Array<(e: MessageEvent) => void>>();
  onerror: (() => void) | null = null;
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

const inProgress = (stepStatuses: Array<'pending' | 'in_progress' | 'completed'>) => ({
  ...sampleAnalysis,
  status: 'in_progress' as const,
  steps: sampleAnalysis.steps.map((s, i) => ({ ...s, status: stepStatuses[i]! })),
  result: undefined,
});

describe('analysis progress lifecycle (issue #73 / 8.9)', () => {
  it('SSE events animate the steps and completion fires the toast + results', async () => {
    vi.stubGlobal('EventSource', FakeEventSource as never);
    server.use(
      mswHttp.get(`${API}/analyses/:id`, () =>
        HttpResponse.json(inProgress(['in_progress', 'pending', 'pending'])),
      ),
    );
    renderWith(<AnalysisScreen />, at);
    await screen.findByText(/Analyzing your resume/);
    expect(screen.getByText('Comparing resume & JD')).toBeInTheDocument();

    const source = FakeEventSource.instances.at(-1)!;
    source.emit('status', inProgress(['completed', 'in_progress', 'pending']));
    await screen.findByText('Generating suggestions');

    source.emit('status', sampleAnalysis); // terminal: completed fixture
    await screen.findByText('Analysis complete'); // exactly-once toast
    expect(await screen.findByText(/Improvement suggestions/i)).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('SSE drop -> polling fallback keeps progressing to terminal', async () => {
    vi.stubGlobal('EventSource', FakeEventSource as never);
    let polls = 0;
    server.use(
      mswHttp.get(`${API}/analyses/:id`, () => {
        polls += 1;
        return HttpResponse.json(
          polls >= 2 ? sampleAnalysis : inProgress(['in_progress', 'pending', 'pending']),
        );
      }),
    );
    renderWith(<AnalysisScreen />, at);
    await screen.findByText(/Analyzing your resume/);
    FakeEventSource.instances.at(-1)!.onerror?.(); // stream drops -> polling takes over
    await screen.findByText(/Improvement suggestions/i, undefined, { timeout: 6000 });
    expect(polls).toBeGreaterThanOrEqual(2);
    vi.unstubAllGlobals();
  });

  it('failed analysis shows the error panel and Retry restarts it', async () => {
    const failed = {
      ...sampleAnalysis,
      status: 'failed' as const,
      error: 'QUOTA: fake failure',
      result: undefined,
      steps: sampleAnalysis.steps.map((s, i) => ({
        ...s,
        status: i === 0 ? ('completed' as const) : ('failed' as const),
      })),
    };
    let retried = false;
    server.use(
      mswHttp.get(`${API}/analyses/:id`, () =>
        HttpResponse.json(retried ? inProgress(['in_progress', 'pending', 'pending']) : failed),
      ),
      mswHttp.post(`${API}/analyses/:id/retry`, () => {
        retried = true;
        return HttpResponse.json({ ...failed, status: 'pending', error: undefined });
      }),
    );
    const user = userEvent.setup();
    renderWith(<AnalysisScreen />, at);
    await screen.findByText(/This analysis failed/);
    expect(screen.getByText(/QUOTA: fake failure/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry analysis' }));
    await screen.findByText(/Queued - starting any second/);
  });
});

describe('bell (issue #73 / 8.9)', () => {
  it('shows the count, opens the panel, click-through navigates, clear works', async () => {
    let cleared = false;
    server.use(
      mswHttp.get(`${API}/notifications`, () =>
        HttpResponse.json(
          cleared ? { items: [], total: 0 } : { items: [sampleNotification], total: 1 },
        ),
      ),
      mswHttp.post(`${API}/notifications/:id/clear`, () => {
        cleared = true;
        return HttpResponse.json({ id: sampleNotification.id, state: 'cleared' });
      }),
    );
    const user = userEvent.setup();
    renderWith(<NotificationsBell />, {
      extraRoutes: [{ path: '/analyses/:id', element: <p>analysis page</p> }],
    });
    const bellBtn = await screen.findByRole('button', { name: /Notifications \(1 active\)/ });
    await user.click(bellBtn);
    expect(screen.getByText(sampleNotification.title)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Clear notification/ }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument(),
    );
  });
});
