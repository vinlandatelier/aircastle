import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { expect, it } from 'vite-plus/test'
import { copyWeb, originalWeb, readJson } from '../scripts/verification-sandbox'

function campaign(directory: string, args: string[] = []) {
  const output = mkdtempSync(path.join(tmpdir(), 'aircastle-strength-proof-'))
  const command = spawnSync('bun', ['scripts/test-strength.ts', ...args], {
    cwd: directory,
    env: { ...process.env, WEB_STRENGTH_DIR: output },
    encoding: 'utf8',
    timeout: 240_000,
  })
  return { command, output, remove: () => rmSync(output, { recursive: true, force: true }) }
}

it('proves the four committed faults with passing controls and restored behavior', () => {
  const result = campaign(originalWeb)
  try {
    expect(result.command.status, result.command.stdout + result.command.stderr).toBe(0)
    const report = readJson(result.output, 'strength.json')
    expect(report.status).toBe('passed')
    expect(report.cases.map((item: { id: string }) => item.id)).toEqual([
      'theme',
      'entry',
      'sidebar',
      'containment',
    ])
    for (const item of report.cases) {
      expect(item.outcome).toBe('killed')
      expect(item.baseline.executed).toBeGreaterThan(0)
      expect(item.baseline.failed).toBe(0)
      expect(item.fault.failed).toBeGreaterThan(0)
      expect(item.fault.skipped).toBe(0)
      expect(item.fault.namedFailures.some((name: string) => name.includes(item.failure))).toBe(
        true,
      )
      expect(item.restored.executed).toBe(item.baseline.executed)
      expect(item.restored.failed).toBe(0)
      expect(readFileSync(path.join(item.output, 'fault.log'), 'utf8').length).toBeGreaterThan(0)
    }
  } finally {
    result.remove()
  }
}, 300_000)

for (const mode of ['survived', 'invalid'] as const) {
  it(`fails rather than counting a ${mode} fault as a kill`, () => {
    const copy = copyWeb()
    let result: ReturnType<typeof campaign> | undefined
    try {
      const config = path.join(copy.directory, 'e2e/strength-cases.ts')
      const replacement =
        mode === 'survived'
          ? 'onValueChange={(value) => setTheme(value)}'
          : 'onValueChange={missingStrengthAnchor}'
      const source = readFileSync(config, 'utf8')
      writeFileSync(
        config,
        mode === 'survived'
          ? source.replace("to: 'onValueChange={() => undefined}'", `to: '${replacement}'`)
          : source.replace("from: 'onValueChange={setTheme}'", `from: '${replacement}'`),
      )
      result = campaign(copy.directory, ['--case', 'theme'])
      expect(result.command.status).not.toBe(0)
      const report = readJson(result.output, 'strength.json')
      expect(report.status).toBe('failed')
      expect(report.cases[0].outcome).toBe(mode)
      expect(report.cases.some((item: { outcome: string }) => item.outcome === 'killed')).toBe(
        false,
      )
    } finally {
      result?.remove()
      copy.remove()
    }
  }, 90_000)
}
