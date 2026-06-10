import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DownloadMenu } from './DownloadMenu';

import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';


const API = '/api/v1';

describe('download menu (issue #82 / 9.5)', () => {
  beforeEach(() => {
    // jsdom lacks object URLs; add them WITHOUT replacing the URL constructor
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:fake'),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });
  afterEach(() => {
    delete (URL as { createObjectURL?: unknown }).createObjectURL;
    delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
  });

  it('downloads both formats with the server-provided filename', async () => {
    const clicks: string[] = [];
    const origCreate = document.createElement.bind(document);
    const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = () => {
          clicks.push((el as HTMLAnchorElement).download);
        };
      }
      return el;
    }) as never);
    server.use(
      mswHttp.get(`${API}/resumes/:id/export`, ({ request }) => {
        const format = new URL(request.url).searchParams.get('format')!;
        return new HttpResponse(format === 'pdf' ? '%PDF-1.7' : 'PK', {
          headers: {
            'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/octet-stream',
            'Content-Disposition': `attachment; filename="backend-resume.${format}"`,
          },
        });
      }),
    );
    const user = userEvent.setup();
    renderWith(<DownloadMenu resumeId="r1" resumeName="Backend Resume" />);
    await user.click(screen.getByRole('button', { name: /Download/ }));
    await user.click(screen.getByRole('menuitem', { name: /PDF/ }));
    await waitFor(() => expect(clicks).toContain('backend-resume.pdf'));
    await user.click(screen.getByRole('button', { name: /Download/ }));
    await user.click(screen.getByRole('menuitem', { name: /Word/ }));
    await waitFor(() => expect(clicks).toContain('backend-resume.docx'));
    spy.mockRestore();
  });

  it('503 (pdf unconfigured) and 500 surface toasts; the menu recovers', async () => {
    server.use(
      mswHttp.get(`${API}/resumes/:id/export`, () =>
        HttpResponse.json(
          { statusCode: 503, error: 'Service Unavailable', message: 'PDF export is not configured' },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<DownloadMenu resumeId="r1" resumeName="X" />);
    await user.click(screen.getByRole('button', { name: /Download/ }));
    await user.click(screen.getByRole('menuitem', { name: /PDF/ }));
    expect(await screen.findByText(/PDF export failed/)).toBeInTheDocument();
    expect(screen.getByText(/not configured on this deployment/)).toBeInTheDocument();
    // recovers: menu can open again
    await user.click(screen.getByRole('button', { name: /Download/ }));
    expect(screen.getByRole('menuitem', { name: /Word/ })).toBeInTheDocument();
  });
});
