import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import AnalyzeScreen from './AnalyzeScreen';

import { sampleAnalysis, sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';
const at = { route: `/resumes/${sampleResume.id}/analyze`, path: '/resumes/:id/analyze' };

function LocationSpy() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

describe('analysis start screen (issue #72 / 8.8)', () => {
  it('invalid resume id redirects to the dashboard with an explanation', async () => {
    server.use(
      mswHttp.get(`${API}/resumes/:id`, () =>
        HttpResponse.json(
          { statusCode: 404, error: 'Not Found', message: 'Resume not found' },
          { status: 404 },
        ),
      ),
    );
    renderWith(<AnalyzeScreen />, {
      ...at,
      extraRoutes: [{ path: '/dashboard', element: <LocationSpy /> }],
    });
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'));
    expect(screen.getByText(/Pick a resume first/)).toBeInTheDocument();
  });

  it('shows the resume context, validates JD bounds with a live counter, gates Start', async () => {
    const user = userEvent.setup();
    renderWith(<AnalyzeScreen />, at);
    await screen.findByText('Backend Resume'); // context header from the route param
    const start = screen.getByRole('button', { name: 'Start analysis' });
    expect(start).toBeDisabled();

    await user.type(screen.getByLabelText(/Analysis name/), 'PE @ Acme');
    const jd = screen.getByLabelText(/Job description/);
    await user.type(jd, 'short');
    expect(screen.getByText(/min 30/)).toBeInTheDocument();
    expect(start).toBeDisabled();

    await user.type(jd, ' and now this becomes a perfectly long enough JD for the bounds.');
    expect(start).toBeEnabled();
  });

  it('Clear wipes exactly the two fields; resume context untouched', async () => {
    const user = userEvent.setup();
    renderWith(<AnalyzeScreen />, at);
    await screen.findByText('Backend Resume');
    await user.type(screen.getByLabelText(/Analysis name/), 'X');
    await user.type(screen.getByLabelText(/Job description/), 'some jd content here');
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect((screen.getByLabelText(/Analysis name/) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Job description/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByText('Backend Resume')).toBeInTheDocument();
  });

  it('start posts and navigates to the progress screen', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      mswHttp.post(`${API}/analyses`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...sampleAnalysis, status: 'pending' }, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWith(<AnalyzeScreen />, {
      ...at,
      extraRoutes: [{ path: '/analyses/:id', element: <LocationSpy /> }],
    });
    await screen.findByText('Backend Resume');
    await user.type(screen.getByLabelText(/Analysis name/), 'PE @ Acme');
    await user.type(
      screen.getByLabelText(/Job description/),
      'A long enough job description for a senior platform engineering position.',
    );
    await user.click(screen.getByRole('button', { name: 'Start analysis' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/analyses/${sampleAnalysis.id}`),
    );
    expect((body! as { resumeId: string }).resumeId).toBe(sampleResume.id);
  });
});
