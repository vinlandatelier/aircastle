import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { parseModelConfig, runModel, type ModelSelection } from "./index.ts";

const selection: ModelSelection = { model: "claude-opus-5-5", effort: "high" };
const schema = {
  type: "object",
  properties: { ok: { type: "boolean" } },
  required: ["ok"],
  additionalProperties: false,
};
const config = {
  version: 1,
  roles: { reviewer: selection, implementer: selection },
};
const success = (structured: unknown, models: string[] = [selection.model]) => ({
  type: "result",
  subtype: "success",
  is_error: false,
  num_turns: 2,
  session_id: "session-1",
  result: JSON.stringify(structured),
  structured_output: structured,
  usage: { input_tokens: 3, output_tokens: 9 },
  modelUsage: Object.fromEntries(models.map((model) => [model, { outputTokens: 9 }])),
});

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true })));
});

async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "ai-models-test-"));
  directories.push(path);
  return path;
}

/**
 * Puts a `claude` on PATH that records its invocation, prints `output` and `stderr`, then exits
 * with `exitCode` or, when `exitCode` is a signal name, kills itself with that signal.
 */
async function fakeClaude(output: unknown, exitCode: number | "TERM" = 0, stderr = "") {
  const bin = await directory();
  await writeFile(
    join(bin, "output"),
    typeof output === "string" ? output : JSON.stringify(output),
  );
  await writeFile(join(bin, "stderr"), stderr);
  await writeFile(
    join(bin, "claude"),
    [
      "#!/bin/sh",
      `cat > "${bin}/stdin"`,
      `printf '%s\\n' "$@" > "${bin}/args"`,
      `env > "${bin}/env"`,
      `pwd -P > "${bin}/cwd"`,
      `(cd "$HOME" && pwd -P) > "${bin}/home"`,
      `ls -A > "${bin}/files"`,
      `cat "${bin}/output"`,
      `cat "${bin}/stderr" >&2`,
      typeof exitCode === "number" ? `exit ${exitCode}` : `kill -${exitCode} $$`,
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  vi.stubEnv("PATH", `${bin}:${process.env.PATH ?? ""}`);
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-secret");
  vi.stubEnv("AI_MODEL_RECEIPTS_DIR", "");
  const read = (name: string) => readFile(join(bin, name), "utf8");
  return {
    bin,
    read,
    ran: () =>
      stat(join(bin, "args")).then(
        () => true,
        () => false,
      ),
  };
}

test("config requires exactly the reviewer and implementer roles with a model and explicit effort", () => {
  expect(parseModelConfig(config)).toEqual(config);
  expect(() => parseModelConfig({ ...config, roles: { reviewer: selection } })).toThrow();
  expect(() =>
    parseModelConfig({ ...config, roles: { ...config.roles, secondReviewer: selection } }),
  ).toThrow();
  expect(() =>
    parseModelConfig({
      ...config,
      roles: { ...config.roles, implementer: { ...selection, endpoint: "https://evil.invalid" } },
    }),
  ).toThrow();
  expect(() => parseModelConfig({ ...config, url: "https://evil.invalid" })).toThrow();
  expect(() =>
    parseModelConfig({
      ...config,
      roles: { ...config.roles, reviewer: { ...selection, effort: "super" } },
    }),
  ).toThrow();
});

test("a missing subscription token reports setup_required before running the CLI", async () => {
  const claude = await fakeClaude(success({ ok: true }));
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "");
  await expect(runModel(selection, "review", schema)).rejects.toThrow("setup_required");
  expect(await claude.ran()).toBe(false);
});

test("the CLI gets the prompt on stdin, the schema and settings as flags, and no tools", async () => {
  const claude = await fakeClaude(success({ ok: true }));
  await expect(runModel(selection, "review untrusted text", schema)).resolves.toEqual({ ok: true });
  expect((await claude.read("args")).split("\n").slice(0, -1)).toEqual([
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(schema),
    "--model",
    "claude-opus-5-5",
    "--effort",
    "high",
    "--tools",
    "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--max-turns",
    "4",
  ]);
  expect(await claude.read("stdin")).toBe("review untrusted text");
});

test("the CLI runs in a fresh empty directory with its own config and only the subscription credential", async () => {
  const claude = await fakeClaude(success({ ok: true }));
  vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "gateway-secret");
  vi.stubEnv("ANTHROPIC_BASE_URL", "https://evil.invalid");
  vi.stubEnv("GITHUB_TOKEN", "github-secret");
  await runModel(selection, "review", schema);
  const cwd = (await claude.read("cwd")).trim();
  const env = Object.fromEntries(
    (await claude.read("env"))
      .trim()
      .split("\n")
      .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)]),
  );
  expect(await claude.read("files")).toBe("");
  expect((await claude.read("home")).trim()).toBe(cwd);
  expect(env.CLAUDE_CONFIG_DIR).toBe(join(env.HOME ?? "", ".claude"));
  expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe("oauth-secret");
  expect(Object.keys(env).filter((key) => key.startsWith("ANTHROPIC_"))).toEqual([]);
  expect(env.GITHUB_TOKEN).toBeUndefined();
  await expect(stat(cwd)).rejects.toThrow();
});

test.each<[string, unknown, number, string]>([
  [
    "a failed run",
    { ...success({ ok: true }), is_error: true, subtype: "error_during_execution" },
    1,
    "provider_failed",
  ],
  ["a non-zero exit", success({ ok: true }), 1, "provider_failed"],
  [
    "a run out of turns",
    { ...success({ ok: true }), is_error: true, subtype: "error_max_turns" },
    1,
    "provider_incomplete",
  ],
  [
    "a run without structured output",
    { ...success({ ok: true }), structured_output: undefined },
    0,
    "provider_no_structured_output",
  ],
  ["output that breaks the schema", success({ ok: "true" }), 0, "provider_schema_mismatch"],
  ["output with an extra property", success({ ok: true, extra: 1 }), 0, "provider_schema_mismatch"],
  [
    "a different model than configured",
    success({ ok: true }, ["claude-haiku-5-5"]),
    0,
    "provider_model_mismatch",
  ],
  ["text that is not JSON", "Not logged in oauth-secret", 1, "provider_invalid_json"],
  ["JSON that is not a result", { type: "system" }, 0, "provider_invalid_response"],
])("%s fails with its own error code", async (_, output, exitCode, error) => {
  await fakeClaude(output, exitCode, "stderr oauth-secret");
  const failure = runModel(selection, "review", schema);
  await expect(failure).rejects.toThrow(new RegExp(`^${error}(: |$)`));
  await expect(failure).rejects.not.toThrow("oauth-secret");
});

const unauthenticated = {
  type: "result",
  subtype: "success",
  is_error: true,
  terminal_reason: "api_error",
  result:
    'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"Invalid bearer token oauth-secret"}}',
  session_id: "session-1",
};

test("an authentication failure names the CLI's reason and stderr tail without the token", async () => {
  await fakeClaude(unauthenticated, 1, `${"x".repeat(5_000)}\nlast line\twith oauth-secret\n`);
  const failure = runModel(selection, "review", schema);
  await expect(failure).rejects.toThrow(/^provider_failed: /);
  await expect(failure).rejects.toThrow("exit=1");
  await expect(failure).rejects.toThrow("Failed to authenticate. API Error: 401");
  await expect(failure).rejects.toThrow('terminal_reason="api_error"');
  await expect(failure).rejects.toThrow("last line with [redacted]");
  await expect(failure).rejects.not.toThrow("oauth-secret");
  await expect(failure).rejects.not.toThrow("x".repeat(400));
});

test("a failed run still writes a receipt with the failure and no token", async () => {
  await fakeClaude(unauthenticated, 1, "rate limited oauth-secret");
  const receipts = await directory();
  vi.stubEnv("AI_MODEL_RECEIPTS_DIR", receipts);
  const message = await runModel(selection, "review", schema).then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : ""),
  );
  const [name] = await readdir(receipts);
  const receipt = await readFile(join(receipts, name ?? ""), "utf8");
  expect(JSON.parse(receipt)).toMatchObject({
    request: { prompt: "review" },
    response: { is_error: true, terminal_reason: "api_error" },
    stderr: "rate limited [redacted]",
    failure: message,
  });
  expect(message).toMatch(/^provider_failed: /);
  expect(receipt).not.toContain("oauth-secret");
});

test("a token cut by the stderr tail boundaries leaves no fragment in the error", async () => {
  const token = `sk-ant-oat01-${"Q7f".repeat(16)}`;
  await fakeClaude(unauthenticated, 1, `${token}${"\n".repeat(4_076)}done`);
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", token);
  const message = await runModel(selection, "review", schema).then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : ""),
  );
  expect(message).toContain('stderr="[redacted] done"');
  expect(message).not.toContain("Q7f");

  await fakeClaude(unauthenticated, 1, `${"a ".repeat(200)}${token}${" b".repeat(146)}`);
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", token);
  const tail = await runModel(selection, "review", schema).then(
    () => "",
    (error: unknown) => (error instanceof Error ? error.message : ""),
  );
  expect(tail).toContain(`stderr=${JSON.stringify(" b".repeat(146).trim())}`);
});

test("a receipt that cannot be written still rejects with the provider error", async () => {
  await fakeClaude(unauthenticated, 1, "rate limited");
  const blocker = join(await directory(), "file");
  await writeFile(blocker, "");
  vi.stubEnv("AI_MODEL_RECEIPTS_DIR", join(blocker, "receipts"));
  const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
  await expect(runModel(selection, "review", schema)).rejects.toThrow(/^provider_failed: /);
  expect(logged).toHaveBeenCalledWith(expect.stringContaining("provider_receipt_unavailable"));
});

test("a run the timeout killed reports provider_timeout", async () => {
  await fakeClaude("", "TERM");
  await expect(runModel(selection, "review", schema)).rejects.toThrow(
    /^provider_timeout: signal=SIGTERM/,
  );
});

test("an auxiliary model next to the configured one is accepted", async () => {
  await fakeClaude(success({ ok: true }, ["claude-haiku-5-5", selection.model]));
  await expect(runModel(selection, "review", schema)).resolves.toEqual({ ok: true });
});

test("a missing CLI is unavailable", async () => {
  vi.stubEnv("PATH", await directory());
  vi.stubEnv("CLAUDE_CODE_OAUTH_TOKEN", "oauth-secret");
  await expect(runModel(selection, "review", schema)).rejects.toThrow("provider_unavailable");
});

test("rejects unsupported schemas and oversized prompts before running the CLI", async () => {
  const claude = await fakeClaude(success({ ok: true }));
  await expect(runModel(selection, "review", { ...schema, magicKeyword: true })).rejects.toThrow();
  await expect(runModel(selection, "x".repeat(200_001), schema)).rejects.toThrow();
  expect(await claude.ran()).toBe(false);
});

test("a receipt records the request and response with the token redacted", async () => {
  await fakeClaude({ ...success({ ok: true }), result: "echo oauth-secret" });
  const receipts = await directory();
  vi.stubEnv("AI_MODEL_RECEIPTS_DIR", receipts);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  await runModel(selection, "review", schema);
  const [name] = await readdir(receipts);
  const receipt = await readFile(join(receipts, name ?? ""), "utf8");
  expect(JSON.parse(receipt)).toMatchObject({
    request: { prompt: "review" },
    response: { result: "echo [redacted]", structured_output: { ok: true } },
    execution: { selection, models: [selection.model], effort: "sent", turns: 2 },
  });
  expect(receipt).not.toContain("oauth-secret");
});
