import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import UploadScreen, { humanizeParseError, precheck } from './UploadScreen';

import { sampleResume } from '@/test/msw/fixtures';
import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';

function LocationSpy() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname}</p>;
}

const API = '/api/v1';

const file = (name: string, type: string, size = 1000) => {
  const f = new File(['x'.repeat(Math.min(size, 1000))], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};

describe('client pre-checks (issue #68 / 8.4)', () => {
  it('rejects wrong types, oversize and empties with friendly messages', () => {
    expect(precheck(file('cv.exe', 'application/octet-stream'))).toMatch(/pdf, .doc and .docx/i);
    expect(precheck(file('cv.pdf', 'text/html'))).toMatch(/does not look like/i);
    expect(precheck(file('cv.pdf', 'application/pdf', 11 * 1024 * 1024))).toMatch(/10 MB/);
    expect(precheck(file('cv.pdf', 'application/pdf', 0))).toMatch(/empty/i);
    expect(precheck(file('cv.pdf', 'application/pdf'))).toBeNull();
    expect(precheck(file('cv.docx', ''))).toBeNull(); // some browsers omit MIME
  });

  it('humanizes typed parse failures', () => {
    expect(humanizeParseError('ENCRYPTED_PDF: locked')).toMatch(/password/i);
    expect(humanizeParseError('EMPTY_TEXT: nothing')).toMatch(/scanned image/i);
    expect(humanizeParseError('CORRUPT_FILE: bad')).toMatch(/corrupted/i);
  });
});

describe('upload -> parse phases (issue #68 / 8.4)', () => {
  it('upload, AI-processing phase, then navigates on parse completion', async () => {
    // first poll already sees completion - the interval loop itself is
    // exercised against the real backend in dev/e2e (jsdom pauses RQ intervals)
    const parsed = true;
    server.use(
      mswHttp.post(`${API}/resumes/upload`, () =>
        HttpResponse.json({ ...sampleResume, uploadParse: { status: 'pending' } }, { status: 201 }),
      ),
      mswHttp.get(`${API}/resumes/:id`, () =>
        HttpResponse.json({
          ...sampleResume,
          uploadParse: { status: parsed ? 'completed' : 'processing' },
        }),
      ),
    );
    const user = userEvent.setup();
    renderWith(
      <>
        <UploadScreen />
        <LocationSpy />
      </>,
    );
    await user.upload(
      screen.getByLabelText('Choose resume file'),
      file('cv.pdf', 'application/pdf'),
    );
    // the first poll sees completion and navigates to the review screen
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/\/review$/), {
      timeout: 4000,
    });
  });

  it('parse failure shows a humanized error and Retry recovers via reparse', async () => {
    let attempts = 0;
    server.use(
      mswHttp.post(`${API}/resumes/upload`, () =>
        HttpResponse.json(
          {
            ...sampleResume,
            uploadParse: {
              status: 'failed',
              error: 'ENCRYPTED_PDF: The PDF is password-protected',
            },
          },
          { status: 201 },
        ),
      ),
      mswHttp.post(`${API}/resumes/:id/reparse`, () => {
        attempts += 1;
        return HttpResponse.json(
          { id: sampleResume.id, uploadParse: { status: 'pending' } },
          { status: 202 },
        );
      }),
      mswHttp.get(`${API}/resumes/:id`, () =>
        HttpResponse.json({ ...sampleResume, uploadParse: { status: 'processing' } }),
      ),
    );
    const user = userEvent.setup();
    renderWith(<UploadScreen />);
    await user.upload(
      screen.getByLabelText('Choose resume file'),
      file('cv.pdf', 'application/pdf'),
    );
    expect(await screen.findByText(/password-protected/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText(/AI is processing your resume/)).toBeInTheDocument();
    expect(attempts).toBe(1);
  });

  it('server 422 (spoofed content) lands back on the dropzone with the message', async () => {
    server.use(
      mswHttp.post(`${API}/resumes/upload`, () =>
        HttpResponse.json(
          {
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: 'File content does not match its declared type',
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<UploadScreen />);
    await user.upload(
      screen.getByLabelText('Choose resume file'),
      file('cv.pdf', 'application/pdf'),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not match/i);
    expect(screen.getByText(/Drag & drop/)).toBeInTheDocument(); // dropzone reset
  });
});
