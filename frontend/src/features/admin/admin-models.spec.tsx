import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http as mswHttp } from 'msw';
import { describe, expect, it } from 'vitest';

import AdminModelsScreen from './AdminModelsScreen';

import { server } from '@/test/msw/server';
import { renderWith } from '@/test/render';


const API = '/api/v1';
const MODEL = {
  id: 'm1',
  provider: 'openai',
  modelName: 'gpt-4o',
  apiKeyMasked: '••••3kF9',
  usages: ['analysis'],
  status: 'active' as const,
  lastUsedAt: '2026-06-10T10:00:00.000Z',
};

describe('admin model settings (issue #80 / 9.3)', () => {
  it('table shows masked keys only; raw key never reaches the DOM after create', async () => {
    let created = false;
    server.use(
      mswHttp.get(`${API}/admin/models`, () => HttpResponse.json(created ? [MODEL] : [])),
      mswHttp.post(`${API}/admin/models`, () => {
        created = true;
        return HttpResponse.json(MODEL, { status: 201 });
      }),
    );
    const user = userEvent.setup();
    const { container } = renderWith(<AdminModelsScreen />, { auth: 'admin' });
    await screen.findByText(/env fallback serves requests/);
    const keyInput = screen.getByLabelText('API key');
    expect(keyInput).toHaveAttribute('type', 'password');
    expect(keyInput).toHaveAttribute('autocomplete', 'off');
    await user.type(screen.getByLabelText('Model name'), 'gpt-4o');
    await user.type(keyInput, 'sk-live-raw-SECRET-3kF9');
    await user.click(screen.getByRole('button', { name: /Validate & add/ }));
    expect(await screen.findByText('••••3kF9')).toBeInTheDocument();
    expect(container.innerHTML).not.toContain('sk-live-raw-SECRET');
  });

  it('invalid key shows the inline provider error and preserves other fields', async () => {
    server.use(
      mswHttp.get(`${API}/admin/models`, () => HttpResponse.json([])),
      mswHttp.post(`${API}/admin/models`, () =>
        HttpResponse.json(
          {
            statusCode: 422,
            error: 'Unprocessable Entity',
            message: 'API key validation failed: Incorrect API key provided (simulated)',
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<AdminModelsScreen />, { auth: 'admin' });
    await screen.findByText(/Add a model/);
    await user.type(screen.getByLabelText('Model name'), 'gpt-4o');
    await user.type(screen.getByLabelText('API key'), 'sk-!!BAD_KEY!!-x');
    await user.click(screen.getByRole('button', { name: /Validate & add/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Incorrect API key/);
    expect((screen.getByLabelText('Model name') as HTMLInputElement).value).toBe('gpt-4o'); // preserved
  });

  it('rotate updates the mask; disable flips status', async () => {
    let mask = '••••3kF9';
    let status: 'active' | 'disabled' = 'active';
    server.use(
      mswHttp.get(`${API}/admin/models`, () =>
        HttpResponse.json([{ ...MODEL, apiKeyMasked: mask, status }]),
      ),
      mswHttp.post(`${API}/admin/models/:id/rotate-key`, () => {
        mask = '••••ZZ77';
        return HttpResponse.json({ ...MODEL, apiKeyMasked: mask });
      }),
      mswHttp.patch(`${API}/admin/models/:id`, () => {
        status = 'disabled';
        return HttpResponse.json({ ...MODEL, status });
      }),
    );
    const user = userEvent.setup();
    renderWith(<AdminModelsScreen />, { auth: 'admin' });
    await screen.findByText('••••3kF9');
    await user.click(screen.getByRole('button', { name: 'Rotate key' }));
    await user.type(screen.getByLabelText('New API key'), 'sk-rotated-ZZ77');
    const rotateBtn = screen.getByRole('button', { name: /Validate & rotate/ });
    expect(rotateBtn).toBeEnabled();
    await user.click(rotateBtn);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), {
      timeout: 4000,
    });
    expect(await screen.findByText('••••ZZ77', undefined, { timeout: 4000 })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Disable' }));
    expect(await screen.findByText('disabled')).toBeInTheDocument();
  });

  it('delete-last-active shows the guard explanation with orphaned usages', async () => {
    server.use(
      mswHttp.get(`${API}/admin/models`, () => HttpResponse.json([MODEL])),
      mswHttp.delete(`${API}/admin/models/:id`, () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: 'Conflict',
            message: 'last active',
            details: { orphanedUsages: ['analysis'] },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWith(<AdminModelsScreen />, { auth: 'admin' });
    await screen.findByText('gpt-4o');
    await user.click(screen.getByRole('button', { name: 'Delete gpt-4o' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText(/Cannot delete the last active model/)).toBeInTheDocument();
    expect(screen.getByText(/No fallback exists for: analysis/)).toBeInTheDocument();
  });
});
