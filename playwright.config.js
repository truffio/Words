import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  // The canvas is drawn in software on CI (no GPU), which makes every step slow there.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Serves the test build (production build plus the test bridge);
  // `npm run test:e2e` builds it first.
  webServer: {
    command: 'npx vite preview --outDir dist-test',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
