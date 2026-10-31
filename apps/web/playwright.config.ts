import process from 'node:process'
import { defineConfig } from '@playwright/test'
import { authInstances, origins } from './e2e/origins'

const recording = process.env.WEB_E2E_VIDEO === '1'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  retries: 0,
  failOnFlakyTests: true,
  workers: 2,
  timeout: recording ? 120_000 : 30_000,
  globalTimeout: recording ? 1_800_000 : 600_000,
  expect: { timeout: 5_000 },
  outputDir: 'reports/test-results',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['json', { outputFile: 'reports/results.json' }],
  ],
  webServer: [
    ...Object.entries(origins).map(([name, { port, url }]) => ({
      command: `vp build --outDir reports/build/${name} && vp preview --outDir reports/build/${name} --host 127.0.0.1 --port ${port} --strictPort`,
      url,
      env: { WEB_FIXTURES: name === 'fixture' ? '1' : '0' },
      reuseExistingServer: false,
      timeout: 300_000,
    })),
    {
      command: 'node ../../tests/web/auth-instances.ts',
      url: `${authInstances.url}/health`,
      env: { AUTH_INSTANCES_PORT: String(authInstances.port) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
  use: {
    browserName: 'chromium',
    baseURL: origins.normal.url,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    launchOptions: recording ? { slowMo: 500 } : {},
    screenshot: recording ? 'on' : 'only-on-failure',
    video: recording
      ? {
          mode: 'on',
          size: { width: 1440, height: 900 },
          show: {
            actions: { duration: 1_000, position: 'top', cursor: 'pointer' },
            test: { level: 'step', position: 'bottom' },
          },
        }
      : 'off',
  },
})
