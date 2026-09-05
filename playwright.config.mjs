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
    baseURL: 'http://127.0.0.1:4173',
    trace: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // Astro 7 backgrounds preview automatically when it detects an agent.
    // Playwright must own a foreground process so teardown and failures are
    // deterministic; a defined ASTRO_PREVIEW_BACKGROUND disables that
    // auto-detection, while --ignore-lock avoids stale preview lockfiles.
    command: 'ASTRO_PREVIEW_BACKGROUND=0 npm run preview -- --host 127.0.0.1 --port 4173 --ignore-lock',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
