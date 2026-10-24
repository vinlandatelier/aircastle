import { createHash } from "node:crypto";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { readFile } from "node:fs/promises";
import { parseModelConfig } from "../ai-models/index.ts";
import { digest, prepareModelUpdate, type Prepared, type Verification } from "./index.ts";
import { reviews } from "./fixtures.ts";
import { publishModelUpdate } from "./publisher.ts";

const config = parseModelConfig(
  JSON.parse(await readFile(new URL("../../.github/ai-models.json", import.meta.url), "utf8")),
);
const main = "a".repeat(40);
const selection = { provider: "openai", model: "gpt-6-sol", effort: "high" } as const;
const input = {
  repository: "owner/repo",
  botLogin: "model-app[bot]",
  token: "publisher-secret",
  runUrl: "https://github.com/owner/repo/actions/runs/123",
};
afterEach(() => vi.unstubAllGlobals());
async function proposal(): Promise<{ prepared: Prepared; verification: Verification }> {
  const prepared = await prepareModelUpdate(config, main, {
    discover: async () => ({
      candidates: [{ selection, inputUsdPerMillion: 2, outputUsdPerMillion: 10 }],
      prices: [selection, ...Object.values(config.roles)].map((selection) => ({
        selection,
        inputUsdPerMillion: 2,
        outputUsdPerMillion: 10,
      })),
      sources: [
        {
          url: "https://developers.openai.com/api/docs/models",
          body: "release",
          sha256: createHash("sha256").update("release").digest("hex"),
        },
      ],
    }),
    run: async (selected, prompt) => {
      if (prompt.startsWith("Compatibility")) return { ok: true };
      const fixture = reviews.find((item) => item.id === JSON.parse(prompt).id);
      if (!fixture) return { source: "input => false" };
      const files: Record<string, string> = fixture.files;
      return {
        findings: fixture.defects
          .filter((defect) => defect.mandatory || selected.model === selection.model)
          .map((defect) => ({
            path: defect.path,
            line: defect.line,
            quote: files[defect.path]!.split("\n")[defect.line - 1],
            consequence:
              "This exposes private project data or executes server configuration in browser code.",
          })),
      };
    },
  });
  const verification = {
    preparedHash: digest(prepared),
    results: prepared.runs
      .filter((run) => run.role.endsWith("Implementer"))
      .map((run) => ({ id: run.id, outputs: null })),
  };
  return { prepared, verification };
}
function github(
  options: {
    human?: boolean;
    stale?: boolean;
    branch?: boolean;
    bot?: boolean;
    edited?: boolean;
  } = {},
) {
  const writes: { path: string; body: Record<string, unknown> }[] = [];
  const previous = structuredClone(config);
  previous.roles.codexReviewer.model = "gpt-previous";
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    expect(url.startsWith("https://api.github.com/repos/owner/repo")).toBe(true);
    const path = url.replace("https://api.github.com/repos/owner/repo", "");
    if (init.method !== "GET") {
      if (typeof init.body !== "string") throw new Error("missing request");
      const body = JSON.parse(init.body);
      writes.push({ path, body });
      if (path === "/git/blobs") return Response.json({ sha: digest(body) });
      if (path === "/git/trees") return Response.json({ sha: "tree" });
      if (path === "/git/commits") return Response.json({ sha: "commit" });
      if (path === "/pulls")
        return Response.json({ html_url: "https://github.com/owner/repo/pull/1" });
      return Response.json({});
    }
    if (path === "/git/ref/heads/main")
      return Response.json({ object: { sha: options.stale ? "b".repeat(40) : main } });
    if (path.startsWith("/contents/.github/ai-models.json"))
      return Response.json({
        content: Buffer.from(
          JSON.stringify(path.includes("ref=existing") ? previous : config),
        ).toString("base64"),
        encoding: "base64",
      });
    if (path.startsWith("/pulls?"))
      return Response.json(
        options.human
          ? [
              {
                user: { login: "human", type: "User" },
                state: "open",
                head: { sha: "existing" },
                html_url: "https://github.com/owner/repo/pull/1",
              },
            ]
          : options.bot
            ? [
                {
                  user: { login: input.botLogin, type: "Bot" },
                  state: "open",
                  head: { sha: "existing" },
                  html_url: "https://github.com/owner/repo/pull/1",
                },
              ]
            : [],
      );
    if (path.startsWith("/git/ref/heads/automation"))
      return options.branch
        ? Response.json({ object: { sha: "existing" } })
        : new Response("{}", { status: 404 });
    if (path === "/commits/existing")
      return Response.json({
        author: { login: options.bot ? input.botLogin : "human" },
        committer: { login: options.bot ? input.botLogin : "human" },
      });
    if (path.startsWith("/contents/scripts/ai-model-updates/proposal.json"))
      return Response.json({
        encoding: "base64",
        content: Buffer.from(
          JSON.stringify({
            version: 1,
            baseSha: main,
            configHash: options.edited ? "changed" : digest(previous),
          }),
        ).toString("base64"),
      });
    if (path.startsWith("/compare/"))
      return Response.json({
        total_commits: 1,
        files: [
          { filename: ".github/ai-models.json" },
          { filename: "scripts/ai-model-updates/proposal.json" },
        ],
      });
    if (path.startsWith("/git/commits/"))
      return Response.json({ sha: main, tree: { sha: "base-tree" } });
    throw new Error(`unexpected request ${path}`);
  });
  return writes;
}

test("publisher rejects a stale default revision and human-owned proposal without writing", async () => {
  const { prepared, verification } = await proposal();
  let writes = github({ stale: true });
  await expect(publishModelUpdate(prepared, verification, input)).rejects.toThrow(
    "stale_control_revision",
  );
  expect(writes).toHaveLength(0);
  writes = github({ human: true });
  await expect(publishModelUpdate(prepared, verification, input)).rejects.toThrow(
    "human_owned_proposal",
  );
  expect(writes).toHaveLength(0);
});

test("publisher creates only a config/evidence commit on one fixed branch and never merges", async () => {
  const { prepared, verification } = await proposal();
  const writes = github();
  const result = await publishModelUpdate(prepared, verification, input);
  expect(result).toEqual({
    kind: "published",
    url: "https://github.com/owner/repo/pull/1",
    head: "commit",
  });
  const tree = writes.find((write) => write.path === "/git/trees")!.body;
  expect((tree.tree as { path: string }[]).map((entry) => entry.path)).toEqual([
    ".github/ai-models.json",
    "scripts/ai-model-updates/proposal.json",
  ]);
  expect(writes.find((write) => write.path === "/git/refs")?.body.ref).toBe(
    "refs/heads/automation/ai-model-updates",
  );
  expect(writes.some((write) => write.path.includes("merge"))).toBe(false);
});

test("publisher preserves human branch commits and content edits without writes", async () => {
  const { prepared, verification } = await proposal();
  let writes = github({ branch: true });
  await expect(publishModelUpdate(prepared, verification, input)).rejects.toThrow(
    "human_edited_proposal",
  );
  expect(writes).toHaveLength(0);
  writes = github({ branch: true, bot: true, edited: true });
  await expect(publishModelUpdate(prepared, verification, input)).rejects.toThrow(
    "human_edited_proposal",
  );
  expect(writes).toHaveLength(0);
});

test("publisher advances a verified bot-owned proposal with a non-forced ref update and reuses its PR", async () => {
  const { prepared, verification } = await proposal();
  const writes = github({ branch: true, bot: true });
  await expect(publishModelUpdate(prepared, verification, input)).resolves.toEqual({
    kind: "published",
    url: "https://github.com/owner/repo/pull/1",
    head: "commit",
  });
  expect(
    writes.find((write) => write.path === "/git/refs/heads/automation/ai-model-updates")?.body,
  ).toEqual({ sha: "commit", force: false });
  expect(writes.some((write) => write.path === "/pulls")).toBe(false);
});
