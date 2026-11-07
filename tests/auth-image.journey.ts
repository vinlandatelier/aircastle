import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { bindLoopbackPort, repository } from "./support/content-processes.ts";

const run = promisify(execFile);
const suffix = randomUUID().slice(0, 8);
const project = `aircastle-image-${suffix}`;
const image = `aircastle:image-journey-${suffix}`;
let port = 0;
let origin = "";

function compose(args: string[], environment: Record<string, string> = {}) {
  const inherited = ["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG"].flatMap(
    (name) => (process.env[name] === undefined ? [] : [[name, process.env[name]]]),
  );
  return run(
    "docker",
    [
      "compose",
      "--env-file",
      "/dev/null",
      "-p",
      project,
      "-f",
      "compose.development.yaml",
      ...args,
    ],
    {
      cwd: repository,
      env: {
        ...Object.fromEntries(inherited),
        AIRCASTLE_IMAGE: image,
        AIRCASTLE_WEB_PORT: String(port),
        AIRCASTLE_DB_PORT: "0",
        AIRCASTLE_URL: origin,
        ...environment,
      },
      timeout: 600_000,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
}

function post(path: string, body: unknown, cookie?: string) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function inbox() {
  return (await fetch(`${origin}/api/development-inbox/messages`)).json();
}

async function session(cookie: string) {
  return fetch(`${origin}/api/auth/session`, { headers: { cookie } });
}

describe("local auth in the built Docker image", () => {
  let cookie = "";

  beforeAll(async () => {
    port = await bindLoopbackPort(0);
    origin = `http://127.0.0.1:${port}`;
    await compose(["up", "--build", "--detach", "--wait"]);
  });

  afterAll(async () => {
    try {
      await compose(["down", "--volumes", "--remove-orphans"]);
    } finally {
      await run("docker", ["image", "rm", "--force", image]);
    }
  });

  test("[auth:R1] [auth:R10] publishes the app on loopback only", async () => {
    const { stdout } = await compose(["port", "aircastle", "8080"]);
    expect(stdout.trim()).toBe(`127.0.0.1:${port}`);
  });

  test.each([
    "/setup",
    "/sign-in",
    "/development-inbox",
    "/dash",
    "/dash/workspaces",
    "/dash/workspaces/new",
    "/dash/workspaces/11111111-1111-4111-8111-111111111111/projects",
  ])("[auth:R10] serves the browser app for a direct visit to %s", async (path) => {
    const response = await fetch(`${origin}${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toMatch(/<script type="module"[^>]* src="\/assets\//u);
  });

  test("[auth:R3] [auth:R4] [auth:R8] sets up the first super user through the development inbox", async () => {
    expect(await (await fetch(`${origin}/api/auth/state`)).json()).toEqual({
      kind: "ok",
      value: { kind: "setup-required" },
    });
    const requested = await post("/api/auth/setup", {
      name: "Image Dev",
      email: "dev@example.test",
    });
    expect(requested.status).toBe(200);
    const messages = await inbox();
    const token = /token=([\w-]+)/u.exec(JSON.stringify(messages))?.[1];
    expect(token).toBeTruthy();
    const confirmed = await post("/api/auth/confirm", { purpose: "setup", token });
    expect(confirmed.status).toBe(200);
    const setCookie = confirmed.headers.get("set-cookie") ?? "";
    expect(setCookie.startsWith(`aircastle_session_${port}=`)).toBe(true);
    expect(setCookie).toMatch(/;\s*HttpOnly(?:;|$)/u);
    cookie = setCookie.split(";")[0] ?? "";
    const signedIn = await session(cookie);
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toMatchObject({ value: { user: { email: "dev@example.test" } } });
  });

  test("[auth:R7] [auth:R8] [auth:R10] keeps the session and clears the inbox across stop and start", async () => {
    await compose(["stop", "aircastle"]);
    await compose(["start", "aircastle"]);
    await compose(["up", "--detach", "--wait", "aircastle"]);
    expect((await session(cookie)).status).toBe(200);
    expect(await inbox()).toEqual({ kind: "ok", value: [] });
  });

  test("[auth:R7] [auth:R8] [auth:R10] keeps the session and clears the inbox across container recreation", async () => {
    await compose(["up", "--detach", "--wait", "--force-recreate", "aircastle"]);
    expect((await session(cookie)).status).toBe(200);
    expect(await inbox()).toEqual({ kind: "ok", value: [] });
    expect(
      await (await fetch(`${origin}/api/auth/state`, { headers: { cookie } })).json(),
    ).toMatchObject({ value: { kind: "authenticated" } });
  });

  test("[auth:R9] [auth:R10] keeps an exhausted email budget across restart and recreation", async () => {
    const email = `quota-${suffix}@example.test`;
    for (let attempt = 0; attempt < 5; attempt++)
      expect((await post("/api/auth/sign-in", { email })).status).toBe(200);
    const blocked = await post("/api/auth/sign-in", { email });
    expect(blocked.status).toBe(429);
    const outcome = await blocked.json();
    expect(outcome).toMatchObject({ kind: "throttled", retryAt: expect.any(Number) });
    for (const restart of [
      () => compose(["restart", "aircastle"]),
      () => compose(["up", "--detach", "--wait", "--force-recreate", "aircastle"]),
    ]) {
      await restart();
      await compose(["up", "--detach", "--wait", "aircastle"]);
      const repeated = await post("/api/auth/sign-in", { email });
      expect(repeated.status).toBe(429);
      expect(await repeated.json()).toEqual(outcome);
    }
  });

  test.each(["production", ""])(
    "[auth:R1] [auth:R10] the image with AIRCASTLE_ENV=%j keeps local auth closed",
    async (mode) => {
      await compose(["up", "--detach", "--wait", "--force-recreate", "aircastle"], {
        AIRCASTLE_ENV: mode,
      });
      expect((await fetch(`${origin}/api/development-inbox/messages`)).status).toBe(404);
      expect(await (await fetch(`${origin}/api/auth/state`)).json()).toEqual({
        kind: "ok",
        value: { kind: "disabled" },
      });
      expect(
        (await post("/api/auth/setup", { name: "Late", email: "late@example.test" })).status,
      ).toBe(404);
    },
  );
});
