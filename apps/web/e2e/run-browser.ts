import process from 'node:process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { command, webRoot, withServers } from './serve'

const output = path.resolve(
  process.env.WEB_RUN_DIR ?? path.join(webRoot, 'reports', `browser-${Date.now()}-${process.pid}`),
)
await mkdir(output, { recursive: true })
let code = 1
try {
  code = await withServers(output, async (origins) => {
    await writeFile(path.join(output, 'origins.json'), JSON.stringify(origins))
    return command(
      ['vp', 'exec', 'playwright', 'test', ...process.argv.slice(2)],
      path.join(output, 'browser.log'),
      {
        ...process.env,
        WEB_RUN_DIR: output,
        WEB_ORIGIN: origins.normal,
        WEB_FIXTURE_ORIGIN: origins.fixture,
      },
    )
  })
} catch (error) {
  console.error(error)
}
console.log(
  await readFile(path.join(output, 'browser.log'), 'utf8').catch(() => 'Browser was not started'),
)
console.log(`Evidence: ${output}`)
process.exitCode = code
