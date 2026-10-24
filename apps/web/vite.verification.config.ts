import { defineConfig } from 'vite-plus'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/*.test.ts'],
    allowOnly: false,
    passWithNoTests: false,
    testTimeout: 180_000,
  },
})
