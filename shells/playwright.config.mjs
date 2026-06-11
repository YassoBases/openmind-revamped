import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 240_000,
  fullyParallel: true,
  workers: 3,
  retries: 1,
  reporter: [['list']],
  use: {
    ...devices['Pixel 5'], // mobile emulation: touch, mobile UA, 393x851
    headless: true,
  },
});
