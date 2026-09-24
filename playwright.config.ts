import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  webServer: { command: 'npm run preview', port: 4173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } },
  ],
});
