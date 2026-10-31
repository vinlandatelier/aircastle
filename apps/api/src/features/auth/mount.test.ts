import { expect, test } from "vite-plus/test";
import pino from "pino";
import { createApp } from "../../app.ts";

for (const path of ["/api/auth/state", "/api/development-inbox/messages"]) {
  test(`app passes trusted transport peer to auth mount ${path}`, async () => {
    const calls: { path: string; address: string | undefined }[] = [];
    const app = createApp({
      logger: pino({ level: "silent" }),
      auth: {
        handle: async (request, peer) => {
          calls.push({ path: new URL(request.url).pathname, address: peer.address });
          return Response.json({ marker: "mount-control" }, { status: 418 });
        },
        close: async () => {},
      },
    });
    const response = await app.request(
      path,
      { headers: { "x-forwarded-for": "198.51.100.5" } },
      { peerAddress: "127.0.0.1" },
    );
    expect(response.status).toBe(418);
    expect(calls).toEqual([{ path, address: "127.0.0.1" }]);
    await app.request(path, { headers: { "x-forwarded-for": "198.51.100.5" } });
    expect(calls[1]).toEqual({ path, address: undefined });
    expect((await app.request("/api/health")).status).toBe(200);
    expect(calls).toHaveLength(2);
  });
}

test("an unexpected auth mount failure returns a generic 500 and logs one sanitized summary", async () => {
  const secret = "credential-canary";
  class LibraryFault extends Error {}
  const lines: string[] = [];
  const app = createApp({
    logger: pino({ level: "info" }, { write: (line) => lines.push(line) }),
    auth: {
      handle: async () => {
        throw new LibraryFault(`failed for ${secret}`);
      },
      close: async () => {},
    },
  });
  const response = await app.request(`/api/auth/${secret}`, {}, { peerAddress: "127.0.0.1" });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ error: "Internal server error" });
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({
    level: 50,
    err: { type: "ErrorSummary", message: "LibraryFault" },
  });
  expect(lines.join("")).not.toContain(secret);
});
