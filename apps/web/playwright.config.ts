import process from 'node:process'
import { defineConfig } from '@playwright/test'
import path from 'node:path'

const output = process.env.WEB_RUN_DIR
if (!output || !process.env.WEB_ORIGIN || !process.env.WEB_FIXTURE_ORIGIN) {
  throw new Error('Use vp run test-web:e2e to build and own the browser servers')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  forbidOnly: true,
  retries: 0,
  workers: 2,
  timeout: 30_000,
  globalTimeout: 300_000,
  expect: { timeout: 5_000 },
  outputDir: path.join(output, 'browser'),
  reporter: [
    ['list'],
    ['junit', { outputFile: path.join(output, 'browser.xml') }],
    ['json', { outputFile: path.join(output, 'browser.json') }],
  ],
  use: {
    browserName: 'chromium',
    baseURL: process.env.WEB_ORIGIN,
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
})
