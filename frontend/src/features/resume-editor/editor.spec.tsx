import { FULL_SAMPLE_RESUME } from '@cvantage/shared';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import CreateResumeScreen from './CreateResumeScreen';
import { EMPTY_FORM, fromFormModel, toFormModel } from './form-model';

import { sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';

describe('form model round-trip (issue #69 / 8.5)', () => {
  it('all 12 sections survive jsonResume -> form -> jsonResume', () => {
    const json = FULL_SAMPLE_RESUME as never;
    const out = fromFormModel(toFormModel(json)) as Record<string, unknown>;
    for (const section of [
      'basics',
      'work',
      'volunteer',
      'education',
      'awards',
      'certificates',
      'publications',
      'skills',
      'languages',
      'interests',
      'references',
      'projects',
    ]) {
      expect(out[section], `section ${section}`).toBeDefined();
    }
    const work = (out.work as Array<{ highlights: string[]; startDate: string }>)[0]!;
    expect(Array.isArray(work.highlights)).toBe(true);
    expect(work.startDate).toMatch(/^\d{4}/);
    const skills = (out.skills as Array<{ keywords: string[] }>)[0]!;
    expect(Array.isArray(skills.keywords)).toBe(true);
  });

  it('placeholder-only sections are NEVER sent (pruneEmpty at the boundary)', () => {
    const out = fromFormModel(EMPTY_FORM) as Record<string, unknown>;
    expect(Object.keys(out)).toEqual([]); // nothing at all
    const partial = fromFormModel({
      ...EMPTY_FORM,
      basics: { ...EMPTY_FORM.basics, name: 'Ada' },
    }) as { basics: Record<string, unknown>; work?: unknown };
    expect(partial.basics).toEqual({ name: 'Ada' });
    expect(partial.work).toBeUndefined();
  });
});

describe('create flow (issue #69 / 8.5)', () => {
  it('fills basics + a work entry, submits the pruned payload, navigates', async () => {
    let body: Record<string, unknown> | null = null;
    server.use(
      mswHttp.post(`${API}/resumes`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(sampleResume, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    renderWith(<CreateResumeScreen />);
    await user.type(screen.getByLabelText(/Resume name/), 'Backend roles 2026');
    await user.type(screen.getByLabelText(/Full name/), 'Ada Lovelace');
    await user.click(screen.getByRole('button', { name: '+ Add position' }));
    await user.type(screen.getByLabelText('Company'), 'Analytical Engines');
    await user.type(screen.getByLabelText('Start'), '2020-01');
    await user.click(screen.getByRole('button', { name: 'Save resume' }));
    await screen.findByText(/Resume saved/);
    const sent = body! as {
      name: string;
      jsonResume: {
        basics: { name: string };
        work: Array<Record<string, unknown>>;
        skills?: unknown;
      };
    };
    expect(sent.name).toBe('Backend roles 2026');
    expect(sent.jsonResume.basics).toEqual({ name: 'Ada Lovelace' });
    expect(sent.jsonResume.work[0]).toEqual({ name: 'Analytical Engines', startDate: '2020-01' });
    expect(sent.jsonResume.skills).toBeUndefined(); // placeholder sections absent
  });

  it('duplicate name 409 maps onto the resumeName field', async () => {
    server.use(
      mswHttp.post(`${API}/resumes`, () =>
        HttpResponse.json(
          { statusCode: 409, error: 'Conflict', message: 'duplicate' },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<CreateResumeScreen />);
    await user.type(screen.getByLabelText(/Resume name/), 'Taken');
    await user.click(screen.getByRole('button', { name: 'Save resume' }));
    expect(await screen.findByText(/already have a resume with that name/)).toBeInTheDocument();
  });

  it('invalid partial date blocks submit with the shared message', async () => {
    const user = userEvent.setup();
    renderWith(<CreateResumeScreen />);
    await user.type(screen.getByLabelText(/Resume name/), 'X');
    await user.click(screen.getByRole('button', { name: '+ Add position' }));
    await user.type(screen.getByLabelText('Start'), '13-2024');
    await user.click(screen.getByRole('button', { name: 'Save resume' }));
    expect(await screen.findByText(/Use YYYY, YYYY-MM or YYYY-MM-DD/)).toBeInTheDocument();
  });
});
