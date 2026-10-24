import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vite-plus/test'
import { browserOutcome, requirementResults } from '../scripts/evidence'

describe('[R1 R9 R10] verification evidence', () => {
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
  it('does not report unexercised requirements as passed', () => {
    expect(
      requirementResults(
        [
          { title: '[R2] entry', status: 'passed' },
          { title: '[R3] toggle', status: 'failed' },
        ],
        ['R2', 'R3', 'R5'],
      ),
    ).toEqual({ R2: 'passed', R3: 'failed', R5: 'not exercised' })
    expect(
      requirementResults(
        [
          { title: '[R2] first', status: 'passed' },
          { title: '[R2] second', status: 'failed' },
        ],
        ['R2'],
      ),
    ).toEqual({ R2: 'failed' })
  })
})

it('[R9] coverage inventories unimported source and excludes tests in a disposable app copy', () => {
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
    const result = spawnSync(
      'vp',
      [
        'test',
        'run',
        '--coverage',
        '--reporter=junit',
        '--outputFile.junit=' + path.join(copy, 'results.xml'),
      ],
      {
        cwd: copy,
        env: {
          ...process.env,
          WEB_COVERAGE_DIR: path.join(copy, 'coverage'),
          WEB_FIXTURES: '0',
          WEB_RUN_DIR: copy,
        },
        encoding: 'utf8',
        timeout: 90_000,
      },
    )
    expect(result.status, result.stdout + result.stderr).toBe(0)
    const summary = JSON.parse(
      readFileSync(path.join(copy, 'coverage/coverage-summary.json'), 'utf8'),
    )
    const keys = Object.keys(summary)
    expect(keys.some((key) => key.endsWith('/src/unimported-proof.ts'))).toBe(true)
    expect(
      summary[keys.find((key) => key.endsWith('/src/unimported-proof.ts'))!].lines.covered,
    ).toBe(0)
    expect(keys.some((key) => /\.test\.|test-utils|test-setup|e2e/.test(key))).toBe(false)
  } finally {
    rmSync(copy, { recursive: true, force: true })
  }
}, 90_000)
