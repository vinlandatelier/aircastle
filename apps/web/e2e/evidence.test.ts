import { describe, expect, it } from 'vite-plus/test'
import { browserOutcome, requirementResults } from '../scripts/evidence'

describe('verification evidence', () => {
  it('accepts only executed passing tests', () => {
    expect(
      browserOutcome({ stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 }, errors: [] }),
    ).toEqual({ executed: 2, failed: 0, skipped: 0, retries: 0, status: 'passed' })
    expect(() =>
      browserOutcome({ stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 } }),
    ).toThrow('No tests executed')
    expect(() =>
      browserOutcome({ stats: { expected: 1, unexpected: 0, skipped: 1, flaky: 0 } }),
    ).toThrow('Skipped')
    expect(() =>
      browserOutcome({
        stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 },
        errors: [{ message: 'Browser missing' }],
      }),
    ).toThrow('Setup')
  })
  it('keeps assertion failures and retries visible', () => {
    expect(
      browserOutcome({ stats: { expected: 1, unexpected: 1, skipped: 0, flaky: 0 }, errors: [] })
        .status,
    ).toBe('failed')
    expect(() =>
      browserOutcome({ stats: { expected: 1, unexpected: 0, skipped: 0, flaky: 1 } }),
    ).toThrow('Retries')
  })
  it('does not report unexercised requirements as passed', () => {
    expect(
      requirementResults(
        [
          { title: '[R2] entry', status: 'passed' },
          { title: '[R3] toggle', status: 'failed' },
        ],
        ['R2', 'R3', 'R5'],
      ),
    ).toEqual({ R2: 'passed', R3: 'failed', R5: 'not exercised' })
    expect(
      requirementResults(
        [
          { title: '[R2] first', status: 'passed' },
          { title: '[R2] second', status: 'failed' },
        ],
        ['R2'],
      ),
    ).toEqual({ R2: 'failed' })
  })
})
