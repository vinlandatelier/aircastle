import process from 'node:process'

const port = Number(process.env.WEB_E2E_PORT ?? 43124)
if (!Number.isInteger(port) || port < 1024 || port > 65534) {
  throw new Error(
    `WEB_E2E_PORT must be an integer from 1024 to 65534, got ${process.env.WEB_E2E_PORT}`,
  )
}

/** Origins of the normal and fixture preview servers; the fixture server takes the next port. */
export const origins = {
  normal: { port, url: `http://127.0.0.1:${port}` },
  fixture: { port: port + 1, url: `http://127.0.0.1:${port + 1}` },
} as const
