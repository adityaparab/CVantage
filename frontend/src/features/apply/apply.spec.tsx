import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import ApplyScreen, { anchorOf } from './ApplyScreen';

import { sampleAnalysis, sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';
const at = { route: `/analyses/${sampleAnalysis.id}/apply`, path: '/analyses/:id/apply' };

describe('anchorOf (issue #75 / 8.11)', () => {
  it('maps fieldRefs to left-pane anchors', () => {
    expect(anchorOf('basics.label')).toBe('basics');
    expect(anchorOf('work[0].highlights')).toBe('work.0');
    expect(anchorOf('skills[2].keywords')).toBe('skills.2');
    expect(anchorOf('projects')).toBe('projects');
  });
});

describe('apply flow (issue #75 / 8.11)', () => {
  it('apply mutates the targeted field in the left pane and flips the card', async () => {
    let applied = false;
    server.use(
      mswHttp.get(`${API}/analyses/:id`, () =>
        HttpResponse.json({
          ...sampleAnalysis,
          result: {
            ...sampleAnalysis.result,
            suggestions: [{ ...sampleAnalysis.result!.suggestions![0]!, applied }],
          },
        }),
      ),
      mswHttp.get(`${API}/resumes/:id`, () =>
        HttpResponse.json({
          ...sampleResume,
          jsonResume: {
            ...sampleResume.jsonResume,
            basics: {
              ...(sampleResume.jsonResume as { basics: Record<string, unknown> }).basics,
              label: applied ? 'Senior Platform Engineer' : 'Senior Software Engineer',
            },
          },
        }),
      ),
      mswHttp.post(`${API}/analyses/:id/suggestions/:sid/apply`, () => {
        applied = true;
        return HttpResponse.json({
          outcome: 'applied',
          suggestion: { ...sampleAnalysis.result!.suggestions![0]!, applied: true },
        });
      }),
    );
    const user = userEvent.setup();
    renderWith(<ApplyScreen />, at);
    await screen.findByText('Senior Software Engineer');
    await user.click(screen.getByRole('button', { name: /Apply: Mirror the job title/ }));
    await screen.findByText('Suggestion applied to your resume');
    expect(await screen.findByText('Senior Platform Engineer')).toBeInTheDocument(); // left pane mutated
    expect(await screen.findByText('applied')).toBeInTheDocument(); // card flipped
    expect(screen.getByRole('button', { name: /Apply: Mirror the job title/ })).toBeDisabled();
  });

  it('hover/focus on a card highlights its target field (keyboard-triggerable)', async () => {
    const { container } = renderWith(<ApplyScreen />, at);
    await screen.findByText('Mirror the job title');
    const card = screen.getByText('Mirror the job title').closest('li')!;
    card.focus();
    await waitFor(() => {
      const target = container.querySelector('[data-field="basics"]')!;
      expect(target.className).toContain('ring-2');
    });
    (card as HTMLElement).blur();
    await waitFor(() => {
      const target = container.querySelector('[data-field="basics"]')!;
      expect(target.className).not.toContain('ring-2');
    });
  });

  it('409 conflict toasts and refreshes; download stays disabled with tooltip', async () => {
    server.use(
      mswHttp.post(`${API}/analyses/:id/suggestions/:sid/apply`, () =>
        HttpResponse.json(
          { statusCode: 409, error: 'Conflict', message: 'Version conflict' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<ApplyScreen />, at);
    await screen.findByText('Mirror the job title');
    await user.click(screen.getByRole('button', { name: /Apply: Mirror the job title/ }));
    expect(await screen.findByText(/changed elsewhere/i)).toBeInTheDocument();
    const download = screen.getByRole('button', { name: /Download/ });
    expect(download).toBeDisabled();
    expect(screen.getByRole('tooltip', { hidden: true })).toHaveTextContent(/export service/i);
  });

  it('dismiss persists via refetch; dismissed cards drop their Dismiss button', async () => {
    let dismissed = false;
    server.use(
      mswHttp.get(`${API}/analyses/:id`, () =>
        HttpResponse.json({
          ...sampleAnalysis,
          result: {
            ...sampleAnalysis.result,
            suggestions: [{ ...sampleAnalysis.result!.suggestions![0]!, dismissed }],
          },
        }),
      ),
      mswHttp.post(`${API}/analyses/:id/suggestions/:sid/dismiss`, () => {
        dismissed = true;
        return HttpResponse.json({ id: 's', dismissed: true });
      }),
    );
    const user = userEvent.setup();
    renderWith(<ApplyScreen />, at);
    await screen.findByText('Mirror the job title');
    await user.click(screen.getByRole('button', { name: /Dismiss: Mirror the job title/ }));
    await screen.findByText('dismissed');
    expect(screen.queryByRole('button', { name: /Dismiss:/ })).not.toBeInTheDocument();
  });
});
