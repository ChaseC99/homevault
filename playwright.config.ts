import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const webkit = process.env.PLAYWRIGHT_BROWSER === 'webkit';
const port = process.env.PLAYWRIGHT_PORT || '4173';
const baseURL = new URL(process.env.BASE_PATH || '/', `http://127.0.0.1:${port}`).href.replace(
  /\/?$/,
  '/',
);
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL,
    browserName: webkit ? 'webkit' : 'chromium',
    isMobile: webkit,
    hasTouch: webkit,
    viewport: { width: 390, height: 844 },
    headless: true,
    actionTimeout: 15000,
    launchOptions: {
      executablePath: webkit
        ? undefined
        : process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
          (existsSync(systemChrome) ? systemChrome : undefined),
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run preview -- --strictPort --host 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  reporter: [['list'], ['html', { open: 'never' }]],
});
