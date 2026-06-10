import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter, Outlet, ScrollRestoration } from 'react-router';

import { RedirectIfAuthed, RequireAuth, RequireRole } from './guards';
import AdminShell from './layouts/AdminShell';
import AppShell from './layouts/AppShell';
import MarketingLayout from './layouts/MarketingLayout';
import { ForbiddenPage, NotFoundPage } from './pages/errors';
import { AdminDashboardPage, AdminModelsPage, AdminUsersPage } from './pages/placeholders';
import { QueryProvider } from './query';

import { Skeleton, ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/auth-context';
import { env } from '@/lib/env';

const Showcase = lazy(() => import('@/features/showcase/Showcase'));
const LandingPage = lazy(() => import('@/features/marketing/LandingPage'));
const AnalysesListScreen = lazy(() => import('@/features/analyses/AnalysesListScreen'));
const ApplyScreen = lazy(() => import('@/features/apply/ApplyScreen'));
const AnalysisScreen = lazy(() => import('@/features/analyses/AnalysisScreen'));
const AnalyzeScreen = lazy(() => import('@/features/analyses/AnalyzeScreen'));
const ReviewScreen = lazy(() => import('@/features/upload-review/ReviewScreen'));
const ResumeViewScreen = lazy(() => import('@/features/resume-view/ResumeViewScreen'));
const CreateResumeScreen = lazy(() => import('@/features/resume-editor/CreateResumeScreen'));
const UploadScreen = lazy(() => import('@/features/upload/UploadScreen'));
const DashboardScreen = lazy(() => import('@/features/dashboard/DashboardScreen'));
const LoginScreen = lazy(() => import('@/features/auth/screens/LoginScreen'));
const RegisterScreen = lazy(() => import('@/features/auth/screens/RegisterScreen'));
const PasswordScreens = lazy(() =>
  import('@/features/auth/screens/PasswordScreens').then((m) => ({
    default: m.ForgotPasswordScreen,
  })),
);
const ResetScreen = lazy(() =>
  import('@/features/auth/screens/PasswordScreens').then((m) => ({
    default: m.ResetPasswordScreen,
  })),
);
const VerifyScreen = lazy(() =>
  import('@/features/auth/screens/PasswordScreens').then((m) => ({
    default: m.VerifyEmailScreen,
  })),
);

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
    <QueryProvider>
      <AuthProvider>
        <ToastProvider>
          <ScrollRestoration />
          <Outlet />
        </ToastProvider>
      </AuthProvider>
    </QueryProvider>
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
          { path: '/', element: lazyPage(<LandingPage />) },
          {
            path: '/login',
            element: <RedirectIfAuthed>{lazyPage(<LoginScreen />)}</RedirectIfAuthed>,
          },
          { path: '/forgot-password', element: lazyPage(<PasswordScreens />) },
          { path: '/reset-password', element: lazyPage(<ResetScreen />) },
          { path: '/verify-email', element: lazyPage(<VerifyScreen />) },
          {
            path: '/register',
            element: <RedirectIfAuthed>{lazyPage(<RegisterScreen />)}</RedirectIfAuthed>,
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
          { path: '/dashboard', element: lazyPage(<DashboardScreen />) },
          { path: '/analyses', element: lazyPage(<AnalysesListScreen />) },
          { path: '/analyses/:id', element: lazyPage(<AnalysisScreen />) },
          { path: '/analyses/:id/apply', element: lazyPage(<ApplyScreen />) },
          { path: '/resumes/new', element: lazyPage(<CreateResumeScreen />) },
          { path: '/resumes/upload', element: lazyPage(<UploadScreen />) },
          { path: '/resumes/:id/edit', element: lazyPage(<ResumeViewScreen />) },
          { path: '/resumes/:id/review', element: lazyPage(<ReviewScreen />) },
          { path: '/resumes/:id/analyze', element: lazyPage(<AnalyzeScreen />) },
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
