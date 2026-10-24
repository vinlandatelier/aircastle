import { Buffer } from 'node:buffer'
import type { JSONReport, JSONReportSuite } from '@playwright/test/reporter'

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid runner report')
  return value as Record<string, unknown>
}

export function browserOutcome(value: unknown): {
  executed: number
  failed: number
  skipped: number
  retries: number
  status: 'passed' | 'failed'
} {
  const report = record(value)
  const stats = record(report.stats)
  const counts = ['expected', 'unexpected', 'skipped', 'flaky'].map((key) => stats[key])
  if (
    !counts.every((count) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0)
  )
    throw new Error('Invalid runner counts')
  if (report.errors !== undefined && !Array.isArray(report.errors))
    throw new Error('Invalid runner errors')
  if (Array.isArray(report.errors) && report.errors.length) {
    const error = record(report.errors[0])
    const message =
      typeof error.message === 'string'
        ? error.message
        : typeof error.stack === 'string'
          ? error.stack
          : 'Runner error'
    throw new Error(`Setup: ${message}`)
  }
  const [passed, failed, skipped, retries] = counts as number[]
  if (skipped! > 0) throw new Error('Skipped selected tests are not passing evidence')
  if (retries! > 0) throw new Error('Retries are not passing first-attempt evidence')
  const executed = passed! + failed!
  if (executed === 0) throw new Error('No tests executed')
  return {
    executed,
    failed: failed!,
    skipped: skipped!,
    retries: retries!,
    status: failed! > 0 ? 'failed' : 'passed',
  }
}

export function requirementResults(
  cases: { title: string; status: string }[],
  requirements: string[],
): Record<string, string> {
  const mapped = cases.map((item) => {
    const ids = [...new Set(item.title.match(/\b[a-z][a-z0-9-]*:R[1-9]\d*\b/g) ?? [])]
    if (!ids.length) throw new Error(`No requirement declared for browser case: ${item.title}`)
    for (const id of ids) {
      if (!requirements.includes(id)) throw new Error(`Undeclared requirement: ${id}`)
    }
    return { ...item, requirements: ids }
  })
  return Object.fromEntries(
    requirements.map((requirement) => {
      const selected = mapped.filter((item) => item.requirements.includes(requirement))
      const status = selected.some((item) => ['failed', 'timedOut'].includes(item.status))
        ? 'failed'
        : selected.length > 0 && selected.every((item) => item.status === 'passed')
          ? 'passed'
          : 'not exercised'
      return [requirement, status]
    }),
  )
}

export type BrowserCase = {
  title: string
  status: string
  attempts: { status: string | undefined; retry: number; duration: number }[]
  scenario: string
  viewport: { width: number; height: number } | null
  theme: string | null
  browser: string | null
  errors: string[]
}

export function browserCases(value: unknown): BrowserCase[] {
  const object = record(value)
  if (!Array.isArray(object.suites)) throw new Error('Invalid browser suites')
  const report = object as unknown as JSONReport
  const cases: BrowserCase[] = []
  function collect(suites: JSONReportSuite[], parents: string[]) {
    for (const suite of suites) {
      const hierarchy = [...parents, suite.title]
      for (const spec of suite.specs) {
        for (const test of spec.tests) {
          const last = test.results.at(-1)
          const attachment = last?.attachments.find((item) => item.name === 'browser-environment')
          const environment = attachment?.body
            ? record(JSON.parse(Buffer.from(attachment.body, 'base64').toString('utf8')))
            : {}
          const viewport = environment.viewport as BrowserCase['viewport'] | undefined
          cases.push({
            title: [...hierarchy, spec.title].join(' > '),
            status: last?.status ?? 'skipped',
            attempts: test.results.map((result) => ({
              status: result.status,
              retry: result.retry,
              duration: result.duration,
            })),
            scenario:
              test.annotations.find((item) => item.type === 'scenario')?.description ?? 'normal',
            viewport: viewport ?? null,
            theme: typeof environment.theme === 'string' ? environment.theme : null,
            browser: typeof environment.browser === 'string' ? environment.browser : null,
            errors: test.results.flatMap((result) => result.errors.map((error) => error.message)),
          })
        }
      }
      collect(suite.suites ?? [], hierarchy)
    }
  }
  collect(report.suites, [])
  return cases
}
