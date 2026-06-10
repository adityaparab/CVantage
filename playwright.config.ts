import { defineConfig } from '@playwright/test';

/**
 * Browser e2e (issue #89 / 10.6): real server + real mongo + fake LLM.
 * Locally: `yarn e2e:browser` (expects mongo on 27017, builds first).
 * CI: .github/workflows/ci.yml job `browser-e2e` wires services + env.
 */
export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1, // one shared backend - keep journeys deterministic
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  globalSetup: './e2e/global-setup.ts',
  webServer: {
    command: 'node server/dist/main.js',
    url: 'http://localhost:3000/api/v1/health/live',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      NODE_ENV: 'development',
      PORT: '3000',
      MONGODB_URI: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/cvantage-e2e',
      LLM_PROVIDER: 'fake',
      LOG_LEVEL: 'warn',
    },
  },
});
