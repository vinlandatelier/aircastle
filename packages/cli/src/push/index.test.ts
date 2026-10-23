import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const cliEntry = join(repository, "packages/cli/src/cli.ts");
const project = "11111111-1111-4111-8111-111111111111";
const fingerprint = `v1:${"a".repeat(64)}`;
const fields = { title: { type: "text", required: true, nullable: false, unique: false } };
const localCollections = [{ name: "articles", description: { fields } }];

type State = { revision: string | null; collections: unknown[] };
type CapturedRequest = {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
};

async function fixture(
  run: (context: {
    cwd: string;
    url: string;
    state: State;
    requests: CapturedRequest[];
    command: (args?: string[], custom?: string) => Promise<{ code: number; output: string }>;
    lock: (revision: string, target?: { url: string; project: string }) => Promise<void>;
    afterPublish: (effect: () => Promise<void>) => void;
    config: (source: string) => Promise<void>;
  }) => Promise<void>,
) {
  const cwd = await mkdtemp(join(tmpdir(), "aircastle-cli-test-"));
  const state: State = { revision: null, collections: [] };
  const requests: CapturedRequest[] = [];
  let publicationEffect = async () => {};
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += String(chunk);
    const input = body ? JSON.parse(body) : undefined;
    requests.push({
      method: request.method ?? "",
      path: request.url ?? "",
      authorization: request.headers.authorization,
      body: input,
    });
    response.setHeader("content-type", "application/json");
    if (request.url === "/_advance") {
      state.revision = "published-during-review";
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (request.method === "GET") {
      response.end(JSON.stringify({ ok: true, data: state }));
      return;
    }
    if (
      input.baseline !== state.revision &&
      JSON.stringify(input.collections) !== JSON.stringify(state.collections)
    ) {
      response.statusCode = 409;
      response.end(JSON.stringify({ ok: false, error: { code: "schema_conflict" } }));
      return;
    }
    state.revision = "revision-published";
    state.collections = input.collections;
    await publicationEffect();
    response.end(
      JSON.stringify({
        ok: true,
        data: { revision: state.revision, contracts: { articles: fingerprint } },
      }),
    );
  });
  await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP test server did not bind a TCP port");
  const url = `http://127.0.0.1:${address.port}`;
  const config = async (source: string) => writeFile(join(cwd, "aircastle.config.ts"), source);
  const prelude = `import { defineConfig } from ${JSON.stringify(pathToFileURL(join(repository, "packages/client/src/index.ts")).href)};\nimport { collection, text } from ${JSON.stringify(pathToFileURL(join(repository, "packages/schema/src/index.ts")).href)};\n`;
  await config(
    prelude +
      "export default defineConfig({ url: process.env.AIRCASTLE_URL, project: process.env.AIRCASTLE_PROJECT_ID, collections: { articles: collection({ title: text() }) } });\n",
  );
  const command = (args: string[] = [], custom?: string) =>
    new Promise<{ code: number; output: string }>((resolveCommand) => {
      execFile(
        "bun",
        custom ? ["-e", custom] : [cliEntry, "push", ...args],
        {
          cwd,
          env: {
            ...process.env,
            AIRCASTLE_URL: url,
            AIRCASTLE_PROJECT_ID: project,
            AIRCASTLE_API_KEY: "project-secret",
          },
          timeout: 15_000,
        },
        (error, stdout, stderr) =>
          resolveCommand({
            code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
            output: stdout + stderr,
          }),
      );
    });
  try {
    await run({
      cwd,
      url,
      state,
      requests,
      command,
      lock: async (revision, target = { url, project }) =>
        writeFile(join(cwd, "aircastle.lock"), JSON.stringify({ format: 1, target, revision })),
      afterPublish: (effect) => {
        publicationEffect = effect;
      },
      config: async (source) => config(prelude + source),
    });
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolveClose, reject) =>
      server.close((error) => (error ? reject(error) : resolveClose())),
    );
    await rm(cwd, { recursive: true, force: true });
  }
}

function posts(requests: CapturedRequest[]) {
  return requests.filter((request) => request.method === "POST");
}

test("first push publishes an unpublished project's definitions and creates a secret-free lockfile", async () =>
  fixture(async ({ cwd, url, command, requests }) => {
    const result = await command();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toEqual([
      {
        method: "POST",
        path: `/api/projects/${project}/schema`,
        authorization: "Bearer project-secret",
        body: { baseline: null, collections: localCollections },
      },
    ]);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8"))).toEqual({
      format: 1,
      target: { url, project },
      revision: "revision-published",
    });
    expect(result.output).toContain(fingerprint);
    expect(result.output).not.toContain("project-secret");
  }));

test("missing lockfile is recovered without publication when remote definitions match", async () =>
  fixture(async ({ cwd, state, command, requests }) => {
    state.revision = "already-published";
    state.collections = localCollections;
    const result = await command();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "already-published",
    );
  }));

test("missing lockfile cannot overwrite a differing published schema", async () =>
  fixture(async ({ cwd, state, command, requests }) => {
    state.revision = "existing";
    state.collections = [{ name: "other", description: { fields: {} } }];
    const result = await command();
    expect(result.code).not.toBe(0);
    expect(posts(requests)).toHaveLength(0);
    await expect(readFile(join(cwd, "aircastle.lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  }));

test("an outdated baseline is not replaced by a fresh GET before publishing", async () =>
  fixture(async ({ cwd, state, lock, command, requests }) => {
    await lock("old");
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    state.revision = "newer";
    state.collections = [{ name: "other", description: { fields: {} } }];
    const result = await command();
    expect(result.code).not.toBe(0);
    expect(
      posts(requests).every(
        (request) => (request.body as { baseline: unknown }).baseline === "old",
      ),
    ).toBe(true);
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
    expect(state.revision).toBe("newer");
  }));

test("matching remote state heals a stale lock after a lost successful reply", async () =>
  fixture(async ({ cwd, state, lock, command, requests }) => {
    await lock("old");
    state.revision = "committed-without-reply";
    state.collections = localCollections;
    const result = await command();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "committed-without-reply",
    );
  }));

for (const broken of ["{broken", '{"format":99,"target":{},"revision":"x"}', "null"]) {
  test(`malformed lockfile fails locally and is preserved: ${broken}`, async () =>
    fixture(async ({ cwd, command, requests }) => {
      await writeFile(join(cwd, "aircastle.lock"), broken);
      expect((await command()).code).not.toBe(0);
      expect(requests).toHaveLength(0);
      expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(broken);
    }));
}

test("a different target cannot reuse or rewrite the lockfile", async () =>
  fixture(async ({ cwd, command, requests, lock }) => {
    await lock("old", { url: "https://elsewhere.example", project });
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    expect((await command()).code).not.toBe(0);
    expect(requests).toHaveLength(0);
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
  }));

test("noninteractive reconciliation fails without publishing or advancing the lock", async () =>
  fixture(async ({ cwd, command, requests, lock, state }) => {
    await lock("old");
    state.revision = "newer";
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    expect((await command(["--reconcile"])).code).not.toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
  }));

test("explicit reconciliation previews and confirms the exact baseline", async () =>
  fixture(async ({ cwd, state, lock, command, requests }) => {
    await lock("old");
    state.revision = "reviewed-revision";
    const entry = pathToFileURL(resolve(repository, "packages/cli/src/index.ts")).href;
    const script = `import { push } from ${JSON.stringify(entry)}; process.exitCode = await push({ cwd: ${JSON.stringify(cwd)}, reconcile: true, interactive: true, confirm: async diff => { console.log('REVIEW=' + diff); return true; } });`;
    const result = await command([], script);
    expect(result.code, result.output).toBe(0);
    expect(result.output).toContain("REVIEW=");
    expect(result.output).toContain("articles");
    expect(posts(requests)).toHaveLength(1);
    expect((posts(requests)[0]?.body as { baseline: string }).baseline).toBe("reviewed-revision");
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "revision-published",
    );
  }));

test("declining a reconciliation preview makes no change", async () =>
  fixture(async ({ cwd, state, lock, command, requests }) => {
    await lock("old");
    state.revision = "newer";
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    const entry = pathToFileURL(resolve(repository, "packages/cli/src/index.ts")).href;
    const script = `import { push } from ${JSON.stringify(entry)}; process.exitCode = await push({ cwd: ${JSON.stringify(cwd)}, reconcile: true, interactive: true, confirm: async () => false });`;
    expect((await command([], script)).code).not.toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
  }));

test("publication success followed by local write failure is reported as failure without rolling back the server", async () =>
  fixture(async ({ cwd, state, command, afterPublish }) => {
    afterPublish(async () => {
      await mkdir(join(cwd, "aircastle.lock"));
    });
    const result = await command();
    expect(result.code).not.toBe(0);
    expect(state.revision).toBe("revision-published");
    expect(result.output.trim().length).toBeGreaterThan(0);
  }));

test("invalid field declarations fail before network publication", async () =>
  fixture(async ({ config, command, requests }) => {
    await config(
      "export default defineConfig({ url: process.env.AIRCASTLE_URL, project: process.env.AIRCASTLE_PROJECT_ID, collections: { articles: collection({ title: text().min(-1) }) } });",
    );
    const result = await command();
    expect(result.code).not.toBe(0);
    expect(requests).toHaveLength(0);
    expect(result.output).toContain("invalid_bound");
  }));

test("a publication during reconciliation review invalidates the confirmed baseline", async () =>
  fixture(async ({ cwd, url, state, lock, command }) => {
    await lock("old");
    state.revision = "reviewed-revision";
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    const entry = pathToFileURL(resolve(repository, "packages/cli/src/index.ts")).href;
    const script = `import { push } from ${JSON.stringify(entry)}; process.exitCode = await push({ cwd: ${JSON.stringify(cwd)}, reconcile: true, interactive: true, confirm: async () => { await fetch(${JSON.stringify(url + "/_advance")}); return true; } });`;
    expect((await command([], script)).code).not.toBe(0);
    expect(state.revision).toBe("published-during-review");
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
  }));
