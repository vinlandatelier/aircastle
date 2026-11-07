import { expect, test } from "vite-plus/test";
import { claim, withAuth } from "./test-support/fixture.ts";

const cookieName = (origin: string) => `aircastle_session_${new URL(origin).port}`;

for (const origin of ["http://localhost:43121", "http://127.0.0.1:43130"]) {
  test(`confirmation, renewal and sign-out use one cookie named for ${origin}`, async () => {
    await withAuth(
      async ({ open }) => {
        const server = await open();
        const name = cookieName(origin);
        const { cookie, setCookie } = await claim(server);
        expect(setCookie.startsWith(`${name}=`)).toBe(true);
        expect(setCookie).toMatch(/;\s*Max-Age=1209600(?:;|$)/u);
        expect(setCookie).toMatch(/;\s*Path=\/(?:;|$)/u);
        const renewed = await server.request("/auth/activity", {}, cookie);
        expect(renewed.status).toBe(200);
        expect(renewed.headers.get("set-cookie")?.startsWith(`${name}=`)).toBe(true);
        const signedOut = await server.request("/auth/sign-out", {}, cookie);
        expect(signedOut.headers.get("set-cookie")?.startsWith(`${name}=;`)).toBe(true);
      },
      { browserOrigin: origin },
    );
  });
}

test("a session cookie from another origin's port or signing secret is not accepted", async () => {
  await withAuth(
    async ({ open: openFirst }) => {
      const first = await openFirst();
      const { cookie } = await claim(first);
      const value = cookie.slice(cookie.indexOf("=") + 1);
      await withAuth(
        async ({ open: openSecond }) => {
          const second = await openSecond();
          await claim(second);
          for (const presented of [cookie, `${cookieName("http://localhost:43130")}=${value}`]) {
            const response = await second.request("/auth/session", undefined, presented);
            expect(response.status, presented.split("=")[0]).toBe(401);
          }
        },
        { browserOrigin: "http://localhost:43130" },
      );
    },
    { browserOrigin: "http://localhost:43121" },
  );
});
