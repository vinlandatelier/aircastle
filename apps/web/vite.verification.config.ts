import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    include: ['e2e/*.test.ts'],
    allowOnly: false,
    passWithNoTests: false,
    testTimeout: 210_000,
  },
})
