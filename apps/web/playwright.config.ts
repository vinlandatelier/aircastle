import { defineConfig } from '@playwright/test'
import { origins } from './e2e/origins'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  retries: 0,
  failOnFlakyTests: true,
  workers: 2,
  timeout: 30_000,
  globalTimeout: 600_000,
  expect: { timeout: 5_000 },
  outputDir: 'reports/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  webServer: Object.entries(origins).map(([name, { port, url }]) => ({
    command: `vp build --outDir reports/build/${name} && vp preview --outDir reports/build/${name} --host 127.0.0.1 --port ${port} --strictPort`,
    url,
    env: { WEB_FIXTURES: name === 'fixture' ? '1' : '0' },
    reuseExistingServer: false,
    timeout: 300_000,
  })),
  use: {
    browserName: 'chromium',
    baseURL: origins.normal.url,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
