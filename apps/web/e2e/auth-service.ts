import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import postgres from 'postgres'
import { postgresAdapter } from '@aircastle/adapter-postgres'
import { test as base } from './support'
import { authInstances } from './origins'

export type AuthService = {
  origin: string
  namespace: string
  advance: (milliseconds: number) => Promise<void>
  provisionProject: () => Promise<{ workspaceId: string; projectId: string }>
  grantWorkspace: (email: string, workspaceId: string) => Promise<void>
  revokeWorkspace: (email: string, workspaceId: string) => Promise<void>
}

async function controller<Value = unknown>(method: string, pathname: string, body?: unknown) {
  const response = await fetch(new URL(pathname, authInstances.url), {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  })
  const value: unknown = await response.json()
  if (!response.ok) throw new Error(`Auth fixture ${method} ${pathname}: ${JSON.stringify(value)}`)
  return value as Value
}

export const test = base.extend<{
  authService: AuthService
  authEnvironment: Record<string, string>
}>({
  authEnvironment: [{}, { option: true }],
  expectedHttpErrors: [
    [
      '/api/auth/confirm/preview',
      '/api/auth/confirm',
      '/api/auth/setup',
      '/api/auth/sign-in',
      '/api/auth/session',
      '/api/auth/activity',
      '/api/development-inbox/messages',
    ],
    { scope: 'test' },
  ],
  baseURL: async ({ authService }, provide) => provide(authService.origin),
  authService: async ({ authEnvironment }, provide, info) => {
    if (!process.env.AIRCASTLE_DATABASE_URL)
      throw new Error('Use vp run test-auth:web to own Postgres for auth journeys')
    const namespace = `browser_${randomUUID().replaceAll('-', '')}`
    const sql = postgres(process.env.AIRCASTLE_DATABASE_URL, { max: 1, onnotice: () => {} })
    const instance = await controller<{ id: string; origin: string; apiOrigin: string }>(
      'POST',
      '/instances',
      { namespace, log: info.outputPath('api.log'), environment: authEnvironment },
    )
    const origin = instance.origin
    try {
      const health = await fetch(`${origin}/api/health`)
      if (health.status !== 200) throw new Error(`Auth fixture health returned ${health.status}`)
      await writeFile(
        info.outputPath('service.json'),
        JSON.stringify({ origin, apiOrigin: instance.apiOrigin, namespace }),
      )
      await provide({
        origin,
        namespace,
        async provisionProject() {
          const content = postgresAdapter({ url: process.env.AIRCASTLE_DATABASE_URL!, namespace })
          try {
            const project = await content.provision({
              verifier: randomUUID(),
              permissions: ['content:read'],
              key: 'reuse',
              workspaceName: 'Development workspace',
              projectName: 'Development project',
            })
            return { workspaceId: project.workspace, projectId: project.project }
          } finally {
            await content.close()
          }
        },
        async grantWorkspace(email, workspaceId) {
          const rows = await sql`
            INSERT INTO ${sql(namespace)}.auth_workspace_access (user_id, workspace_id)
            SELECT id, ${workspaceId} FROM ${sql(namespace)}.auth_users WHERE email = ${email}
            RETURNING user_id`
          if (rows.length !== 1) throw new Error('Auth fixture must grant one existing user access')
        },
        async revokeWorkspace(email, workspaceId) {
          const rows = await sql`
            DELETE FROM ${sql(namespace)}.auth_workspace_access
            WHERE workspace_id = ${workspaceId}
              AND user_id IN (SELECT id FROM ${sql(namespace)}.auth_users WHERE email = ${email})
            RETURNING user_id`
          if (rows.length !== 1) throw new Error('Auth fixture must revoke one existing membership')
        },
        advance: async (milliseconds) => {
          await controller('POST', `/instances/${instance.id}/advance`, { milliseconds })
        },
      })
    } finally {
      try {
        await controller('DELETE', `/instances/${instance.id}`)
      } finally {
        try {
          await sql`DROP SCHEMA IF EXISTS ${sql(namespace)} CASCADE`
        } finally {
          await sql.end()
        }
      }
    }
  },
})

export { expect } from './support'
