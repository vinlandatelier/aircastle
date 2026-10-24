import process from 'node:process'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const web = path.resolve(import.meta.dirname, '..')

describe('[R1 R10] browser command contract', () => {
  it('rejects empty test discovery with a recorded setup failure', () => {
    const output = mkdtempSync(path.join(tmpdir(), 'aircastle-empty-'))
    try {
      const result = spawnSync(
        'bun',
        ['scripts/verify-web.ts', 'e2e', '--grep', 'NO_SUCH_TEST_734021'],
        {
          cwd: web,
          env: { ...process.env, WEB_RUN_DIR: output },
          encoding: 'utf8',
          timeout: 180_000,
        },
      )
      expect(result.status, result.stdout + result.stderr).not.toBe(0)
      const receipt = JSON.parse(readFileSync(path.join(output, 'receipt.json'), 'utf8'))
      expect(receipt.status).toBe('setup failure')
      expect(receipt.diagnostic).toMatch(/No tests found|No tests executed/)
      expect(receipt.origin).toBeTruthy()
      expect(receipt.cleanedUp).toBe(true)
      expect(() =>
        execFileSync('curl', ['--fail', '--max-time', '2', receipt.origin], { stdio: 'ignore' }),
      ).toThrow()
    } finally {
      rmSync(output, { recursive: true, force: true })
    }
  }, 180_000)
})

it('[R1] concurrent browser commands own distinct servers and output', async () => {
  const outputs = [
    mkdtempSync(path.join(tmpdir(), 'aircastle-first-')),
    mkdtempSync(path.join(tmpdir(), 'aircastle-second-')),
  ]
  try {
    const codes = await Promise.all(
      outputs.map(
        (output) =>
          new Promise<number | null>((resolve, reject) => {
            const child = spawn(
              'bun',
              ['scripts/verify-web.ts', 'e2e', '--grep', 'normal production build exposes'],
              {
                cwd: web,
                env: { ...process.env, WEB_RUN_DIR: output },
                stdio: 'ignore',
                timeout: 180_000,
              },
            )
            child.once('error', reject)
            child.once('exit', resolve)
          }),
      ),
    )
    expect(codes).toEqual([0, 0])
    const receipts = outputs.map((output) =>
      JSON.parse(readFileSync(path.join(output, 'receipt.json'), 'utf8')),
    )
    expect(receipts[0].origin).not.toBe(receipts[1].origin)
    for (const receipt of receipts) {
      expect(receipt.status).toBe('passed')
      expect(receipt.counts.executed).toBeGreaterThan(0)
      expect(receipt.cleanedUp).toBe(true)
      expect(() =>
        execFileSync('curl', ['--fail', '--max-time', '2', receipt.origin], { stdio: 'ignore' }),
      ).toThrow()
    }
  } finally {
    for (const output of outputs) rmSync(output, { recursive: true, force: true })
  }
}, 180_000)
