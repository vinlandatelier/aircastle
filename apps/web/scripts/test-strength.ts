import process from 'node:process'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, realpath, rm, open, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { strengthCases } from '../e2e/strength-cases'
import { browserCases, browserOutcome } from './evidence'
import {
  copyWeb,
  originalWeb,
  readJson,
  runWeb,
  verificationTimeouts,
} from './verification-sandbox'

type Observation = {
  status: 'passed' | 'failed' | 'setup failure' | 'timeout'
  executed: number
  failed: number
  skipped: number
  namedFailures: string[]
  diagnostic?: string
}
type Outcome = 'killed' | 'survived' | 'invalid' | 'setup failure' | 'timeout'
type CaseRecord = {
  id: string
  failure: string
  output: string
  outcome: Outcome
  baseline?: Observation
  fault?: Observation
  restored?: Observation
  diagnostic?: string
  sourceHash?: string
  mutantHash?: string
}
type ComponentReport = {
  numTotalTests: number
  numFailedTests: number
  numPendingTests: number
  testResults: {
    assertionResults: { fullName: string; status: string; failureMessages: string[] }[]
  }[]
}

const output = path.resolve(
  process.env.WEB_STRENGTH_DIR ??
    path.join(originalWeb, 'reports', `strength-${Date.now()}-${process.pid}`),
)
const report: {
  status: 'running' | 'passed' | 'failed'
  cases: CaseRecord[]
  diagnostic?: string
} = { status: 'running', cases: [] }
let owned = false
const empty = (status: Observation['status'], diagnostic: string): Observation => ({
  status,
  executed: 0,
  failed: 0,
  skipped: 0,
  namedFailures: [],
  diagnostic,
})

async function observe(
  directory: string,
  selected: (typeof strengthCases)[number],
  location: string,
): Promise<Observation> {
  await mkdir(location, { recursive: true })
  const args = [
    'test',
    'run',
    ...selected.selection,
    '--reporter=default',
    '--reporter=json',
    '--reporter=junit',
    `--outputFile.json=${path.join(location, 'components.json')}`,
    `--outputFile.junit=${path.join(location, 'components.xml')}`,
  ]
  const result =
    selected.kind === 'browser'
      ? runWeb(directory, location, ['e2e', ...selected.selection])
      : spawnSync('vp', args, {
          cwd: directory,
          env: { ...process.env, WEB_RUN_DIR: location },
          encoding: 'utf8',
          timeout: verificationTimeouts.component,
        })
  await writeFile(`${location}.log`, (result.stdout ?? '') + (result.stderr ?? ''))
  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT')
    return empty('timeout', 'Command timed out')
  if (result.error || result.signal)
    return empty('setup failure', result.error?.message ?? `Command stopped by ${result.signal}`)
  try {
    if (selected.kind === 'browser') {
      const receipt = readJson(location, 'receipt.json')
      if (receipt.status === 'check timeout') return empty('timeout', receipt.diagnostic)
      if (!['passed', 'behavior failure'].includes(receipt.status))
        return empty('setup failure', receipt.diagnostic)
      const raw = readJson(location, 'browser.json')
      const counts = browserOutcome(raw)
      const failures = browserCases(raw).filter(
        (item) => item.status === 'failed' && item.errors.length > 0,
      )
      if (counts.failed > 0 && !failures.length)
        return empty('setup failure', 'No failed assertion record')
      if ((result.status === 0) !== (counts.failed === 0))
        return empty('setup failure', 'Exit status and browser assertions disagree')
      return {
        status: counts.status,
        executed: counts.executed,
        failed: counts.failed,
        skipped: counts.skipped,
        namedFailures: failures.map((item) => item.title),
      }
    }
    const raw: ComponentReport = readJson(location, 'components.json')
    const counts = [raw.numTotalTests, raw.numFailedTests, raw.numPendingTests]
    if (
      !counts.every((value) => Number.isSafeInteger(value) && value >= 0) ||
      raw.numTotalTests === 0 ||
      raw.numFailedTests > raw.numTotalTests ||
      raw.numPendingTests !== 0
    )
      return empty('setup failure', 'Component suite must execute nonempty tests without skips')
    const failures = raw.testResults.flatMap((suite) =>
      suite.assertionResults.filter(
        (test) => test.status === 'failed' && test.failureMessages.length > 0,
      ),
    )
    if (
      failures.some((test) =>
        test.failureMessages.some((message) =>
          /Test timed out|Timeout of \d+ms exceeded/.test(message),
        ),
      )
    )
      return empty('timeout', 'Component assertion timed out')
    if (
      raw.numFailedTests !== failures.length ||
      (result.status === 0) !== (raw.numFailedTests === 0)
    )
      return empty('setup failure', 'Exit status and component assertions disagree')
    return {
      status: raw.numFailedTests > 0 ? 'failed' : 'passed',
      executed: raw.numTotalTests,
      failed: raw.numFailedTests,
      skipped: 0,
      namedFailures: failures.map((test) => test.fullName),
    }
  } catch (error) {
    return empty('setup failure', error instanceof Error ? error.message : String(error))
  }
}

try {
  const parsed = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { case: { type: 'string' } },
    strict: true,
  })
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length) throw new Error(`Output resource is occupied: ${output}`)
  const lock = await open(path.join(output, '.owned'), 'wx')
  await lock.close()
  owned = true
  const selected = strengthCases.filter(
    (item) => !parsed.values.case || item.id === parsed.values.case,
  )
  if (!selected.length) throw new Error(`Unknown strength case: ${parsed.values.case}`)
  for (const fault of selected) {
    const item: CaseRecord = {
      id: fault.id,
      failure: fault.failure,
      output: path.join(output, fault.id),
      outcome: 'invalid',
    }
    report.cases.push(item)
    const sandbox = copyWeb()
    let source: string | undefined
    let original: Buffer | undefined
    try {
      source = await realpath(path.resolve(sandbox.directory, fault.source))
      const relative = path.relative(await realpath(sandbox.directory), source)
      if (relative.startsWith('..') || path.isAbsolute(relative))
        throw new Error('Fault source must stay inside its disposable copy')
      original = await readFile(source)
      const text = original.toString('utf8')
      const replacement: string = fault.to
      if (text.split(fault.from).length !== 2 || fault.from === replacement) {
        item.diagnostic = 'Fault anchor must occur exactly once and change the source'
        continue
      }
      item.sourceHash = createHash('sha256').update(original).digest('hex')
      item.baseline = await observe(sandbox.directory, fault, path.join(item.output, 'baseline'))
      if (item.baseline.status !== 'passed') {
        item.outcome = item.baseline.status === 'timeout' ? 'timeout' : 'setup failure'
        item.diagnostic = 'Baseline did not establish a passing control'
        continue
      }
      const mutant = text.replace(fault.from, fault.to)
      item.mutantHash = createHash('sha256').update(mutant).digest('hex')
      await writeFile(source, mutant)
      try {
        item.fault = await observe(sandbox.directory, fault, path.join(item.output, 'fault'))
      } finally {
        await writeFile(source, original)
      }
      item.restored = await observe(sandbox.directory, fault, path.join(item.output, 'restored'))
      if (item.restored.status !== 'passed') {
        item.outcome = item.restored.status === 'timeout' ? 'timeout' : 'setup failure'
        item.diagnostic = 'Restored source did not pass its control'
      } else if (item.fault.status === 'passed') item.outcome = 'survived'
      else if (item.fault.status !== 'failed') item.outcome = item.fault.status
      else if (item.fault.namedFailures.some((name) => name.includes(fault.failure)))
        item.outcome = 'killed'
      else item.diagnostic = 'Failed assertions did not match the intended fault'
    } catch (error) {
      item.outcome = 'setup failure'
      item.diagnostic = error instanceof Error ? error.message : String(error)
    } finally {
      if (source && original) await writeFile(source, original)
      sandbox.remove()
    }
    console.log(`${item.id}: ${item.outcome}`)
  }
  report.status =
    report.cases.length > 0 && report.cases.every((item) => item.outcome === 'killed')
      ? 'passed'
      : 'failed'
} catch (error) {
  report.status = 'failed'
  report.diagnostic = error instanceof Error ? error.message : String(error)
} finally {
  if (owned) {
    await writeFile(path.join(output, 'strength.json'), JSON.stringify(report, null, 2))
    await rm(path.join(output, '.owned'))
  }
  console.log(`Test strength ${report.status}: ${output}`)
  if (report.status !== 'passed') process.exitCode = 1
}
