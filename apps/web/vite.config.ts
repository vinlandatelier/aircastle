import process from 'node:process'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, lazyPlugins } from 'vite-plus'
const source = (path: string) => new URL(path, import.meta.url).pathname
const fixtureModules =
  process.env.WEB_FIXTURES === '1'
    ? [
        {
          find: /^@\/components\/shell\/data$/,
          replacement: source('./e2e/fixture-modules/shell-data.ts'),
        },
        {
          find: /^@\/features\/navigation\/pages$/,
          replacement: source('./e2e/fixture-modules/navigation-pages.ts'),
        },
      ]
    : []

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.{ts,tsx}'],
    allowOnly: false,
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test-setup.ts', 'src/test-utils.tsx'],
      reporter: ['text', 'html', 'json', 'json-summary'],
      reportsDirectory: process.env.WEB_COVERAGE_DIR ?? './coverage',
    },
    setupFiles: ['./src/test-setup.ts'],
  },
  cacheDir: process.env.WEB_RUN_DIR ? `${process.env.WEB_RUN_DIR}/cache` : 'node_modules/.vite',
  publicDir: process.env.WEB_PUBLIC_DIR ?? 'public',
  build: { outDir: process.env.WEB_BUILD_DIR ?? 'dist' },
  resolve: { alias: [...fixtureModules, { find: '@', replacement: source('./src') }] },
  server: {
    port: 43121,
    strictPort: true,
    proxy: {
      '^/api(?:/|$)': { target: `http://127.0.0.1:${process.env.PORT ?? 43122}` },
    },
  },
  preview: { port: 43121, strictPort: true },
  plugins: lazyPlugins(() => [tailwindcss(), react(), babel({ presets: [reactCompilerPreset()] })]),
})
