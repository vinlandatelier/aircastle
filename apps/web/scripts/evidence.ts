export function browserOutcome(_report: unknown): {
  executed: number
  failed: number
  skipped: number
  retries: number
  status: 'passed' | 'failed'
} {
  throw new Error('Evidence classification not implemented')
}

export function requirementResults(
  _cases: { title: string; status: string }[],
  _requirements: string[],
): Record<string, string> {
  return {}
}
