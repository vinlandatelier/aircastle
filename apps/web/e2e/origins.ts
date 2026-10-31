import process from 'node:process'

const port = Number(process.env.WEB_E2E_PORT ?? 43124)
if (!Number.isInteger(port) || port < 1024 || port > 65533) {
  throw new Error(
    `WEB_E2E_PORT must be an integer from 1024 to 65533, got ${process.env.WEB_E2E_PORT}`,
  )
}

/** Origins of the normal and fixture preview servers; the fixture server takes the next port. */
export const origins = {
  normal: { port, url: `http://127.0.0.1:${port}` },
  fixture: { port: port + 1, url: `http://127.0.0.1:${port + 1}` },
} as const

/** Origin of the auth instance server, which owns a real API and preview per auth journey. */
export const authInstances = { port: port + 2, url: `http://127.0.0.1:${port + 2}` } as const
