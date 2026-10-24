import { spawn, spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { tmpdir } from 'node:os'
import { expect } from 'vite-plus/test'

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

export function assertArtifacts(output: string, expectedTitle: string) {
  const report = readJson(output, 'browser.json')
  expect(report.stats.expected).toBeGreaterThan(0)
  expect(report.stats.unexpected).toBe(0)
  expect(report.stats.skipped).toBe(0)
  expect(JSON.stringify(report.suites)).toContain(expectedTitle)
  expect(readFileSync(path.join(output, 'browser.xml'), 'utf8')).toContain('<testcase')
  const html = readFileSync(path.join(output, 'normal/index.html'), 'utf8')
  const script = html.match(/src="(\/assets\/[^"]+\.js)"/)
  expect(script).not.toBeNull()
  expect(readFileSync(path.join(output, 'normal', script![1]!)).length).toBeGreaterThan(100)
  const receipt = readJson(output, 'receipt.json')
  expect(receipt.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(receipt.runtime.node).toBeTruthy()
  expect(receipt.runtime.playwright).toBeTruthy()
  expect(receipt.browserVersion).toBeTruthy()
  expect(receipt.servingMode).toBe('built preview')
  expect(receipt.counts.executed).toBe(report.stats.expected)
  expect(receipt.counts.retries).toBe(0)
  expect(receipt.cleanedUp).toBe(true)
  return receipt
}

export async function liveRun(output: string) {
  const child = spawn(
    'bun',
    ['scripts/verify-web.ts', 'e2e', '--grep', 'normal production build exposes'],
    {
      cwd: originalWeb,
      env: { ...process.env, WEB_RUN_DIR: output },
      stdio: 'ignore',
      timeout: 180_000,
    },
  )
  const exited = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', resolve)
  })
  try {
    await Promise.race([
      expect
        .poll(
          () => {
            try {
              return readJson(output, 'running.json').origin as string
            } catch {
              return null
            }
          },
          { timeout: 60_000, interval: 100 },
        )
        .not.toBeNull(),
      exited.then(() => {
        throw new Error('Command exited without independently observed live server evidence')
      }),
    ])
    const running = readJson(output, 'running.json')
    const response = await fetch(running.origin)
    expect(response.status).toBe(200)
    const html = await response.text()
    expect(html).toContain('<title>Aircastle</title>')
    const script = html.match(/src="(\/assets\/[^"]+\.js)"/)
    expect(script).not.toBeNull()
    expect((await fetch(new URL(script![1]!, running.origin))).status).toBe(200)
    expect(await exited).toBe(0)
    const receipt = assertArtifacts(output, 'normal production build exposes')
    expect(receipt.origin).toBe(running.origin)
    await expect(fetch(running.origin)).rejects.toThrow()
    return receipt
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exited
  }
}
