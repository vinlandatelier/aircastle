import process from 'node:process'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vite-plus/test'

const web = path.resolve(import.meta.dirname, '..')

describe('browser command contract', () => {
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
