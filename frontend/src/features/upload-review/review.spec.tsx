import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import ReviewScreen from './ReviewScreen';

import { sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

const API = '/api/v1';
const at = { route: `/resumes/${sampleResume.id}/review`, path: '/resumes/:id/review' };

function LocationSpy() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

describe('upload review (issue #71 / 8.7)', () => {
  it(
    'parsed fixture populates the shared editor; original text renders beside it',
    { timeout: 30_000 },
    async () => {
      server.use(
        mswHttp.get(`${API}/resumes/:id`, () =>
          HttpResponse.json({
            ...sampleResume,
            originalText: 'ADA LOVELACE\nSenior Software Engineer\nLondon',
            uploadParse: { status: 'completed', modelUsed: 'fake/fake-fixture' },
          }),
        ),
      );
      renderWith(<ReviewScreen />, at);
      await screen.findByText(/Review .Backend Resume./);
      // form populated from the parsed jsonResume (shared component - no fork)
      const nameInputs = screen.getAllByLabelText(/Full name/);
      await waitFor(() => expect((nameInputs[0] as HTMLInputElement).value).not.toBe(''));
      // original text panel present (both layouts render it)
      expect(screen.getAllByText(/ADA LOVELACE/)[0]).toBeInTheDocument();
    },
  );

  it(
    'save then Start analysis navigates with the resume preselected',
    { timeout: 60_000 },
    async () => {
      server.use(
        mswHttp.get(`${API}/resumes/:id`, () =>
          HttpResponse.json({
            ...sampleResume,
            originalText: 'text',
            uploadParse: { status: 'completed' },
          }),
        ),
        mswHttp.patch(`${API}/resumes/:id`, async ({ request }) => {
          const body = (await request.json()) as { jsonResume: unknown; version: number };
          return HttpResponse.json({ ...sampleResume, jsonResume: body.jsonResume, version: 4 });
        }),
      );
      const user = userEvent.setup();
      renderWith(
        <>
          <ReviewScreen />
          <LocationSpy />
        </>,
        { ...at, extraRoutes: [{ path: '/resumes/:id/analyze', element: <LocationSpy /> }] },
      );
      await screen.findByText(/Review .Backend Resume./);
      const label = screen.getAllByLabelText(/Professional title/)[0]!;
      await user.clear(label);
      await user.type(label, 'Staff Engineer');
      await user.click(screen.getAllByRole('button', { name: 'Save corrections' })[0]!);
      await screen.findByText(/you can start an analysis now/i);
      await user.click(screen.getByRole('button', { name: 'Start analysis' }));
      expect(await screen.findByTestId('location')).toHaveTextContent(
        `/resumes/${sampleResume.id}/analyze`,
      );
    },
  );

  it('failed-parse entry state offers retry and manual editing', async () => {
    server.use(
      mswHttp.get(`${API}/resumes/:id`, () =>
        HttpResponse.json({
          ...sampleResume,
          uploadParse: { status: 'failed', error: 'EMPTY_TEXT: nothing extractable' },
        }),
      ),
    );
    renderWith(<ReviewScreen />, at);
    expect(await screen.findByText(/Parsing failed/)).toBeInTheDocument();
    expect(screen.getByText(/scanned image/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/resumes/upload',
    );
    expect(screen.getByRole('link', { name: /Edit manually/ })).toBeInTheDocument();
  });
});
