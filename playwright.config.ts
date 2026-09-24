import { defineConfig, devices } from '@playwright/test';
const launchOptions = { args: ['--ignore-gpu-blocklist', '--use-angle=metal', '--enable-gpu'] };
export default defineConfig({
  testDir: 'e2e',
  timeout: 420_000,
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: true },
  use: { actionTimeout: 15_000, baseURL: 'http://localhost:4173', channel: 'chromium', launchOptions },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'chromium', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
