import { defineConfig, devices } from '@playwright/test';

const mode = process.env.E2E_MODE ?? 'dev';
const liveUrl = process.env.E2E_LIVE_URL;
if (mode === 'live' && !liveUrl) {
  throw new Error('E2E_LIVE_URL is required when E2E_MODE=live');
}

const origin = 'http://127.0.0.1:4173';
const requestedBasePath = process.env.E2E_BASE_PATH ?? (mode === 'prod' ? '/moyeoplay/' : '/');
const basePath = `/${requestedBasePath.replace(/^\/+|\/+$/g, '')}${requestedBasePath === '/' ? '' : '/'}`;

function normalizeLiveUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}

const baseURL = liveUrl ? normalizeLiveUrl(liveUrl) : new URL(basePath, origin).href;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects:
    mode === 'live'
      ? [{ name: 'chromium-mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' } }]
      : [
          { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
          { name: 'webkit-mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
        ],
  ...(mode === 'live'
    ? {}
    : {
        webServer: {
          command:
            mode === 'prod'
              ? 'npm run preview:pages -- --host 127.0.0.1 --port 4173'
              : 'npm run dev -- --host 127.0.0.1 --port 4173',
          url: baseURL,
          reuseExistingServer: mode === 'dev' && !process.env.CI,
          timeout: 120_000,
        },
      }),
});
