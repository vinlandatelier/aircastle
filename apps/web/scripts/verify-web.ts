import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = process.env.WEB_RUN_DIR ?? path.resolve('reports/verification-stub')
await mkdir(output, { recursive: true })
await writeFile(
  path.join(output, 'receipt.json'),
  JSON.stringify({ status: 'passed', origin: 'http://127.0.0.1:1', cleanedUp: false }),
)
