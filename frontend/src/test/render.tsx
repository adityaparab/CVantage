import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';

import { authHandlers } from './msw/handlers';
import { server } from './msw/server';

import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';

export type AuthScenario = 'anonymous' | 'candidate' | 'admin';

/** Boot any UI in one line with providers + chosen auth state (#63). */
export function renderWith(
  ui: ReactNode,
  {
    auth = 'candidate',
    route = '/',
    path = '*',
  }: { auth?: AuthScenario; route?: string; path?: string } = {},
): RenderResult & { client: QueryClient } {
  server.use(authHandlers[auth]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path,
        element: (
          <AuthProvider>
            <ToastProvider>
              <ConfirmProvider>{ui}</ConfirmProvider>
            </ToastProvider>
          </AuthProvider>
        ),
      },
    ],
    { initialEntries: [route] },
  );
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  };
}
