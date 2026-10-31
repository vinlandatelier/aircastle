import { Buffer } from 'node:buffer'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('Invalid runner report')
  return value
}

function requireList(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('Invalid runner report')
  return value
}

function requireString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid runner report')
  return value
}

function requireNumber(value: unknown): number {
  if (typeof value !== 'number') throw new Error('Invalid runner report')
  return value
}

function optionalString(value: unknown): string | undefined {
  return value === undefined ? undefined : requireString(value)
}

function count(stats: Record<string, unknown>, key: string): number {
  const value = stats[key]
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new Error('Invalid runner counts')
  return value
}

export function browserOutcome(value: unknown): {
  executed: number
  failed: number
  skipped: number
  retries: number
  status: 'passed' | 'failed'
} {
  const report = requireObject(value)
  const stats = requireObject(report.stats)
  const passed = count(stats, 'expected')
  const failed = count(stats, 'unexpected')
  const skipped = count(stats, 'skipped')
  const retries = count(stats, 'flaky')
  if (report.errors !== undefined && !Array.isArray(report.errors))
    throw new Error('Invalid runner errors')
  if (Array.isArray(report.errors) && report.errors.length) {
    const error = requireObject(report.errors[0])
    const message =
      typeof error.message === 'string'
        ? error.message
        : typeof error.stack === 'string'
          ? error.stack
          : 'Runner error'
    throw new Error(`Setup: ${message}`)
  }
  if (skipped > 0) throw new Error('Skipped selected tests are not passing evidence')
  if (retries > 0) throw new Error('Retries are not passing first-attempt evidence')
  const executed = passed + failed
  if (executed === 0) throw new Error('No tests executed')
  return {
    executed,
    failed,
    skipped,
    retries,
    status: failed > 0 ? 'failed' : 'passed',
  }
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

function browserEnvironment(attachments: unknown): Record<string, unknown> {
  const body = requireList(attachments)
    .map(requireObject)
    .find((item) => item.name === 'browser-environment')?.body
  return typeof body === 'string' && body
    ? requireObject(JSON.parse(Buffer.from(body, 'base64').toString('utf8')))
    : {}
}

function viewportSize(value: unknown): BrowserCase['viewport'] {
  if (value === undefined || value === null) return null
  const viewport = requireObject(value)
  return { width: requireNumber(viewport.width), height: requireNumber(viewport.height) }
}

function browserCase(test: Record<string, unknown>, title: string): BrowserCase {
  const results = requireList(test.results).map(requireObject)
  const last = results.at(-1)
  const environment = last ? browserEnvironment(last.attachments) : {}
  const scenario = requireList(test.annotations)
    .map(requireObject)
    .find((item) => item.type === 'scenario')?.description
  return {
    title,
    status: optionalString(last?.status) ?? 'skipped',
    attempts: results.map((result) => ({
      status: optionalString(result.status),
      retry: requireNumber(result.retry),
      duration: requireNumber(result.duration),
    })),
    scenario: optionalString(scenario) ?? 'normal',
    viewport: viewportSize(environment.viewport),
    theme: typeof environment.theme === 'string' ? environment.theme : null,
    browser: typeof environment.browser === 'string' ? environment.browser : null,
    errors: results.flatMap((result) =>
      requireList(result.errors).map((error) => requireString(requireObject(error).message)),
    ),
  }
}

export function browserCases(value: unknown): BrowserCase[] {
  const object = requireObject(value)
  if (!Array.isArray(object.suites)) throw new Error('Invalid browser suites')
  const cases: BrowserCase[] = []
  function collect(suites: unknown, parents: string[]) {
    for (const suite of requireList(suites).map(requireObject)) {
      const hierarchy = [...parents, requireString(suite.title)]
      for (const spec of requireList(suite.specs).map(requireObject)) {
        const title = [...hierarchy, requireString(spec.title)].join(' > ')
        for (const test of requireList(spec.tests).map(requireObject))
          cases.push(browserCase(test, title))
      }
      collect(suite.suites ?? [], hierarchy)
    }
  }
  collect(object.suites, [])
  return cases
}
