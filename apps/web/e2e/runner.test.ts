import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vite-plus/test'
import { assertArtifacts, liveRun } from './command-copy'
import { copyWeb, originalWeb, readJson, runWeb } from '../scripts/verification-sandbox'

const temporary = () => mkdtempSync(path.join(tmpdir(), 'aircastle-run-'))

describe('real command contract', () => {
  it('rejects empty test discovery with a recorded setup failure', () => {
    const output = temporary()
    try {
      const result = runWeb(originalWeb, output, ['e2e', '--grep', 'NO_SUCH_TEST_734021'])
      expect(result.status, result.stdout + result.stderr).not.toBe(0)
      const receipt = readJson(output, 'receipt.json')
      expect(receipt.status).toBe('setup failure')
      expect(receipt.diagnostic).toMatch(/No tests found|No tests executed/)
      expect(receipt.cleanedUp).toBe(true)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 180_000)

  it('concurrent invocations serve real builds, execute the selected assertion and clean up', async () => {
    const outputs = [temporary(), temporary()]
    try {
      const results = await Promise.allSettled(outputs.map(liveRun))
      const receipts = results.map((result) => {
        if (result.status === 'rejected') throw result.reason
        return result.value
      })
      expect(receipts[0].origin).not.toBe(receipts[1].origin)
      expect(receipts[0].sourceFingerprint).toBe(receipts[1].sourceFingerprint)
    } finally {
      for (const output of outputs) rmSync(output, { recursive: true, force: true })
    }
  }, 180_000)

  it('a changed entry invalidates the previous build and propagates a real assertion failure', () => {
    const copy = copyWeb()
    try {
      const first = path.join(copy.directory, 'reports/first')
      const good = runWeb(copy.directory, first, ['e2e', 'startup.spec.ts'])
      expect(good.status, good.stdout + good.stderr).toBe(0)
      const before = assertArtifacts(first, 'normal built entry')
      const html = path.join(copy.directory, 'index.html')
      writeFileSync(
        html,
        readFileSync(html, 'utf8').replace(
          '<title>Aircastle: The Headless CMS with Next-Generation Agentic Capabilities</title>',
          '<title>Aircastle fresh-build proof</title>',
        ),
      )
      const second = path.join(copy.directory, 'reports/second')
      const bad = runWeb(copy.directory, second, ['e2e', 'startup.spec.ts'])
      expect(bad.status, bad.stdout + bad.stderr).not.toBe(0)
      const after = readJson(second, 'receipt.json')
      expect(after.status).toBe('behavior failure')
      expect(after.counts.failed).toBeGreaterThan(0)
      expect(after.sourceFingerprint).not.toBe(before.sourceFingerprint)
      expect(readFileSync(path.join(second, 'browser.xml'), 'utf8')).toContain(
        'Aircastle fresh-build proof',
      )
    } finally {
      copy.remove()
    }
  }, 180_000)

  for (const mode of ['focused', 'skipped', 'timeout'] as const) {
    it(`rejects actual ${mode} browser selection and preserves case results`, () => {
      const copy = copyWeb()
      try {
        const prefix = mode === 'focused' ? 'test.only' : mode === 'skipped' ? 'test.skip' : 'test'
        writeFileSync(
          path.join(copy.directory, 'e2e/conformance.spec.ts'),
          `import { test, visit } from './support'\ntest('positive control', async ({page}) => { await visit(page) })\n${prefix}('conformance fixture', async () => { ${mode === 'timeout' ? 'await new Promise(() => {})' : ''} })\n`,
        )
        if (mode === 'timeout') {
          const config = path.join(copy.directory, 'playwright.config.ts')
          writeFileSync(
            config,
            readFileSync(config, 'utf8').replace('timeout: 30_000', 'timeout: 500'),
          )
        }
        const output = path.join(copy.directory, 'reports/invalid')
        const result = runWeb(copy.directory, output, ['e2e', 'conformance.spec.ts'])
        expect(result.status, result.stdout + result.stderr).not.toBe(0)
        const receipt = readJson(output, 'receipt.json')
        expect(receipt.status).not.toBe('passed')
        expect(receipt.diagnostic).toMatch(
          mode === 'focused'
            ? /only|focused/i
            : mode === 'skipped'
              ? /skip/i
              : /timeout|timed out/i,
        )
        if (mode === 'skipped') {
          expect(
            readJson(output, 'receipt.json')
              .cases.map((item: { status: string }) => item.status)
              .sort(),
          ).toEqual(['passed', 'skipped'])
          expect(readJson(output, 'browser.json').stats.skipped).toBe(1)
        }
      } finally {
        copy.remove()
      }
    }, 180_000)
  }

  it('classifies an unavailable browser as setup failure', () => {
    const output = temporary()
    try {
      const result = runWeb(originalWeb, output, ['e2e', 'startup.spec.ts'], {
        PLAYWRIGHT_BROWSERS_PATH: path.join(output, 'missing-browser'),
      })
      expect(result.status, result.stdout + result.stderr).not.toBe(0)
      expect(readJson(output, 'receipt.json').status).toBe('setup failure')
      expect(readJson(output, 'receipt.json').diagnostic).toMatch(/executable|browser|install/i)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 180_000)

  it('aggregate verification propagates empty browser discovery after its prerequisite checks', () => {
    const output = temporary()
    try {
      const result = runWeb(originalWeb, output, ['verify', '--grep', 'NO_SUCH_TEST_734021'])
      expect(result.status, result.stdout + result.stderr).not.toBe(0)
      const receipt = readJson(output, 'receipt.json')
      expect(
        receipt.phases.find((phase: { name: string }) => phase.name === 'typecheck').exitCode,
      ).toBe(0)
      expect(
        receipt.phases.find((phase: { name: string }) => phase.name === 'components').executed,
      ).toBeGreaterThan(0)
      expect(receipt.diagnostic).toMatch(/No tests found|No tests executed/)
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 180_000)
})
