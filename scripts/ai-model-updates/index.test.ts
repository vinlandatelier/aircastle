import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { parseModelConfig, type ModelSelection } from "../ai-models/index.ts";
import {
  digest,
  prepareModelUpdate,
  proposeModelUpdate,
  type Discovery,
  type Prepared,
  type Verification,
} from "./index.ts";
import { coding, reviews } from "./fixtures.ts";

afterEach(() => vi.unstubAllEnvs());

const config = parseModelConfig(
  JSON.parse(
    await readFile(new URL("../../.github/ai-models.json", import.meta.url), "utf8").catch(
      () => "null",
    ),
  ),
);
const candidate: ModelSelection = { provider: "openai", model: "gpt-6-sol", effort: "high" };
const discovery: Discovery = {
  candidates: [{ selection: candidate, inputUsdPerMillion: 3, outputUsdPerMillion: 15 }],
  prices: [candidate, ...Object.values(config.roles)].map((selection) => ({
    selection,
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  })),
  sources: [
    {
      url: "https://developers.openai.com/api/docs/models",
      body: "guidance",
      sha256: createHash("sha256").update("guidance").digest("hex"),
    },
  ],
};
const goodReview = (fixture: string, includeOptional: boolean) => {
  const item = reviews.find((entry) => entry.id === fixture)!;
  return {
    findings: item.defects
      .filter((defect) => defect.mandatory || includeOptional)
      .map((defect) => ({
        path: defect.path,
        line: defect.line,
        quote: (item.files as Record<string, string>)[defect.path]!.split("\n")[defect.line - 1],
        consequence:
          "This exposes private project data or executes server configuration in the browser.",
      })),
  };
};
async function prepare() {
  const run = vi.fn(async (selection: ModelSelection, prompt: string) => {
    if (prompt.startsWith("Compatibility")) return { ok: true };
    const fixture = JSON.parse(prompt).id as string;
    return reviews.some((entry) => entry.id === fixture)
      ? goodReview(fixture, selection.model === candidate.model)
      : { source: "input => false" };
  });
  return {
    prepared: await prepareModelUpdate(config, "a".repeat(40), {
      discover: async () => discovery,
      run,
    }),
    run,
  };
}
function verification(prepared: Prepared): Verification {
  return {
    preparedHash: digest(prepared),
    results: prepared.runs
      .filter((run) => run.role.endsWith("Implementer"))
      .map((run) => ({
        id: run.id,
        outputs: coding
          .find((item) => item.id === run.fixture)!
          .checks.map((check) => check.expected),
      })),
  };
}

test("discovery failure and excessive cost do not produce a modified config or call models", async () => {
  const before = digest(config);
  const run = vi.fn();
  await expect(
    prepareModelUpdate(config, "a".repeat(40), {
      discover: async () => {
        throw new Error("discovery_unavailable");
      },
      run,
    }),
  ).rejects.toThrow("discovery_unavailable");
  await expect(
    prepareModelUpdate(config, "a".repeat(40), {
      discover: async () => ({
        ...discovery,
        prices: discovery.prices.map((item) => ({ ...item, outputUsdPerMillion: 100_000 })),
      }),
      run,
    }),
  ).rejects.toThrow("budget_exceeded");
  expect(run).not.toHaveBeenCalled();
  expect(digest(config)).toBe(before);
});

test("evaluates exact baseline/candidate settings repeatedly and proposes only a strict improvement", async () => {
  const { prepared, run } = await prepare();
  expect(prepared.runs.length).toBe(20);
  expect(run.mock.calls.filter((call) => call[1].startsWith("Compatibility"))).toHaveLength(3);
  const result = proposeModelUpdate(prepared, verification(prepared));
  expect(result.improved).toEqual(["codexReviewer"]);
  expect(result.config.roles.codexReviewer).toEqual(candidate);
  expect(result.config.roles.codexImplementer).toEqual(config.roles.codexImplementer);
});

test("ties, a mandatory regression, unavailable verification, and incomplete evidence leave config unchanged or reject", async () => {
  const { prepared } = await prepare();
  const tied = structuredClone(prepared);
  for (const run of tied.runs.filter(
    (run) => run.variant === "candidate" && run.role.endsWith("Reviewer"),
  ))
    run.output = goodReview(run.fixture, false);
  expect(proposeModelUpdate(tied, verification(tied)).kind).toBe("unchanged");
  const failed = structuredClone(prepared);
  failed.runs.find(
    (run) => run.variant === "candidate" && run.fixture === "tenant-boundary",
  )!.output = { findings: [] };
  expect(proposeModelUpdate(failed, verification(failed)).kind).toBe("unchanged");
  expect(() =>
    proposeModelUpdate(prepared, { preparedHash: digest(prepared), results: [] }),
  ).toThrow("evaluation_unavailable");
  expect(() =>
    proposeModelUpdate({ ...prepared, runs: prepared.runs.slice(1) }, verification(prepared)),
  ).toThrow();
});

test("rejects forged citations, changed immutable fixtures and verification from another preparation", async () => {
  const { prepared } = await prepare();
  const forged = structuredClone(prepared);
  forged.runs.find(
    (run) => run.variant === "candidate" && run.fixture === "tenant-boundary",
  )!.output = {
    findings: [
      { path: "../../secret", line: 1, quote: "whatever", consequence: "a fabricated consequence" },
    ],
  };
  expect(proposeModelUpdate(forged, verification(forged)).kind).toBe("unchanged");
  expect(() =>
    proposeModelUpdate({ ...prepared, fixtureHash: "0".repeat(64) }, verification(prepared)),
  ).toThrow();
  expect(() =>
    proposeModelUpdate(prepared, { ...verification(prepared), preparedHash: "0".repeat(64) }),
  ).toThrow();
});

test("secretless verifier runs coding outputs against protected expectations and rejects environment secrets", async () => {
  for (const key of [
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "GITHUB_TOKEN",
    "GH_TOKEN",
    "GH_APP_PRIVATE_KEY",
  ])
    vi.stubEnv(key, "");
  const { verifyModelUpdate } = await import("./verify.ts");
  const { prepared } = await prepare();
  for (const run of prepared.runs.filter((run) => run.role.endsWith("Implementer"))) {
    run.output = {
      source:
        run.fixture === "membership"
          ? "input => !input.bot && input.status === 204"
          : "input => typeof input.boundHead === 'string' && input.boundHead !== '' && input.boundHead === input.currentHead ? (input.done === true ? 'duplicate' : 'run') : 'stale'",
    };
  }
  const execute = async (source: string, inputs: unknown[]): Promise<unknown[] | null> => {
    const result = spawnSync("node", [fileURLToPath(new URL("./worker.mjs", import.meta.url))], {
      env: { PATH: process.env.PATH },
      input: JSON.stringify({ source, inputs }),
      encoding: "utf8",
      timeout: 2000,
    });
    return result.status === 0 ? JSON.parse(result.stdout) : null;
  };
  const verified = await verifyModelUpdate(prepared, execute);
  expect(verified.results).toEqual(verification(prepared).results);
  const broken = structuredClone(prepared);
  broken.runs.find((run) => run.role.endsWith("Implementer"))!.output = {
    source: "input => { while (true) {} }",
  };
  const failed = await verifyModelUpdate(broken, execute);
  expect(failed.results.some((result) => result.outputs === null)).toBe(true);
  vi.stubEnv("AI_MODEL_EVALUATOR_IMAGE", "");
  await expect(verifyModelUpdate(prepared)).rejects.toThrow("evaluator_setup_required");
  process.env.OPENAI_API_KEY = "secret";
  try {
    await expect(verifyModelUpdate(prepared)).rejects.toThrow("credential_boundary_violation");
  } finally {
    delete process.env.OPENAI_API_KEY;
  }
}, 15_000);

test("a quoted location without the defect's concrete consequence earns no improvement", async () => {
  const { prepared } = await prepare();
  for (const run of prepared.runs.filter(
    (run) => run.variant === "candidate" && run.fixture === "incremental-boundary",
  )) {
    const output = run.output as { findings: { consequence: string }[] };
    output.findings[0]!.consequence = "The naming would be nicer with a shorter variable.";
  }
  expect(proposeModelUpdate(prepared, verification(prepared)).kind).toBe("unchanged");
});
