// Playwright config for the funnel-contract and content-integrity suite.
// The suite runs against the static build: `npm run build` first, then
// `npm test` (the webServer below serves dist/ via `astro preview`).
import { defineConfig, devices } from '@playwright/test';

// Port 4173, NOT 4321: the dev server owns 4321, and reusing it would silently
// run the suite against unbuilt dev output instead of dist/.
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
