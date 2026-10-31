import { expect, test } from "vite-plus/test";
import { withAuth } from "./test-support/fixture.ts";
import { authProcess } from "./test-support/process.ts";

async function setup(process: Awaited<ReturnType<typeof authProcess>>, email: string) {
  const response = await process.request("/auth/setup", { name: "Process fixture", email });
  expect(response.status).toBe(200);
  const entry = (await process.inbox()).find((candidate) => candidate.mail.to.includes(email));
  expect(entry).toBeDefined();
  const link = entry?.mail.text.match(/https?:\/\/[^\s<>]+/u)?.[0];
  if (!link) throw new Error("Real child inbox must publish the setup link");
  return { purpose: "setup", token: new URL(link).searchParams.get("token") };
}

for (const sameIdentity of [false, true]) {
  test(`two application processes enforce one ${sameIdentity ? "token redemption" : "initial setup claim"}`, async () => {
    await withAuth(async ({ url, namespace }) => {
      const first = await authProcess(url, namespace);
      let second: Awaited<ReturnType<typeof authProcess>> | undefined;
      try {
        second = await authProcess(url, namespace);
        const a = await setup(first, "first@example.test");
        const b = sameIdentity ? a : await setup(second, "second@example.test");
        const responses = await Promise.all([
          first.request("/auth/confirm", a),
          second.request("/auth/confirm", b),
        ]);
        expect(responses.map((response) => response.status).sort((a, b) => a - b)).toEqual(
          sameIdentity ? [200, 400] : [200, 409],
        );
        expect(responses.filter((response) => response.headers.has("set-cookie"))).toHaveLength(1);
      } finally {
        await Promise.all([first.close(), second?.close()]);
      }
    });
  });
}

test("second process replacement supersedes the first process's earlier link", async () => {
  await withAuth(async ({ url, namespace }) => {
    const first = await authProcess(url, namespace);
    let second: Awaited<ReturnType<typeof authProcess>> | undefined;
    try {
      second = await authProcess(url, namespace);
      const old = await setup(first, "alex@example.test");
      const latest = await setup(second, "alex@example.test");
      const oldResponse = await first.request("/auth/confirm", old);
      expect(oldResponse.status).toBe(400);
      expect(await oldResponse.json()).toEqual({ kind: "superseded-link", next: "setup" });
      expect((await first.request("/auth/confirm", latest)).status).toBe(200);
    } finally {
      await Promise.all([first.close(), second?.close()]);
    }
  });
});

test("an ordinary application process restart preserves a real signed session and clears only its inbox", async () => {
  await withAuth(async ({ url, namespace }) => {
    const first = await authProcess(url, namespace);
    let reopened: Awaited<ReturnType<typeof authProcess>> | undefined;
    try {
      const link = await setup(first, "alex@example.test");
      const confirmed = await first.request("/auth/confirm", link);
      expect(confirmed.status).toBe(200);
      const cookie = confirmed.headers.get("set-cookie")?.split(";")[0];
      expect(cookie).toBeTruthy();
      if (!cookie) throw new Error("Real process must issue a signed cookie");
      await first.close();
      reopened = await authProcess(url, namespace);
      expect(await reopened.inbox()).toHaveLength(0);
      const response = await reopened.request("/auth/session", undefined, cookie);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        kind: "ok",
        value: { user: { email: "alex@example.test" } },
      });
      expect(
        (await reopened.request("/auth/setup", { name: "Other", email: "other@example.test" }))
          .status,
      ).toBe(409);
    } finally {
      await Promise.all([first.close(), reopened?.close()]);
    }
  });
});

test("a held pending URL remains redeemable after restarting its issuer process", async () => {
  await withAuth(async ({ url, namespace }) => {
    const first = await authProcess(url, namespace);
    let reopened: Awaited<ReturnType<typeof authProcess>> | undefined;
    try {
      const link = await setup(first, "alex@example.test");
      await first.close();
      reopened = await authProcess(url, namespace);
      expect(await reopened.inbox()).toHaveLength(0);
      expect((await reopened.request("/auth/confirm", link)).status).toBe(200);
    } finally {
      await Promise.all([first.close(), reopened?.close()]);
    }
  });
});
