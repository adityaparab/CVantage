import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';

import { authHandlers } from './msw/handlers';
import { server } from './msw/server';

import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';

export type AuthScenario = 'anonymous' | 'candidate' | 'admin';

function Providers() {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <Outlet />
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

/** Boot any UI in one line with providers + chosen auth state (#63).
 *  Providers wrap a layout route, so toasts/dialogs survive navigation
 *  into extraRoutes. */
export function renderWith(
  ui: ReactNode,
  {
    auth = 'candidate',
    route = '/',
    path = '*',
    extraRoutes = [],
  }: {
    auth?: AuthScenario;
    route?: string;
    path?: string;
    extraRoutes?: Array<{ path: string; element: ReactNode }>;
  } = {},
): RenderResult & { client: QueryClient } {
  server.use(authHandlers[auth]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <Providers />,
        children: [...extraRoutes, { path, element: ui }],
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
