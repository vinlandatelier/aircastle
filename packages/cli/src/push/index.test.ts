import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test, vi } from "vite-plus/test";
import { push, type PushOptions } from "../index.ts";

const repository = fileURLToPath(new URL("../../../../", import.meta.url));
const cliEntry = join(repository, "packages/cli/src/cli.ts");
const project = "11111111-1111-4111-8111-111111111111";
const fingerprint = "v1:cba60446f99c12f7e6acb7ddb9ec8beb0a18584a5fb498bf7a6237f033119325";
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
  scenario: (context: {
    cwd: string;
    url: string;
    state: State;
    requests: CapturedRequest[];
    command: (args?: string[]) => Promise<{ code: number; output: string }>;
    run: (options?: PushOptions) => Promise<{ code: number; output: string }>;
    lock: (revision: string, target?: { url: string; project: string }) => Promise<void>;
    afterPublish: (effect: (response: ServerResponse) => Promise<void>) => void;
    config: (source: string) => Promise<void>;
  }) => Promise<void>,
) {
  const cwd = await mkdtemp(join(tmpdir(), "aircastle-cli-test-"));
  const state: State = { revision: null, collections: [] };
  const requests: CapturedRequest[] = [];
  let publicationEffect: (response: ServerResponse) => Promise<void> = async () => {};
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
    await publicationEffect(response);
    if (response.destroyed || response.writableEnded) return;
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
  const prelude = `import { defineConfig } from ${JSON.stringify(pathToFileURL(join(repository, "packages/client/src/index.ts")).href)};\nimport { collection, text } from ${JSON.stringify(import.meta.resolve("@aircastle/schema"))};\n`;
  await config(
    prelude +
      "export default defineConfig({ url: process.env.AIRCASTLE_URL, project: process.env.AIRCASTLE_PROJECT_ID, collections: { articles: collection({ title: text() }) } });\n",
  );
  const environment = {
    AIRCASTLE_URL: url,
    AIRCASTLE_PROJECT_ID: project,
    AIRCASTLE_API_KEY: "project-secret",
  };
  const run = async (options: PushOptions = {}) => {
    const lines: string[] = [];
    for (const [name, value] of Object.entries(environment)) vi.stubEnv(name, value);
    try {
      const code = await push({ cwd, output: (line) => lines.push(line), ...options });
      return { code, output: lines.join("\n") };
    } finally {
      vi.unstubAllEnvs();
    }
  };
  const command = (args: string[] = []) =>
    new Promise<{ code: number; output: string }>((resolveCommand) => {
      execFile(
        "bun",
        ["--conditions=development", cliEntry, "push", ...args],
        {
          cwd,
          env: { ...process.env, ...environment },
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
    await scenario({
      cwd,
      url,
      state,
      requests,
      command,
      run,
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

test("a config default export that reads the URL through a getter is accepted", async () =>
  fixture(async ({ config, run, requests }) => {
    await config(
      "export default { get url() { return process.env.AIRCASTLE_URL; }, project: process.env.AIRCASTLE_PROJECT_ID, collections: { articles: collection({ title: text() }) } };",
    );
    const result = await run();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toHaveLength(1);
  }));

test("missing lockfile is recovered without publication when remote definitions match", async () =>
  fixture(async ({ cwd, state, run, requests }) => {
    state.revision = "already-published";
    state.collections = localCollections;
    const result = await run();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "already-published",
    );
  }));

test("missing lockfile cannot overwrite a differing published schema", async () =>
  fixture(async ({ cwd, state, run, requests }) => {
    state.revision = "existing";
    state.collections = [{ name: "other", description: { fields: {} } }];
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(posts(requests)).toHaveLength(0);
    await expect(readFile(join(cwd, "aircastle.lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  }));

test("an outdated baseline is not replaced by a fresh GET before publishing", async () =>
  fixture(async ({ cwd, state, lock, run, requests }) => {
    await lock("old");
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    state.revision = "newer";
    state.collections = [{ name: "other", description: { fields: {} } }];
    const result = await run();
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
  fixture(async ({ cwd, state, lock, run, requests }) => {
    await lock("old");
    state.revision = "committed-without-reply";
    state.collections = localCollections;
    const result = await run();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "committed-without-reply",
    );
  }));

for (const broken of ["{broken", '{"format":99,"target":{},"revision":"x"}', "null"]) {
  test(`malformed lockfile fails locally and is preserved: ${broken}`, async () =>
    fixture(async ({ cwd, run, requests }) => {
      await writeFile(join(cwd, "aircastle.lock"), broken);
      expect((await run()).code).not.toBe(0);
      expect(requests).toHaveLength(0);
      expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(broken);
    }));
}

test("a different target cannot reuse or rewrite the lockfile", async () =>
  fixture(async ({ cwd, run, requests, lock }) => {
    await lock("old", { url: "https://elsewhere.example", project });
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    expect((await run()).code).not.toBe(0);
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
  fixture(async ({ cwd, state, lock, run, requests }) => {
    await lock("old");
    state.revision = "reviewed-revision";
    const reviews: string[] = [];
    const result = await run({
      reconcile: true,
      interactive: true,
      confirm: async (diff) => {
        reviews.push(diff);
        return true;
      },
    });
    expect(result.code, result.output).toBe(0);
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toContain("articles");
    expect(posts(requests)).toHaveLength(1);
    expect(posts(requests)[0]?.body).toMatchObject({ baseline: "reviewed-revision" });
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "revision-published",
    );
  }));

test("declining a reconciliation preview makes no change", async () =>
  fixture(async ({ cwd, state, lock, run, requests }) => {
    await lock("old");
    state.revision = "newer";
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    expect(
      (await run({ reconcile: true, interactive: true, confirm: async () => false })).code,
    ).not.toBe(0);
    expect(posts(requests)).toHaveLength(0);
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
  }));

test("publication success followed by local write failure is reported as failure without rolling back the server", async () =>
  fixture(async ({ cwd, state, run, afterPublish }) => {
    afterPublish(async () => {
      await mkdir(join(cwd, "aircastle.lock"));
    });
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(state.revision).toBe("revision-published");
    expect(jsonLines(result.output)).toContainEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "internal_error" }),
        publication: { committed: true, revision: "revision-published" },
      }),
    );
  }));

test("invalid field declarations fail before network publication", async () =>
  fixture(async ({ config, run, requests }) => {
    await config(
      "export default defineConfig({ url: process.env.AIRCASTLE_URL, project: process.env.AIRCASTLE_PROJECT_ID, collections: { articles: collection({ title: text().min(-1) }) } });",
    );
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(requests).toHaveLength(0);
    expect(result.output).toContain("invalid_bound");
  }));

test("a publication during reconciliation review invalidates the confirmed baseline", async () =>
  fixture(async ({ cwd, url, state, lock, run }) => {
    await lock("old");
    state.revision = "reviewed-revision";
    const before = await readFile(join(cwd, "aircastle.lock"), "utf8");
    const result = await run({
      reconcile: true,
      interactive: true,
      confirm: async () => {
        await fetch(`${url}/_advance`);
        return true;
      },
    });
    expect(result.code).not.toBe(0);
    expect(state.revision).toBe("published-during-review");
    expect(await readFile(join(cwd, "aircastle.lock"), "utf8")).toBe(before);
  }));

function jsonLines(output: string): unknown[] {
  return output.split(/\r?\n/).flatMap((line) => {
    try {
      return [JSON.parse(line) as unknown];
    } catch (error) {
      if (error instanceof SyntaxError) return [];
      throw error;
    }
  });
}

test("ordinary current-baseline push publishes a changed schema without rewriting config", async () =>
  fixture(async ({ cwd, state, run, requests, lock }) => {
    state.revision = "current";
    state.collections = [
      { name: "articles", description: { fields: { title: { ...fields.title, min: 1 } } } },
    ];
    await lock("current");
    const original = await readFile(join(cwd, "aircastle.config.ts"), "utf8");
    const result = await run();
    expect(result.code, result.output).toBe(0);
    expect(posts(requests)).toHaveLength(1);
    expect(posts(requests)[0]?.body).toEqual({
      baseline: "current",
      collections: localCollections,
    });
    expect(state.collections).toEqual(localCollections);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "revision-published",
    );
    expect(await readFile(join(cwd, "aircastle.config.ts"), "utf8")).toBe(original);
  }));

test("lost publication confirmation is unknown, never retried, and healed by a matching rerun", async () =>
  fixture(async ({ cwd, state, run, requests, afterPublish }) => {
    afterPublish(async (response) => {
      response.destroy();
    });
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(state.revision).toBe("revision-published");
    expect(posts(requests)).toHaveLength(1);
    expect(jsonLines(result.output)).toContainEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "unknown_write_outcome" }),
      }),
    );
    await expect(readFile(join(cwd, "aircastle.lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    afterPublish(async () => {});
    const recovery = await run();
    expect(recovery.code, recovery.output).toBe(0);
    expect(posts(requests)).toHaveLength(1);
    expect(JSON.parse(await readFile(join(cwd, "aircastle.lock"), "utf8")).revision).toBe(
      "revision-published",
    );
  }));

test("a malformed publication success cannot confirm the write or advance the lockfile", async () =>
  fixture(async ({ cwd, state, run, requests, afterPublish }) => {
    afterPublish(async (response) => {
      response.end(JSON.stringify({ ok: true, data: { revision: "revision-published" } }));
    });
    const result = await run();
    expect(result.code).not.toBe(0);
    expect(state.revision).toBe("revision-published");
    expect(posts(requests)).toHaveLength(1);
    expect(jsonLines(result.output)).toContainEqual(
      expect.objectContaining({
        ok: false,
        error: expect.objectContaining({ code: "unknown_write_outcome" }),
      }),
    );
    await expect(readFile(join(cwd, "aircastle.lock"), "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  }));
