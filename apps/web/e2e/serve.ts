import process from 'node:process'
import { spawn } from 'node:child_process'
import { cp, mkdir, open } from 'node:fs/promises'
import path from 'node:path'
import { preview, type PreviewServer } from 'vite'

export const webRoot = path.resolve(import.meta.dirname, '..')

export async function command(
  argv: string[],
  output: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const log = await open(output, 'w')
  try {
    return await new Promise<number>((resolve, reject) => {
      const child = spawn(argv[0]!, argv.slice(1), {
        cwd: webRoot,
        env,
        stdio: ['ignore', log.fd, log.fd],
        detached: true,
      })
      const stop = () => {
        if (child.pid) {
          try {
            process.kill(-child.pid, 'SIGTERM')
          } catch (error) {
            if (!(error instanceof Error && 'code' in error && error.code === 'ESRCH'))
              reject(error)
          }
        }
      }
      const timer = setTimeout(stop, 300_000)
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
      const cleanup = () => {
        clearTimeout(timer)
        process.off('SIGINT', stop)
        process.off('SIGTERM', stop)
      }
      child.once('error', (error) => {
        cleanup()
        reject(error)
      })
      child.once('exit', (code) => {
        cleanup()
        resolve(code ?? 1)
      })
    })
  } finally {
    await log.close()
  }
}

export async function withServers<T>(
  output: string,
  run: (origins: { normal: string; fixture: string }) => Promise<T>,
): Promise<T> {
  const servers: PreviewServer[] = []
  const publicDir = path.join(output, 'public')
  await mkdir(output, { recursive: true })
  await cp(path.join(webRoot, 'public'), publicDir, { recursive: true })
  try {
    const origins: string[] = []
    for (const mode of ['normal', 'fixture']) {
      const outDir = path.join(output, mode)
      const code = await command(['vp', 'run', 'build'], path.join(output, `${mode}-build.log`), {
        ...process.env,
        WEB_BUILD_DIR: outDir,
        WEB_RUN_DIR: output,
        WEB_PUBLIC_DIR: publicDir,
        WEB_FIXTURES: mode === 'fixture' ? '1' : '0',
      })
      if (code !== 0) throw new Error(`Setup: ${mode} build failed; see ${mode}-build.log`)
      const server = await preview({
        root: webRoot,
        configFile: false,
        build: { outDir },
        preview: { host: '127.0.0.1', port: 0 },
      })
      servers.push(server)
      const address = server.httpServer.address()
      if (!address || typeof address === 'string')
        throw new Error('Setup: HTTP server has no TCP address')
      origins.push(`http://127.0.0.1:${address.port}`)
    }
    return await run({ normal: origins[0]!, fixture: origins[1]! })
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.httpServer.close((error) => (error ? reject(error) : resolve()))
            if ('closeAllConnections' in server.httpServer) server.httpServer.closeAllConnections()
          }),
      ),
    )
  }
}
