import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import process from 'node:process'
import { expect, it } from 'vite-plus/test'
import {
  copyWeb,
  originalWeb,
  readJson,
  verificationTimeouts,
} from '../scripts/verification-sandbox'
import { strengthCases } from './strength-cases'

const expectedBrowserCases: Record<string, { file: string; titles: string[] }> = {
  entry: {
    file: 'startup.spec.ts',
    titles: [
      'normal built entry loads assets and redirects to Collections',
      'direct Settings entry survives reload in the same context',
    ],
  },
  sidebar: {
    file: 'navigation.spec.ts',
    titles: [
      'desktop collapse changes rendered width and survives client navigation',
      'desktop collapse and mobile drawer state remain independent across resizing',
    ],
  },
  containment: {
    file: 'stress.spec.ts',
    titles: ['long-text popup: viewport containment keeps extreme candidates within reach'],
  },
}

type BrowserSuite = {
  suites?: BrowserSuite[]
  specs: {
    file: string
    title: string
    tests: { results: { status: string; errors: { message?: string }[] }[] }[]
  }[]
}

function selectedBrowserCases(suites: BrowserSuite[]): BrowserSuite['specs'] {
  return suites.flatMap((suite) => [...suite.specs, ...selectedBrowserCases(suite.suites ?? [])])
}

function campaignBudget(caseId?: string) {
  const selected = strengthCases.filter((item) => caseId === undefined || item.id === caseId)
  return 30_000 + 3 * selected.reduce((total, item) => total + verificationTimeouts[item.kind], 0)
}

function campaign(directory: string, caseId?: string) {
  const args = caseId ? ['--case', caseId] : []
  const output = mkdtempSync(path.join(tmpdir(), 'aircastle-strength-proof-'))
  const command = spawnSync('bun', ['scripts/test-strength.ts', ...args], {
    cwd: directory,
    env: { ...process.env, WEB_STRENGTH_DIR: output },
    encoding: 'utf8',
    timeout: campaignBudget(caseId),
  })
  return { command, output, remove: () => rmSync(output, { recursive: true, force: true }) }
}

it(
  'proves the four committed faults with passing controls and restored behavior',
  () => {
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
        expect(item.restored.executed).toBe(item.baseline.executed)
        expect(item.restored.failed).toBe(0)
        expect(readFileSync(path.join(item.output, 'fault.log'), 'utf8').length).toBeGreaterThan(0)
        for (const phase of ['baseline', 'fault', 'restored']) {
          const directory = path.join(item.output, phase)
          if (item.id === 'theme') {
            const raw = readJson(directory, 'components.json')
            expect(raw.numTotalTests).toBeGreaterThan(0)
            expect(raw.numPendingTests).toBe(0)
            expect(raw.numFailedTests).toBe(phase === 'fault' ? 1 : 0)
            expect(item[phase].executed).toBe(raw.numTotalTests)
            expect(item[phase].failed).toBe(raw.numFailedTests)
            expect(raw.testResults).toHaveLength(1)
            expect(raw.testResults[0].name).toMatch(/\/src\/components\/shell\/index\.test\.tsx$/)
            expect(
              raw.testResults[0].assertionResults
                .map((test: { title: string }) => test.title)
                .sort(),
            ).toEqual([
              'applies and stores explicit theme choices through the public app',
              'keeps the agreed header action order',
              'renders the brand, project switcher, and CMS navigation',
            ])
            if (phase === 'fault') {
              const failures = raw.testResults.flatMap(
                (suite: {
                  assertionResults: {
                    fullName: string
                    status: string
                    failureMessages: string[]
                  }[]
                }) => suite.assertionResults.filter((test) => test.status === 'failed'),
              )
              expect(failures[0].fullName).toBe(
                'Aircastle app shell applies and stores explicit theme choices through the public app',
              )
              expect(failures[0].failureMessages.join('\n')).toMatch(/expect|AssertionError/)
            }
          } else {
            const receipt = readJson(directory, 'receipt.json')
            expect(receipt.status).toBe(phase === 'fault' ? 'behavior failure' : 'passed')
            expect(receipt.cleanedUp).toBe(true)
            const raw = readJson(directory, 'browser.json')
            const selected = selectedBrowserCases(raw.suites)
            const expected = expectedBrowserCases[item.id]!
            expect(selected.map((test) => test.file)).toEqual(
              expected.titles.map(() => expected.file),
            )
            expect(selected.map((test) => test.title).sort()).toEqual([...expected.titles].sort())
            const results = selected.flatMap((test) => test.tests.flatMap((run) => run.results))
            expect(results).toHaveLength(expected.titles.length)
            if (phase === 'fault') {
              expect(
                results.some(
                  (result) =>
                    result.status === 'failed' &&
                    result.errors.some((error) =>
                      /expect|AssertionError/.test(error.message ?? ''),
                    ),
                ),
              ).toBe(true)
            } else expect(results.every((result) => result.status === 'passed')).toBe(true)
            expect(raw.stats.skipped).toBe(0)
            expect(raw.stats.flaky).toBe(0)
            expect(raw.errors).toEqual([])
            expect(item[phase].executed).toBe(raw.stats.expected + raw.stats.unexpected)
            expect(item[phase].failed).toBe(raw.stats.unexpected)
            expect(readFileSync(path.join(directory, 'browser.xml'), 'utf8')).toContain('<testcase')
            const html = readFileSync(path.join(directory, 'normal/index.html'), 'utf8')
            const asset = html.match(/src="(\/assets\/[^"]+\.js)"/)
            expect(asset).not.toBeNull()
            expect(readFileSync(path.join(directory, 'normal', asset![1]!)).length).toBeGreaterThan(
              100,
            )
            if (phase === 'fault')
              expect(
                receipt.cases.some(
                  (test: { status: string; title: string; errors: string[] }) =>
                    test.status === 'failed' &&
                    expected.titles.some((title) => test.title.endsWith(title)) &&
                    test.errors.length > 0,
                ),
              ).toBe(true)
          }
        }
        if (item.id !== 'theme') {
          const baseline = readJson(path.join(item.output, 'baseline'), 'receipt.json')
          const fault = readJson(path.join(item.output, 'fault'), 'receipt.json')
          const restored = readJson(path.join(item.output, 'restored'), 'receipt.json')
          expect(fault.sourceFingerprint).not.toBe(baseline.sourceFingerprint)
          expect(restored.sourceFingerprint).toBe(baseline.sourceFingerprint)
        }
      }
    } finally {
      result.remove()
    }
  },
  campaignBudget() + 30_000,
)

for (const mode of ['survived', 'invalid', 'setup failure'] as const) {
  it(
    `fails rather than counting a ${mode} fault as a kill`,
    () => {
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
            : mode === 'invalid'
              ? source.replace("from: 'onValueChange={setTheme}'", `from: '${replacement}'`)
              : source.replace(
                  "'src/components/shell/index.test.tsx'",
                  "'src/no-such-strength-suite.test.tsx'",
                ),
        )
        result = campaign(copy.directory, 'theme')
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
    },
    campaignBudget('theme') + 30_000,
  )
}

it('rejects an unknown case instead of reporting an empty passing campaign', () => {
  const result = campaign(originalWeb, 'missing-case')
  try {
    expect(result.command.status).not.toBe(0)
    expect(readJson(result.output, 'strength.json').status).toBe('failed')
  } finally {
    result.remove()
  }
})
