import { describe, expect, test } from "vite-plus/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import type { AuthAdmissionStore, AuthLimits, AuthLimitScope } from "@aircastle/core";
import { postgresAuthAdmission } from "./index.ts";
import { withDatabase } from "./test-support/database.ts";

const defaults: AuthLimits = {
  email: { fiveMinutes: 5, oneHour: 20 },
  ip: { fiveMinutes: 10, oneHour: 30 },
  global: { fiveMinutes: 30, oneHour: 100 },
};
const generous: AuthLimits = {
  email: { fiveMinutes: 1_000, oneHour: 1_000 },
  ip: { fiveMinutes: 1_000, oneHour: 1_000 },
  global: { fiveMinutes: 1_000, oneHour: 1_000 },
};
const start = Date.UTC(2026, 0, 1);
const request = { source: "127.0.0.1", email: "alex@example.test" };

async function withAdmission(
  run: (fixture: {
    open: (limits?: AuthLimits) => Promise<AuthAdmissionStore>;
    at: (milliseconds: number) => void;
    url: string;
    namespace: string;
  }) => Promise<void>,
) {
  await withDatabase(async ({ store, url, namespace, sql }) => {
    await store.initialize();
    expect((await sql`SELECT 1 AS connected`)[0]?.connected).toBe(1);
    let now = start;
    const opened: AuthAdmissionStore[] = [];
    try {
      await run({
        url,
        namespace,
        at: (milliseconds) => {
          now = start + milliseconds;
        },
        open: async (limits = defaults) => {
          const admission = await postgresAuthAdmission({
            url,
            namespace,
            limits,
            clock: () => now,
          });
          opened.push(admission);
          return admission;
        },
      });
    } finally {
      await Promise.all(opened.map((admission) => admission.close()));
    }
  });
}

describe("durable auth request admission", () => {
  test.each<AuthLimitScope>(["email", "ip", "global"])(
    "%s enforces the approved five-minute ceiling",
    async (scope) => {
      await withAdmission(async ({ open }) => {
        const admission = await open({ ...generous, [scope]: defaults[scope] });
        for (let index = 0; index < defaults[scope].fiveMinutes; index++)
          expect(await admission.admit(request)).toEqual({ kind: "admitted" });
        expect(await admission.admit(request)).toEqual({
          kind: "throttled",
          retryAt: start + 300_000,
          scopes: [scope],
        });
      });
    },
  );

  test.each<AuthLimitScope>(["email", "ip", "global"])(
    "%s enforces the approved hour ceiling even when the five-minute window has emptied",
    async (scope) => {
      await withAdmission(async ({ open, at }) => {
        const admission = await open({ ...generous, [scope]: defaults[scope] });
        const count = defaults[scope].oneHour;
        for (let index = 0; index < count; index++) {
          at(Math.floor(index / defaults[scope].fiveMinutes) * 300_000);
          expect(await admission.admit(request)).toEqual({ kind: "admitted" });
        }
        at(1_500_000);
        expect(await admission.admit(request)).toEqual({
          kind: "throttled",
          retryAt: start + 3_600_000,
          scopes: [scope],
        });
        at(3_600_000);
        expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      });
    },
  );

  test("rolling windows expire individual admissions at the exact boundary", async () => {
    await withAdmission(async ({ open, at }) => {
      const admission = await open();
      for (const time of [0, 10_000, 20_000, 30_000, 40_000]) {
        at(time);
        expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      }
      at(299_999);
      expect(await admission.admit(request)).toMatchObject({
        kind: "throttled",
        retryAt: start + 300_000,
      });
      at(300_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      at(300_001);
      expect(await admission.admit(request)).toMatchObject({
        kind: "throttled",
        retryAt: start + 310_000,
      });
    });
  });

  test("email-throttled and malformed requests consume admitted outer slots only", async () => {
    await withAdmission(async ({ open }) => {
      const admission = await open({
        ...generous,
        email: { fiveMinutes: 1, oneHour: 1 },
        ip: { fiveMinutes: 4, oneHour: 4 },
      });
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      expect(await admission.admit(request)).toMatchObject({
        kind: "throttled",
        scopes: ["email"],
      });
      expect(await admission.admit({ source: request.source })).toEqual({ kind: "admitted" });
      expect(await admission.admit(request)).toMatchObject({
        kind: "throttled",
        scopes: ["email"],
      });
      expect(await admission.admit({ ...request, email: "other@example.test" })).toMatchObject({
        kind: "throttled",
        scopes: ["ip"],
      });
      expect(await admission.admit({ source: "127.0.0.2", email: "other@example.test" })).toEqual({
        kind: "admitted",
      });
    });
  });

  test("outer rejection neither consumes installation budget nor prolongs a cooldown", async () => {
    await withAdmission(async ({ open, at }) => {
      const admission = await open({
        ...generous,
        ip: { fiveMinutes: 1, oneHour: 100 },
        global: { fiveMinutes: 2, oneHour: 100 },
      });
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      for (const time of [10_000, 100_000, 299_999]) {
        at(time);
        expect(await admission.admit(request)).toMatchObject({
          kind: "throttled",
          retryAt: start + 300_000,
          scopes: ["ip"],
        });
      }
      expect(await admission.admit({ ...request, source: "127.0.0.2" })).toEqual({
        kind: "admitted",
      });
      at(300_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
    });
  });

  test("retry time waits for every exhausted outer window", async () => {
    await withAdmission(async ({ open, at }) => {
      const admission = await open({
        ...generous,
        ip: { fiveMinutes: 1, oneHour: 100 },
        global: { fiveMinutes: 100, oneHour: 2 },
      });
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      at(300_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      at(300_001);
      const blocked = await admission.admit(request);
      expect(blocked.kind).toBe("throttled");
      if (blocked.kind !== "throttled") throw new Error("Both outer scopes must throttle");
      expect(new Set(blocked.scopes)).toEqual(new Set(["ip", "global"]));
      expect(blocked.retryAt).toBe(start + 3_600_000);
    });
  });

  test("outer denial waits for a longer recipient cooldown without charging rejected traffic", async () => {
    await withAdmission(async ({ open, at }) => {
      const admission = await open({
        ...generous,
        email: { fiveMinutes: 100, oneHour: 1 },
        ip: { fiveMinutes: 1, oneHour: 100 },
      });
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      at(1);
      expect(await admission.admit(request)).toEqual({
        kind: "throttled",
        retryAt: start + 3_600_000,
        scopes: ["ip"],
      });
      at(300_000);
      expect(await admission.admit({ ...request, email: "other@example.test" })).toEqual({
        kind: "admitted",
      });
      at(3_600_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
    });
  });

  test("changing recipients and clients cannot evade the shared installation ceiling", async () => {
    await withAdmission(async ({ open }) => {
      const limits = { ...generous, global: { fiveMinutes: 7, oneHour: 9 } };
      const instances = await Promise.all([open(limits), open(limits)]);
      const results = await Promise.all(
        Array.from({ length: 40 }, (_, index) =>
          instances[index % 2]!.admit({
            source: `127.0.0.${index + 1}`,
            email: `person${index}@example.test`,
          }),
        ),
      );
      expect(results.filter((result) => result.kind === "admitted")).toHaveLength(7);
      expect(results.filter((result) => result.kind === "throttled")).toHaveLength(33);
      expect(await instances[0]!.admit(request)).toMatchObject({
        kind: "throttled",
        scopes: ["global"],
      });
    });
  });

  test("closing and reopening applies new limits to retained history", async () => {
    await withAdmission(async ({ open }) => {
      const first = await open();
      for (let index = 0; index < 3; index++)
        expect(await first.admit(request)).toEqual({ kind: "admitted" });
      await first.close();
      const second = await open({ ...defaults, email: { fiveMinutes: 2, oneHour: 20 } });
      expect(await second.admit(request)).toMatchObject({ kind: "throttled", scopes: ["email"] });
      await second.close();
      const third = await open({ ...defaults, email: { fiveMinutes: 4, oneHour: 20 } });
      expect(await third.admit(request)).toEqual({ kind: "admitted" });
      expect(await third.admit(request)).toMatchObject({ kind: "throttled", scopes: ["email"] });
    });
  });

  test("lowered ceilings wait for enough retained admissions to age out", async () => {
    await withAdmission(async ({ open, at }) => {
      const first = await open();
      for (const time of [0, 10_000, 20_000, 30_000, 40_000]) {
        at(time);
        expect(await first.admit(request)).toEqual({ kind: "admitted" });
      }
      await first.close();
      const second = await open({ ...defaults, email: { fiveMinutes: 2, oneHour: 20 } });
      expect(await second.admit(request)).toMatchObject({
        kind: "throttled",
        retryAt: start + 330_000,
        scopes: ["email"],
      });
      at(329_999);
      expect(await second.admit(request)).toMatchObject({
        kind: "throttled",
        retryAt: start + 330_000,
      });
      at(330_000);
      expect(await second.admit(request)).toEqual({ kind: "admitted" });
    });
  });

  test("an email cooldown accounts for both retained windows", async () => {
    await withAdmission(async ({ open, at }) => {
      const admission = await open({
        ...generous,
        email: { fiveMinutes: 2, oneHour: 3 },
      });
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      at(300_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      at(310_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
      expect(await admission.admit(request)).toMatchObject({
        kind: "throttled",
        retryAt: start + 3_600_000,
        scopes: ["email"],
      });
      at(3_600_000);
      expect(await admission.admit(request)).toEqual({ kind: "admitted" });
    });
  });

  test("an active namespace refuses different limits and accepts matching peers", async () => {
    await withAdmission(async ({ open }) => {
      const first = await open();
      const peer = await open();
      expect(await first.admit(request)).toEqual({ kind: "admitted" });
      expect(await peer.admit(request)).toEqual({ kind: "admitted" });
      await expect(
        open({ ...defaults, global: { fiveMinutes: 31, oneHour: 100 } }),
      ).rejects.toThrow(/policy|configuration|limits/i);
      expect(await first.admit(request)).toEqual({ kind: "admitted" });
    });
  });

  test.each<AuthLimitScope>(["email", "ip"])(
    "parallel instances cannot oversubscribe the %s budget",
    async (scope) => {
      await withAdmission(async ({ open }) => {
        const limits = { ...generous, [scope]: { fiveMinutes: 3, oneHour: 10 } };
        const instances = await Promise.all([open(limits), open(limits)]);
        const results = await Promise.all(
          Array.from({ length: 12 }, (_, index) => instances[index % 2]!.admit(request)),
        );
        expect(results.filter((result) => result.kind === "admitted")).toHaveLength(3);
        expect(results.filter((result) => result.kind === "throttled")).toHaveLength(9);
      });
    },
  );

  test("independent namespaces do not share request budgets or active policy", async () => {
    await withAdmission(async ({ open: openFirst }) => {
      const first = await openFirst({ ...generous, global: { fiveMinutes: 1, oneHour: 1 } });
      expect(await first.admit(request)).toEqual({ kind: "admitted" });
      expect(await first.admit(request)).toMatchObject({ kind: "throttled" });
      await withAdmission(async ({ open: openSecond }) => {
        const second = await openSecond();
        expect(await second.admit(request)).toEqual({ kind: "admitted" });
      });
    });
  });

  test("a different OS process shares the same remaining recipient slot", async () => {
    await withAdmission(async ({ open, url, namespace }) => {
      const parent = await open();
      for (let index = 0; index < 4; index++)
        expect(await parent.admit(request)).toEqual({ kind: "admitted" });
      const child = spawn(
        "bun",
        [
          "--conditions=development",
          fileURLToPath(new URL("./test-support/auth-admission-worker.ts", import.meta.url)),
        ],
        {
          env: {
            ...process.env,
            AIRCASTLE_DATABASE_URL: url,
            AIRCASTLE_AUTH_TEST_NAMESPACE: namespace,
          },
          stdio: ["pipe", "pipe", "pipe"],
        },
      );
      let stderr = "";
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      const exited = new Promise<void>((resolve, reject) => {
        child.once("exit", () => resolve());
        child.once("error", reject);
      });
      const output = async () => {
        let timeout: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            once(child.stdout, "data").then(([chunk]) => String(chunk).trim()),
            exited.then(() => {
              throw new Error(`Admission worker exited: ${stderr}`);
            }),
            new Promise<string>((_, reject) => {
              timeout = setTimeout(() => reject(new Error(`Worker timed out: ${stderr}`)), 5_000);
            }),
          ]);
        } finally {
          clearTimeout(timeout);
        }
      };
      try {
        expect(await output()).toBe("ready");
        const childResult = output();
        child.stdin.write("admit\n");
        const [local, remoteText] = await Promise.all([parent.admit(request), childResult]);
        const remote: unknown = JSON.parse(remoteText);
        expect(remote).toHaveProperty("kind");
        const results = [local, remote];
        expect(
          results.filter(
            (result) =>
              result &&
              typeof result === "object" &&
              "kind" in result &&
              result.kind === "admitted",
          ),
        ).toHaveLength(1);
        expect(results).toContainEqual({
          kind: "throttled",
          retryAt: start + 300_000,
          scopes: ["email"],
        });
      } finally {
        child.kill("SIGKILL");
        await exited;
      }
    });
  });

  test("an abruptly killed process cannot permanently block a coordinated policy change", async () => {
    await withAdmission(async ({ open, url, namespace }) => {
      const worker = fileURLToPath(
        new URL("./test-support/auth-admission-worker.ts", import.meta.url),
      );
      const child = spawn("bun", ["--conditions=development", worker], {
        env: {
          ...process.env,
          AIRCASTLE_DATABASE_URL: url,
          AIRCASTLE_AUTH_TEST_NAMESPACE: namespace,
        },
        stdio: ["pipe", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
        stderr += chunk;
      });
      const exited = new Promise<void>((resolve, reject) => {
        child.once("exit", () => resolve());
        child.once("error", reject);
      });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const ready = await Promise.race([
          once(child.stdout, "data").then(([chunk]) => String(chunk).trim()),
          exited.then(() => {
            throw new Error(`Admission worker exited before ready: ${stderr}`);
          }),
          new Promise<string>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`Admission worker did not start: ${stderr}`)),
              10_000,
            );
          }),
        ]);
        clearTimeout(timer);
        expect(ready).toBe("ready");
        const changed = { ...defaults, global: { fiveMinutes: 31, oneHour: 100 } };
        await expect(open(changed)).rejects.toThrow(/policy|configuration|limits/i);
        child.kill("SIGKILL");
        await exited;
        await expect.poll(() => open(changed), { timeout: 5_000 }).toHaveProperty("admit");
        const restarted = await open(changed);
        expect(await restarted.admit(request)).toEqual({ kind: "admitted" });
      } finally {
        clearTimeout(timer);
        child.kill("SIGKILL");
        await exited;
      }
    });
  });
});
