import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { ConfigurationError, defineConfig } from "@aircastle/client";
import { SchemaError } from "@aircastle/schema";
import {
  contractId,
  describeCollections,
  parseCollections,
  parseContentError,
  sameSchema,
  type ContentError,
  type Fetch,
  type Lockfile,
  type Publication,
  type PublishedCollection,
  type Result,
} from "@aircastle/contracts";

export interface PushOptions {
  cwd?: string;
  apiKey?: string;
  reconcile?: boolean;
  interactive?: boolean;
  confirm?: (diff: string) => Promise<boolean>;
  fetch?: Fetch;
  output?: (message: string) => void;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: string[]) {
  return (
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key))
  );
}
function revision(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
function lockfile(value: unknown): value is Lockfile {
  return (
    record(value) &&
    exact(value, ["format", "target", "revision"]) &&
    value.format === 1 &&
    revision(value.revision) &&
    record(value.target) &&
    exact(value.target, ["url", "project"]) &&
    typeof value.target.url === "string" &&
    typeof value.target.project === "string"
  );
}
async function existing(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (record(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}
async function saveLock(path: string, original: string | undefined, value: Lockfile) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    if ((await existing(path)) !== original)
      throw new Error("Lockfile changed while publication was in progress");
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}
function publication(
  value: unknown,
  expected: readonly PublishedCollection[],
): value is Publication {
  return (
    record(value) &&
    exact(value, ["revision", "contracts"]) &&
    revision(value.revision) &&
    record(value.contracts) &&
    Object.keys(value.contracts).length === expected.length &&
    expected.every(
      ({ name }) =>
        Object.hasOwn(value.contracts as object, name) &&
        record(value.contracts) &&
        typeof value.contracts[name] === "string" &&
        /^v1:[0-9a-f]{64}$/.test(value.contracts[name]),
    )
  );
}
async function confirmation(diff: string): Promise<boolean> {
  const reader = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(diff);
    return /^(y|yes)$/i.test((await reader.question("Publish this schema change? [y/N] ")).trim());
  } finally {
    reader.close();
  }
}

export async function push(options: PushOptions = {}): Promise<number> {
  const output = options.output ?? console.log;
  const fail = (code: ContentError["code"], message?: string) => {
    output(JSON.stringify({ ok: false, error: { code }, ...(message ? { message } : {}) }));
    return 1;
  };
  let committed: string | undefined;
  try {
    const cwd = options.cwd ?? process.cwd();
    const imported: unknown = (
      await import(pathToFileURL(join(cwd, "aircastle.config.ts")).href + `?push=${randomUUID()}`)
    ).default;
    if (!record(imported)) return fail("invalid_request", "Expected an Aircastle configuration");
    const config = defineConfig(imported as unknown as Parameters<typeof defineConfig>[0]);
    const collections = describeCollections(config.collections);
    const apiKey = options.apiKey ?? process.env.AIRCASTLE_API_KEY;
    if (typeof apiKey !== "string" || !apiKey.length || /\s/.test(apiKey))
      return fail("unauthorized", "AIRCASTLE_API_KEY is required");
    const path = join(cwd, "aircastle.lock");
    const original = await existing(path);
    let lock: Lockfile | undefined;
    if (original !== undefined) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(original);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        return fail("invalid_request", "Malformed aircastle.lock");
      }
      if (!lockfile(parsed)) return fail("invalid_request", "Malformed aircastle.lock");
      lock = parsed;
      if (lock.target.url !== config.url || lock.target.project !== config.project)
        return fail("invalid_request", "aircastle.lock belongs to a different target");
    }
    const request = options.fetch ?? globalThis.fetch;
    const url = `${config.url}/api/projects/${encodeURIComponent(config.project)}/schema`;
    const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
    const exchange = async (body?: unknown): Promise<Result<unknown>> => {
      const writing = body !== undefined;
      const unknownCode = writing ? "unknown_write_outcome" : "transport_error";
      let response: Response;
      let envelope: unknown;
      try {
        response = await request(url, {
          method: writing ? "POST" : "GET",
          keepalive: false,
          headers,
          ...(writing ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(30_000),
        });
        envelope = await response.json();
      } catch {
        return { ok: false, error: { code: unknownCode } };
      }
      if (!record(envelope)) return { ok: false, error: { code: unknownCode } };
      if (envelope.ok === false && !response.ok) {
        const error = parseContentError(envelope.error);
        if (error) return { ok: false, error };
      }
      if (envelope.ok === true && response.status === 200 && Object.hasOwn(envelope, "data"))
        return { ok: true, data: envelope.data };
      return { ok: false, error: { code: unknownCode } };
    };
    const remote = await exchange();
    if (!remote.ok) {
      output(JSON.stringify(remote));
      return 1;
    }
    if (
      !record(remote.data) ||
      !exact(remote.data, ["revision", "collections"]) ||
      !(remote.data.revision === null || revision(remote.data.revision))
    )
      return fail("transport_error");
    const remoteCollections = parseCollections(remote.data.collections);
    if (!remoteCollections.ok) return fail("transport_error");
    const currentRevision = remote.data.revision;
    let result: Publication;
    if (sameSchema(collections, remoteCollections.data) && currentRevision !== null) {
      const contracts = Object.fromEntries(
        await Promise.all(
          collections.map(async ({ name, description }) => [name, await contractId(description)]),
        ),
      );
      result = { revision: currentRevision, contracts };
    } else {
      let baseline = lock?.revision ?? null;
      const diff = JSON.stringify(
        { revision: currentRevision, published: remoteCollections.data, proposed: collections },
        null,
        2,
      );
      if (options.reconcile) {
        if (!(options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY)))
          return fail("schema_conflict", "Reconciliation requires interactive confirmation");
        if (!(await (options.confirm ?? confirmation)(diff)))
          return fail("schema_conflict", "Publication cancelled");
        baseline = currentRevision;
      } else if (
        (!lock && currentRevision !== null) ||
        (lock && lock.revision !== currentRevision)
      ) {
        output(diff);
        return fail("schema_conflict");
      }
      const response = await exchange({ baseline, collections });
      if (!response.ok) {
        output(JSON.stringify(response));
        return 1;
      }
      if (!publication(response.data, collections)) return fail("unknown_write_outcome");
      result = response.data;
      for (const { name, description } of collections) {
        if (result.contracts[name] !== (await contractId(description)))
          return fail("unknown_write_outcome");
      }
      committed = result.revision;
    }
    await saveLock(path, original, {
      format: 1,
      target: { url: config.url, project: config.project },
      revision: result.revision,
    });
    output(JSON.stringify({ ok: true, data: result }));
    return 0;
  } catch (error) {
    if (committed) {
      output(
        JSON.stringify({
          ok: false,
          error: { code: "internal_error" },
          publication: { committed: true, revision: committed },
          message: "Publication succeeded but aircastle.lock could not be saved",
        }),
      );
      return 1;
    }
    if (error instanceof ConfigurationError) {
      output(
        JSON.stringify({
          ok: false,
          error: { code: "invalid_request", setting: error.setting },
          message: error.message,
        }),
      );
      return 1;
    }
    if (error instanceof SchemaError) {
      output(
        JSON.stringify({ ok: false, error: { code: "invalid_request", issues: error.issues } }),
      );
      return 1;
    }
    return fail("invalid_request", "Unable to load configuration or save local publication state");
  }
}
