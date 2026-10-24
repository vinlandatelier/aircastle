import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vite-plus/test'
import { browserOutcome } from '../scripts/evidence'
import { copyWeb, originalWeb, readJson, runWeb } from '../scripts/verification-sandbox'

describe('verification evidence', () => {
  it('accepts only executed passing tests', () => {
    expect(
      browserOutcome({ stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 }, errors: [] }),
    ).toEqual({ executed: 2, failed: 0, skipped: 0, retries: 0, status: 'passed' })
    expect(() =>
      browserOutcome({ stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 } }),
    ).toThrow('No tests executed')
    expect(() =>
      browserOutcome({ stats: { expected: 1, unexpected: 0, skipped: 1, flaky: 0 } }),
    ).toThrow('Skipped')
    expect(() =>
      browserOutcome({
        stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 },
        errors: [{ message: 'Browser missing' }],
      }),
    ).toThrow('Setup')
  })
  it('rejects malformed or impossible runner counts', () => {
    expect(() => browserOutcome({})).toThrow('Invalid')
    expect(() =>
      browserOutcome({ stats: { expected: -1, unexpected: 0, skipped: 0, flaky: 0 } }),
    ).toThrow('Invalid')
  })
  it('keeps assertion failures and retries visible', () => {
    expect(
      browserOutcome({ stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 }, errors: [] })
        .status,
    ).toBe('failed')
    expect(() =>
      browserOutcome({ stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 1 } }),
    ).toThrow('Retries')
  })
})

it('runs a new descriptive browser test without registration or runner changes', () => {
  const copy = copyWeb()
  try {
    writeFileSync(
      path.join(copy.directory, 'e2e/new-feature.spec.ts'),
      "import { test, visit } from './support'\ntest.describe('document navigation', () => { test('opens the workspace', async ({page}) => { await visit(page) }) })\n",
    )
    const output = path.join(copy.directory, 'reports/new-feature')
    const result = runWeb(copy.directory, output, ['e2e', 'new-feature.spec.ts'])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const receipt = readJson(output, 'receipt.json')
    expect(receipt.status).toBe('passed')
    expect(receipt.counts).toMatchObject({ executed: 1, failed: 0, skipped: 0, retries: 0 })
    expect(receipt.cases).toHaveLength(1)
    expect(receipt.cases[0]).toMatchObject({
      title: 'new-feature.spec.ts > document navigation > opens the workspace',
      status: 'passed',
      errors: [],
    })
    expect(receipt.cases[0].attempts).toHaveLength(1)
    expect(receipt.cases[0].attempts[0]).toMatchObject({ status: 'passed', retry: 0 })
  } finally {
    copy.remove()
  }
}, 180_000)

it('coverage inventories unimported source and excludes tests in a disposable app copy', () => {
  const original = path.resolve(import.meta.dirname, '..')
  const copy = mkdtempSync(path.join(tmpdir(), 'aircastle-coverage-'))
  try {
    cpSync(original, copy, {
      recursive: true,
      filter: (source) =>
        !['node_modules', 'dist', 'reports', 'coverage'].includes(
          path.relative(original, source).split(path.sep)[0]!,
        ),
    })
    symlinkSync(path.join(original, 'node_modules'), path.join(copy, 'node_modules'), 'dir')
    writeFileSync(
      path.join(copy, 'src/unimported-proof.ts'),
      'export function unimportedProof() { return 734021 }\n',
    )
    const output = path.join(copy, 'reports/coverage-proof')
    const result = runWeb(copy, output, ['coverage'])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const summary = JSON.parse(
      readFileSync(path.join(output, 'coverage/coverage-summary.json'), 'utf8'),
    )
    const keys = Object.keys(summary)
    expect(keys.some((key) => key.endsWith('/src/unimported-proof.ts'))).toBe(true)
    expect(
      summary[keys.find((key) => key.endsWith('/src/unimported-proof.ts'))!].lines.covered,
    ).toBe(0)
    expect(keys.some((key) => /\.test\.|test-utils|test-setup|e2e/.test(key))).toBe(false)
    expect(readFileSync(path.join(output, 'coverage/index.html'), 'utf8')).toContain('<html')
    const details = readJson(output, 'coverage-info.json')
    expect(details.provider).toBe('v8')
    expect(details.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(details.totals).toEqual(summary.total)
    expect(details.interpretation.css).toBe(false)
    expect(details.interpretation.compilerBranches).toMatch(/compiler/i)
    expect(details.interpretation.uiWrappers.length).toBeGreaterThan(0)
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
}, 90_000)

it('focused command reports only executed cases with their title hierarchy and attempts', () => {
  const output = mkdtempSync(path.join(tmpdir(), 'aircastle-emitted-report-'))
  try {
    const result = runWeb(originalWeb, output, ['e2e', '--grep', 'Back and Forward follow'])
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const receipt = readJson(output, 'receipt.json')
    expect(receipt.sourceFingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(receipt.runtime.node).toBeTruthy()
    expect(receipt.runtime.playwright).toBeTruthy()
    expect(receipt.browserVersion).toBeTruthy()
    expect(receipt.servingMode).toBe('built preview')
    expect(receipt.cases).toHaveLength(1)
    const actual = receipt.cases[0]
    expect(actual.title).toContain('routes and history')
    expect(actual.title).toContain('Back and Forward follow')
    expect(actual.scenario).toBe('normal')
    expect(actual.viewport).toEqual({ width: 1440, height: 900 })
    expect(actual.theme).toBe('light')
    expect(actual.attempts).toHaveLength(1)
    expect(actual.attempts[0].retry).toBe(0)
    expect(actual.attempts[0].status).toBe('passed')
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
}, 180_000)
