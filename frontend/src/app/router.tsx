import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router';

import { RedirectIfAuthed, RequireAuth, RequireRole } from './guards';
import AdminShell from './layouts/AdminShell';
import AppShell from './layouts/AppShell';
import MarketingLayout from './layouts/MarketingLayout';
import { ForbiddenPage, NotFoundPage } from './pages/errors';
import {
  AdminDashboardPage,
  AdminModelsPage,
  AdminUsersPage,
  AnalysesPage,
  DashboardPage,
  LandingPage,
  LoginPage,
  RegisterPage,
} from './pages/placeholders';

import { Skeleton } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';
import { env } from '@/lib/env';

const Showcase = lazy(() => import('@/features/showcase/Showcase'));

function PageFallback() {
  return (
    <div className="flex flex-col gap-3 py-8">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function Root() {
  return (
    <AuthProvider>
      <ScrollRestoration />
      <Outlet />
    </AuthProvider>
  );
}

const lazyPage = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

export const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <MarketingLayout />,
        children: [
          { path: '/', element: <LandingPage /> },
          {
            path: '/login',
            element: (
              <RedirectIfAuthed>
                <LoginPage />
              </RedirectIfAuthed>
            ),
          },
          {
            path: '/register',
            element: (
              <RedirectIfAuthed>
                <RegisterPage />
              </RedirectIfAuthed>
            ),
          },
        ],
      },
      {
        element: (
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        ),
        children: [
          { path: '/dashboard', element: <DashboardPage /> },
          { path: '/analyses', element: <AnalysesPage /> },
        ],
      },
      {
        path: '/admin',
        element: (
          <RequireRole requiredRole="admin">
            <AdminShell />
          </RequireRole>
        ),
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'users', element: <AdminUsersPage /> },
          { path: 'models', element: <AdminModelsPage /> },
        ],
      },
      ...(env.dev ? [{ path: '/showcase', element: lazyPage(<Showcase />) }] : []),
      { path: '/403', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
