import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { tmpdir } from 'node:os'

export const originalWeb = path.resolve(import.meta.dirname, '..')

export function copyWeb() {
  const directory = mkdtempSync(path.join(tmpdir(), 'aircastle-command-'))
  cpSync(originalWeb, directory, {
    recursive: true,
    filter: (source) =>
      !['node_modules', 'dist', 'reports', 'coverage'].includes(
        path.relative(originalWeb, source).split(path.sep)[0]!,
      ),
  })
  symlinkSync(path.join(originalWeb, 'node_modules'), path.join(directory, 'node_modules'), 'dir')
  return { directory, remove: () => rmSync(directory, { recursive: true, force: true }) }
}

export function runWeb(
  directory: string,
  output: string,
  args: string[],
  env: NodeJS.ProcessEnv = {},
) {
  return spawnSync('bun', ['scripts/verify-web.ts', ...args], {
    cwd: directory,
    env: { ...process.env, ...env, WEB_RUN_DIR: output },
    encoding: 'utf8',
    timeout: 180_000,
  })
}

export function readJson(output: string, name: string) {
  return JSON.parse(readFileSync(path.join(output, name), 'utf8'))
}
