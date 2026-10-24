import process from 'node:process'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, open, readFile, readdir, readlink, lstat, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { browserCases, browserOutcome, requirementResults, type BrowserCase } from './evidence'
import { command, webRoot, withServers } from '../e2e/serve'
import requirementCatalog from '../e2e/requirements.json'

const require = createRequire(import.meta.url)
const output = path.resolve(
  process.env.WEB_RUN_DIR ??
    path.join(webRoot, 'reports', `verification-${Date.now()}-${process.pid}`),
)
const requirements = Object.keys(requirementCatalog)
const receipt: {
  status: 'running' | 'passed' | 'setup failure' | 'behavior failure' | 'check timeout'
  diagnostic?: string
  sourceFingerprint?: string
  revision?: string
  runtime: { node: string; bun: string | null; playwright: string }
  origin?: string
  fixtureOrigin?: string
  servingMode: string
  browserVersion: string | null
  counts?: ReturnType<typeof browserOutcome>
  cases: BrowserCase[]
  phases: { name: string; exitCode: number; executed?: number }[]
  cleanedUp: boolean
} = {
  status: 'running',
  runtime: {
    node: execFileSync('node', ['--version'], { encoding: 'utf8' }).trim(),
    bun: process.versions.bun ?? null,
    playwright: require('@playwright/test/package.json').version,
  },
  servingMode: 'built preview',
  browserVersion: null,
  cases: [],
  phases: [],
  cleanedUp: false,
}
let owned = false

async function fingerprint() {
  const hash = createHash('sha256')
  async function walk(directory: string) {
    for (const name of (await readdir(directory)).sort()) {
      const file = path.join(directory, name)
      if (
        file === output ||
        ['node_modules', 'dist', 'reports', 'coverage', '.git', '.vite'].includes(name)
      )
        continue
      const stat = await lstat(file)
      if (stat.isDirectory()) await walk(file)
      else {
        hash.update(path.relative(webRoot, file))
        hash.update('\0')
        hash.update(stat.isSymbolicLink() ? await readlink(file) : await readFile(file))
      }
    }
  }
  await walk(webRoot)
  return hash.digest('hex')
}

async function phase(name: string, argv: string[], env: NodeJS.ProcessEnv = {}) {
  const log = path.join(output, `${name}.log`)
  const code = await command(argv, log, { ...process.env, ...env, WEB_RUN_DIR: output })
  receipt.phases.push({ name, exitCode: code })
  if (code !== 0)
    throw new Error(
      `Setup: ${name} failed with exit ${code}; see ${log}\n${(await readFile(log, 'utf8')).slice(-4000)}`,
    )
}

async function requirePassingTests(name: string) {
  const report: { numTotalTests: number; numFailedTests: number; numPendingTests: number } =
    JSON.parse(await readFile(path.join(output, `${name}.json`), 'utf8'))
  if (
    !Number.isSafeInteger(report.numTotalTests) ||
    report.numTotalTests < 1 ||
    report.numFailedTests !== 0 ||
    report.numPendingTests !== 0
  )
    throw new Error(`Setup: ${name} suite must execute nonempty passing tests without skips`)
  receipt.phases.at(-1)!.executed = report.numTotalTests
}

async function fast(coverage: boolean) {
  const json = path.join(output, 'components.json')
  await phase(
    'components',
    [
      'vp',
      'test',
      'run',
      ...(coverage ? ['--coverage'] : []),
      '--reporter=default',
      '--reporter=json',
      '--reporter=junit',
      `--outputFile.json=${json}`,
      `--outputFile.junit=${path.join(output, 'components.xml')}`,
    ],
    { WEB_COVERAGE_DIR: path.join(output, 'coverage') },
  )
  await requirePassingTests('components')
  if (coverage) {
    const summary = JSON.parse(
      await readFile(path.join(output, 'coverage/coverage-summary.json'), 'utf8'),
    )
    await writeFile(
      path.join(output, 'coverage-info.json'),
      JSON.stringify(
        {
          provider: 'v8',
          revision: receipt.revision,
          sourceFingerprint: receipt.sourceFingerprint,
          runtime: receipt.runtime,
          totals: summary.total,
          interpretation: {
            css: false,
            compilerBranches:
              'React Compiler cache branches can affect branch totals; no percentage gate is imposed.',
            uiWrappers: Object.keys(summary).filter((file) => file.includes('/components/ui/')),
          },
        },
        null,
        2,
      ),
    )
  }
}

try {
  const [mode, ...args] = process.argv.slice(2)
  if (!['e2e', 'coverage', 'verify'].includes(mode ?? ''))
    throw new Error('Use e2e, coverage or verify')
  const parsed = parseArgs({
    args: args.filter((arg) => arg !== '--'),
    allowPositionals: true,
    strict: true,
    options: { grep: { type: 'string' } },
  })
  if (parsed.positionals.some((file) => !/^(?:e2e\/)?[\w.-]+\.spec\.ts$/.test(file)))
    throw new Error('Select browser spec files or use --grep')
  await mkdir(output, { recursive: true })
  if ((await readdir(output)).length) throw new Error(`Output resource is occupied: ${output}`)
  const lock = await open(path.join(output, '.owned'), 'wx')
  await lock.close()
  owned = true
  receipt.sourceFingerprint = await fingerprint()
  try {
    receipt.revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: webRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    receipt.revision = 'unversioned source; use sourceFingerprint'
  }
  if (mode === 'verify') {
    await phase('policy', ['vp', '-C', '../..', 'run', 'check:policy'])
    await phase('typecheck', [
      'vp',
      'exec',
      'tsc',
      '-p',
      'tsconfig.app.json',
      '--incremental',
      '--tsBuildInfoFile',
      path.join(output, 'app.tsbuildinfo'),
    ])
    await phase('typecheck-tools', [
      'vp',
      'exec',
      'tsc',
      '-p',
      'tsconfig.node.json',
      '--incremental',
      '--tsBuildInfoFile',
      path.join(output, 'tools.tsbuildinfo'),
    ])
    await phase('lint', ['vp', '-C', '../..', 'run', 'lint-web'])
    await phase('boundaries', [
      'vp',
      '-C',
      '../..',
      'test',
      'run',
      'tests/harness/module-boundaries.test.ts',
      '--allowOnly=false',
      '--reporter=default',
      '--reporter=json',
      '--reporter=junit',
      `--outputFile.json=${path.join(output, 'boundaries.json')}`,
      `--outputFile.junit=${path.join(output, 'boundaries.xml')}`,
    ])
    await requirePassingTests('boundaries')
    await fast(false)
  }
  if (mode === 'coverage') {
    await fast(true)
    receipt.status = 'passed'
  } else {
    process.env.NODE_ENV = 'production'
    await withServers(output, async (origins) => {
      receipt.origin = origins.normal
      receipt.fixtureOrigin = origins.fixture
      await writeFile(
        path.join(output, 'running.json'),
        JSON.stringify({
          origin: origins.normal,
          fixtureOrigin: origins.fixture,
          sourceFingerprint: receipt.sourceFingerprint,
        }),
      )
      const code = await command(
        [
          'vp',
          'exec',
          'playwright',
          'test',
          ...parsed.positionals,
          ...(parsed.values.grep ? ['--grep', parsed.values.grep] : []),
          '--forbid-only',
          '--retries=0',
        ],
        path.join(output, 'browser.log'),
        {
          ...process.env,
          WEB_RUN_DIR: output,
          WEB_ORIGIN: origins.normal,
          WEB_FIXTURE_ORIGIN: origins.fixture,
        },
      )
      let report: unknown
      try {
        report = JSON.parse(await readFile(path.join(output, 'browser.json'), 'utf8'))
      } catch {
        throw new Error(`Setup: browser report missing or invalid; see browser.log (exit ${code})`)
      }
      receipt.cases = browserCases(report)
      receipt.browserVersion = receipt.cases.find((item) => item.browser)?.browser ?? null
      await writeFile(
        path.join(output, 'requirements.json'),
        JSON.stringify(requirementResults(receipt.cases, requirements), null, 2),
      )
      const details = receipt.cases.flatMap((item) => item.errors).join('\n')
      if (/Executable doesn't exist|browserType\.launch|browser has been closed/i.test(details))
        throw new Error(`Setup: browser unavailable: ${details.slice(0, 2000)}`)
      if (receipt.cases.some((item) => item.status === 'timedOut')) {
        receipt.status = 'check timeout'
        throw new Error(`Check timeout: ${details.slice(0, 2000)}`)
      }
      receipt.counts = browserOutcome(report)
      if (receipt.counts.status === 'failed') {
        receipt.status = 'behavior failure'
        throw new Error(`Behavior assertion failure: ${details.slice(0, 3000)}`)
      }
      if (code !== 0) throw new Error(`Setup: browser runner exited ${code}; see browser.log`)
      receipt.status = 'passed'
    })
  }
} catch (error) {
  if (receipt.status === 'running') receipt.status = 'setup failure'
  receipt.diagnostic = error instanceof Error ? error.message : String(error)
  console.error(receipt.diagnostic)
  process.exitCode = 1
} finally {
  if (owned) {
    receipt.cleanedUp = true
    await writeFile(path.join(output, 'receipt.json'), JSON.stringify(receipt, null, 2))
    await rm(path.join(output, '.owned'))
  }
  console.log(`Verification ${receipt.status}: ${output}`)
}
