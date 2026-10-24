import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite-plus'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const web = fileURLToPath(new URL('../', import.meta.url))
let directory: string
let app: string

beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), 'aircastle-env-'))
  app = path.join(directory, 'apps/web')
  mkdirSync(path.join(app, 'e2e'), { recursive: true })
  copyFileSync(path.join(web, 'vite.config.ts'), path.join(app, 'vite.config.ts'))
  copyFileSync(path.join(web, 'e2e/fixture-build.ts'), path.join(app, 'e2e/fixture-build.ts'))
  symlinkSync(path.join(web, 'node_modules'), path.join(app, 'node_modules'), 'dir')
  writeFileSync(path.join(app, 'probe.ts'), 'export const environment = import.meta.env')
  vi.stubEnv('PORT', undefined)
  vi.stubEnv('VITE_ROOT_ENV_PROBE', undefined)
  vi.stubEnv('ROOT_ENV_PRIVATE_PROBE', undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(directory, { recursive: true, force: true })
})

async function inspectEnvironment() {
  const server = await createServer({
    configFile: path.join(app, 'vite.config.ts'),
    root: app,
    mode: 'development',
    server: { middlewareMode: true, watch: null },
  })
  try {
    return {
      target: server.config.server.proxy?.['^/api(?:/|$)'],
      environment: server.config.env,
      transformed: (await server.transformRequest('/probe.ts'))?.code,
    }
  } finally {
    await server.close()
  }
}

describe('root development environment', () => {
  it('loads root PORT and public values without exposing private values', async () => {
    writeFileSync(
      path.join(directory, '.env'),
      'PORT=45231\nVITE_ROOT_ENV_PROBE=root-public-sentinel\nROOT_ENV_PRIVATE_PROBE=root-private-sentinel\n',
    )
    const result = await inspectEnvironment()
    expect(result.target).toMatchObject({ target: 'http://127.0.0.1:45231' })
    expect(result.environment.VITE_ROOT_ENV_PROBE).toBe('root-public-sentinel')
    expect(result.environment).not.toHaveProperty('ROOT_ENV_PRIVATE_PROBE')
    expect(result.transformed).toContain('root-public-sentinel')
    expect(result.transformed).not.toContain('root-private-sentinel')
  })

  it('preserves exported shell PORT precedence', async () => {
    writeFileSync(path.join(directory, '.env'), 'PORT=45231\n')
    vi.stubEnv('PORT', '45232')
    expect((await inspectEnvironment()).target).toMatchObject({ target: 'http://127.0.0.1:45232' })
  })

  it('uses defaults without a root file and ignores app-local environment files', async () => {
    writeFileSync(path.join(app, '.env'), 'PORT=45233\nVITE_ROOT_ENV_PROBE=app-local-sentinel\n')
    const result = await inspectEnvironment()
    expect(result.target).toMatchObject({ target: 'http://127.0.0.1:43122' })
    expect(result.environment).not.toHaveProperty('VITE_ROOT_ENV_PROBE')
    expect(result.transformed).not.toContain('app-local-sentinel')
  })
})
