import process from 'node:process'
import { fileURLToPath } from 'node:url'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, lazyPlugins, loadEnv, type Plugin } from 'vite-plus'

const source = (path: string) => new URL(path, import.meta.url).pathname
const envDir = fileURLToPath(new URL('../../', import.meta.url))
const fixtureModules = new Map([
  [source('./src/components/shell/data.ts'), source('./e2e/fixture-modules/shell-data.ts')],
  [
    source('./src/features/navigation/pages.ts'),
    source('./e2e/fixture-modules/navigation-pages.ts'),
  ],
])
const fixtureData: Plugin = {
  name: 'fixture-data',
  enforce: 'pre',
  async resolveId(specifier, importer, options) {
    const resolved = await this.resolve(specifier, importer, { ...options, skipSelf: true })
    const fixture = resolved && fixtureModules.get(resolved.id)
    return fixture && importer !== fixture ? fixture : resolved
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '')
  return {
    envDir,
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
      },
      setupFiles: ['./src/test-setup.ts'],
    },
    resolve: { alias: [{ find: '@', replacement: source('./src') }] },
    server: {
      port: 43121,
      strictPort: true,
      proxy: {
        '^/api(?:/|$)': { target: `http://127.0.0.1:${env.AIRCASTLE_PORT ?? 43122}` },
      },
    },
    preview: { port: 43121, strictPort: true },
    plugins:
      lazyPlugins(() => [
        ...(process.env.WEB_FIXTURES === '1' ? [fixtureData] : []),
        tailwindcss(),
        react(),
        babel({ presets: [reactCompilerPreset()] }),
      ]) ?? [],
  }
})
