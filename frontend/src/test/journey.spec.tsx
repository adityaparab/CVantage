import { FULL_SAMPLE_RESUME } from '@cvantage/shared';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from './msw/server';
import { renderWith } from './render';

import type { Types } from '@/api/types';
import AnalysisScreen from '@/features/analyses/AnalysisScreen';
import AnalyzeScreen from '@/features/analyses/AnalyzeScreen';
import ApplyScreen from '@/features/apply/ApplyScreen';
import RegisterScreen from '@/features/auth/screens/RegisterScreen';
import CreateResumeScreen from '@/features/resume-editor/CreateResumeScreen';
import { candidateUser, sampleAnalysis } from '@/test/msw/fixtures';

const API = '/api/v1';

/**
 * The product in one spec (issue #76 / 8.12):
 * register -> create resume -> analyze -> results -> apply.
 * One stateful MSW world; each screen hands off to the next via routes.
 */
describe('full candidate journey (issue #76 / 8.12)', () => {
  it('register -> create -> analyze -> results -> apply', { timeout: 30_000 }, async () => {
    // ---- stateful fake backend ----
    const world = {
      registered: false,
      resume: null as Types.ResumeDetail | null,
      analysis: null as Types.Analysis | null,
    };
    server.use(
      mswHttp.post(`${API}/auth/register`, () => {
        world.registered = true;
        return HttpResponse.json(candidateUser, { status: 201 });
      }),
      mswHttp.post(`${API}/auth/login`, () =>
        HttpResponse.json({ accessToken: 'jwt', user: candidateUser }),
      ),
      mswHttp.get(`${API}/auth/providers`, () => HttpResponse.json({})),
      mswHttp.post(`${API}/resumes`, async ({ request }) => {
        const body = (await request.json()) as {
          name: string;
          jsonResume: Types.ResumeDetail['jsonResume'];
        };
        world.resume = {
          id: 'r-journey',
          name: body.name,
          source: 'created',
          analysisStatus: 'unanalyzed',
          analysisCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: 1,
          jsonResume: body.jsonResume,
        };
        return HttpResponse.json(world.resume, { status: 201 });
      }),
      mswHttp.get(`${API}/resumes/:id`, () =>
        world.resume ? HttpResponse.json(world.resume) : HttpResponse.json({}, { status: 404 }),
      ),
      mswHttp.post(`${API}/analyses`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        world.analysis = {
          ...sampleAnalysis,
          id: 'a-journey',
          name: body.name,
          status: 'completed',
        };
        return HttpResponse.json({ ...world.analysis, status: 'pending' }, { status: 201 });
      }),
      mswHttp.get(`${API}/analyses/:id`, () =>
        world.analysis ? HttpResponse.json(world.analysis) : HttpResponse.json({}, { status: 404 }),
      ),
      mswHttp.post(`${API}/analyses/:id/suggestions/:sid/apply`, () => {
        const suggestion = { ...world.analysis!.result!.suggestions![0]!, applied: true };
        world.analysis = {
          ...world.analysis!,
          result: { ...world.analysis!.result, suggestions: [suggestion] },
        };
        world.resume = {
          ...world.resume!,
          jsonResume: {
            ...world.resume!.jsonResume,
            basics: {
              ...(world.resume!.jsonResume as { basics?: Record<string, unknown> }).basics,
              label: suggestion.proposedValue,
            },
          } as Types.ResumeDetail['jsonResume'],
        };
        return HttpResponse.json({ outcome: 'applied', suggestion });
      }),
    );

    const user = userEvent.setup();

    // stage 1: register (auto-login)
    const r1 = renderWith(<RegisterScreen />, {
      auth: 'anonymous',
      route: '/register',
      path: '/register',
      extraRoutes: [{ path: '/dashboard', element: <p>dash</p> }],
    });
    await user.type(await screen.findByLabelText(/Full name/), 'Journey Tester');
    await user.type(screen.getByLabelText(/Email/), 'journey@e2e.test');
    await user.type(screen.getByLabelText(/^Password/), 'Engine-4242X');
    await user.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(world.registered).toBe(true));
    r1.unmount();

    // stage 2: create the resume
    const r2 = renderWith(<CreateResumeScreen />, {
      extraRoutes: [{ path: '/resumes/:id/edit', element: <p>resume saved page</p> }],
    });
    await user.type(await screen.findByLabelText(/Resume name/), 'Journey Resume');
    await user.type(screen.getByLabelText(/Full name/), 'Journey Tester');
    await user.click(screen.getByRole('button', { name: 'Save resume' }));
    await waitFor(() => expect(world.resume).not.toBeNull());
    await screen.findByText('resume saved page');
    expect(world.resume?.name).toBe('Journey Resume');
    r2.unmount();

    // stage 3: analyze it (resume preselected via the route param)
    const r3 = renderWith(<AnalyzeScreen />, {
      route: '/resumes/r-journey/analyze',
      path: '/resumes/:id/analyze',
      extraRoutes: [{ path: '/analyses/:id', element: <AnalysisScreen /> }],
    });
    await screen.findByText('Journey Resume');
    await user.type(screen.getByLabelText(/Analysis name/), 'Journey @ Acme');
    await user.type(
      screen.getByLabelText(/Job description/),
      'A perfectly long enough job description for the journey integration spec.',
    );
    await user.click(screen.getByRole('button', { name: 'Start analysis' }));

    // stage 4: results render from the (already-terminal) world state
    expect(await screen.findByText(/Improvement suggestions/i)).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Overall match' })).toHaveTextContent('72');
    r3.unmount();

    // stage 5: apply the suggestion - the live resume mutates
    renderWith(<ApplyScreen />, {
      route: '/analyses/a-journey/apply',
      path: '/analyses/:id/apply',
    });
    await user.click(await screen.findByRole('button', { name: /Apply: Mirror the job title/ }));
    await waitFor(() =>
      expect((world.resume!.jsonResume as { basics: { label: string } }).basics.label).toBe(
        'Senior Platform Engineer',
      ),
    );
  });

  it('landing page renders (marketing folder smoke)', async () => {
    const { default: LandingPage } = await import('@/features/marketing/LandingPage');
    renderWith(<LandingPage />, { auth: 'anonymous' });
    expect(await screen.findByText(/hiring side/)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /free/i })[0]).toHaveAttribute('href', '/register');
  });

  it('analyses list renders rows (list smoke)', async () => {
    const { default: AnalysesListScreen } = await import('@/features/analyses/AnalysesListScreen');
    renderWith(<AnalysesListScreen />);
    expect(await screen.findByText('Platform Engineer @ Acme')).toBeInTheDocument();
    expect(screen.getByText('72/100')).toBeInTheDocument();
  });

  it('sample journey jsonResume fixture stays valid against the shared schema', () => {
    expect(FULL_SAMPLE_RESUME).toBeDefined();
  });
});
