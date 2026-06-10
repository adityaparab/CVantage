import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { renderWith } from './render';

import AdminDashboardScreen from '@/features/admin/AdminDashboardScreen';
import { AnalysisResults } from '@/features/analyses/AnalysisResults';
import LoginScreen from '@/features/auth/screens/LoginScreen';
import DashboardScreen from '@/features/dashboard/DashboardScreen';
import LandingPage from '@/features/marketing/LandingPage';
import UploadScreen from '@/features/upload/UploadScreen';
import { sampleAnalysis } from '@/test/msw/fixtures';


/**
 * Automated a11y gate (issue #85 / 10.2): axe over the key screens in BOTH
 * themes - zero serious/critical violations allowed. The manual keyboard /
 * screen-reader / responsive matrix lives in docs/a11y-checklist.md.
 */
const seriousOrCritical = (results: Awaited<ReturnType<typeof axe>>) =>
  results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');

const PAGES: Array<{
  name: string;
  ui: () => React.ReactElement;
  auth: 'anonymous' | 'candidate' | 'admin';
  ready: () => Promise<unknown>;
}> = [
  {
    name: 'landing',
    ui: () => <LandingPage />,
    auth: 'anonymous',
    ready: () => screen.findByText(/hiring side/),
  },
  {
    name: 'login',
    ui: () => <LoginScreen />,
    auth: 'anonymous',
    ready: () => screen.findByRole('button', { name: 'Sign in' }),
  },
  {
    name: 'dashboard',
    ui: () => <DashboardScreen />,
    auth: 'candidate',
    ready: () => screen.findByText('Backend Resume'),
  },
  {
    name: 'upload',
    ui: () => <UploadScreen />,
    auth: 'candidate',
    ready: () => screen.findByText(/Drag & drop/),
  },
  {
    name: 'analysis-results',
    ui: () => <AnalysisResults analysis={sampleAnalysis} />,
    auth: 'candidate',
    ready: () => screen.findByText(/Improvement suggestions/i),
  },
  {
    name: 'admin-dashboard',
    ui: () => <AdminDashboardScreen />,
    auth: 'admin',
    ready: () => screen.findByText('Platform overview'),
  },
];

afterEach(() => {
  delete document.documentElement.dataset.theme;
});

describe.each(['light', 'dark'] as const)('axe (%s theme)', (theme) => {
  it.each(PAGES)('$name has zero serious/critical violations', { timeout: 30_000 }, async (page) => {
    document.documentElement.dataset.theme = theme;
    const { container, unmount } = renderWith(page.ui(), { auth: page.auth });
    await page.ready();
    await waitFor(() => undefined);
    const results = await axe(container);
    const bad = seriousOrCritical(results);
    expect(
      bad.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
    ).toEqual([]);
    unmount();
  });
});
