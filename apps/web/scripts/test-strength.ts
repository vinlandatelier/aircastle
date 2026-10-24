import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const output = process.env.WEB_STRENGTH_DIR!
await mkdir(output, { recursive: true })
await writeFile(
  path.join(output, 'strength.json'),
  JSON.stringify({ status: 'not implemented', cases: [] }),
)
