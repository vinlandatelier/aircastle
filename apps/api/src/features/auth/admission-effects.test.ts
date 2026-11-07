import type { AuthStore } from "@aircastle/core";
import { expect, test } from "vite-plus/test";
import { claim, limits, withAuth } from "./test-support/fixture.ts";

for (const scope of ["ip", "global"] as const) {
  test(`${scope} admission blocks changing known and unknown recipients before lookup, replacement or capture`, async () => {
    const lookedUp: string[] = [];
    const replaced: string[] = [];
    const captured: string[] = [];
    const observe = (store: AuthStore): AuthStore => ({
      ...store,
      transaction: (work) =>
        store.transaction((tx) =>
          work({
            ...tx,
            userByEmail: async (email) => {
              lookedUp.push(email);
              return tx.userByEmail(email);
            },
            replaceLink: async (link) => {
              replaced.push(link.email);
              await tx.replaceLink(link);
            },
          }),
        ),
    });
    await withAuth(
      async ({ open, at }) => {
        const server = await open();
        await claim(server);
        at(3_600_000);
        lookedUp.length = 0;
        replaced.length = 0;
        captured.length = 0;
        const healthy = await server.request("/auth/sign-in", { email: "alex@example.test" });
        expect(healthy.status).toBe(200);
        expect(lookedUp).toContain("alex@example.test");
        expect(replaced).toEqual(["alex@example.test"]);
        expect(captured).toEqual(["alex@example.test"]);
        const unknown = await server.request("/auth/sign-in", { email: "unknown@example.test" });
        expect(unknown.status).toBe(200);
        expect(lookedUp).toContain("unknown@example.test");
        expect(replaced).toEqual(["alex@example.test"]);
        expect(captured).toEqual(["alex@example.test"]);
        const before = {
          lookedUp: [...lookedUp],
          replaced: [...replaced],
          captured: [...captured],
          inbox: [...server.inbox.list()],
        };
        for (const [index, email] of [
          "alex@example.test",
          "changed1@example.test",
          "changed2@example.test",
          "unknown@example.test",
        ].entries()) {
          const peer = scope === "ip" ? "127.0.0.1" : `127.0.0.${index + 2}`;
          const rejected = await server.request("/auth/sign-in", { email }, undefined, {}, peer);
          expect(rejected.status, email).toBe(429);
          expect(rejected.headers.get("set-cookie")).toBeNull();
          expect({ lookedUp, replaced, captured, inbox: server.inbox.list() }).toEqual(before);
        }
      },
      {
        limits: { ...limits, [scope]: { fiveMinutes: 2, oneHour: 2 } },
        storage: observe,
        onPrepare: (mail) => captured.push(...mail.to),
      },
    );
  });
}
