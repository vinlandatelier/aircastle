import {
  parseModelConfig,
  runModel,
  type ModelConfig,
  type ModelSelection,
  type Role,
} from "../ai-models/index.ts";
import { coding, codingSchema, repetitions, reviews, reviewSchema } from "./fixtures.ts";
import { discoverCandidates } from "./releases.ts";
import { digest, hashText } from "./evidence.ts";
export { digest } from "./evidence.ts";

export type Candidate = {
  selection: ModelSelection;
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
};
export type Discovery = {
  candidates: Candidate[];
  prices: Candidate[];
  sources: { url: string; body: string; sha256: string }[];
};
export type EvaluationRun = {
  id: string;
  role: Role;
  variant: "baseline" | "candidate";
  fixture: string;
  repetition: number;
  selection: ModelSelection;
  output: unknown;
};
export type Prepared = {
  version: 1;
  controlSha: string;
  config: ModelConfig;
  configHash: string;
  fixtureHash: string;
  discovery: Discovery;
  runs: EvaluationRun[];
  probes: { selection: ModelSelection; output: unknown }[];
  reservedUsd: number;
};
export type Verification = {
  preparedHash: string;
  results: { id: string; outputs: unknown[] | null }[];
};
export const roles: Role[] = [
  "codexReviewer",
  "codexImplementer",
  "claudeReviewer",
  "claudeImplementer",
];
export const limits = { calls: 48, usd: 30, inputBytes: 24_000, outputTokens: 8192 };
export const fixtureHash = (): string =>
  digest({ reviews, coding, repetitions, reviewSchema, codingSchema });
const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function evaluationPlan(
  config: ModelConfig,
  discovery: Discovery,
): Omit<EvaluationRun, "output">[] {
  const plan: Omit<EvaluationRun, "output">[] = [];
  if (
    discovery.candidates.length > 2 ||
    new Set(discovery.candidates.map((item) => item.selection.provider)).size !==
      discovery.candidates.length
  )
    throw new Error("discovery_unavailable");
  for (const role of roles) {
    const candidate = discovery.candidates.find(
      (item) => item.selection.provider === config.roles[role].provider,
    );
    if (!candidate || digest(candidate.selection) === digest(config.roles[role])) continue;
    const fixtures = role.endsWith("Reviewer") ? reviews : coding;
    for (const variant of ["baseline", "candidate"] as const) {
      for (const fixture of fixtures)
        for (let repetition = 0; repetition < repetitions; repetition++) {
          plan.push({
            id: `${role}/${variant}/${fixture.id}/${repetition}`,
            role,
            variant,
            fixture: fixture.id,
            repetition,
            selection: variant === "baseline" ? config.roles[role] : candidate.selection,
          });
        }
    }
  }
  return plan;
}

const compatibilitySchema = {
  type: "object",
  properties: { ok: { type: "boolean", const: true } },
  required: ["ok"],
  additionalProperties: false,
};

function validateDiscovery(discovery: Discovery, config: ModelConfig): void {
  if (
    !Array.isArray(discovery.candidates) ||
    !Array.isArray(discovery.prices) ||
    !Array.isArray(discovery.sources) ||
    discovery.sources.length === 0 ||
    discovery.sources.length > 24
  )
    throw new Error("discovery_unavailable");
  for (const source of discovery.sources) {
    if (
      !/^https:\/\/(developers\.openai\.com|platform\.claude\.com|api\.openai\.com|api\.anthropic\.com)\//.test(
        source.url,
      ) ||
      typeof source.body !== "string" ||
      source.sha256 !== hashText(source.body)
    )
      throw new Error("discovery_unavailable");
  }
  for (const item of [...discovery.candidates, ...discovery.prices]) {
    const role = item.selection.provider === "openai" ? "codexReviewer" : "claudeReviewer";
    parseModelConfig({ ...config, roles: { ...config.roles, [role]: item.selection } });
    if (
      !Number.isFinite(item.inputUsdPerMillion) ||
      !Number.isFinite(item.outputUsdPerMillion) ||
      item.inputUsdPerMillion <= 0 ||
      item.outputUsdPerMillion <= 0
    )
      throw new Error("discovery_unavailable");
  }
}

function reservation(
  plan: Omit<EvaluationRun, "output">[],
  discovery: Discovery,
): { selections: ModelSelection[]; usd: number } {
  const selections = [
    ...new Map(plan.map((run) => [digest(run.selection), run.selection])).values(),
  ];
  let usd = 0;
  for (const selected of selections) {
    const price = discovery.prices.find((item) => digest(item.selection) === digest(selected));
    if (!price) throw new Error("pricing_unavailable");
    const calls = plan.filter((run) => digest(run.selection) === digest(selected)).length + 1;
    usd +=
      (2 *
        calls *
        (limits.inputBytes * price.inputUsdPerMillion +
          limits.outputTokens * price.outputUsdPerMillion)) /
      1_000_000;
  }
  if (plan.length + selections.length > limits.calls || usd > limits.usd)
    throw new Error("budget_exceeded");
  return { selections, usd };
}

export async function prepareModelUpdate(
  config: ModelConfig,
  controlSha: string,
  ports = { discover: discoverCandidates, run: runModel },
): Promise<Prepared> {
  config = parseModelConfig(config);
  if (!/^[a-f0-9]{40}$/.test(controlSha)) throw new Error("invalid_control_revision");
  const discovery = await ports.discover(config);
  validateDiscovery(discovery, config);
  const plan = evaluationPlan(config, discovery);
  const budget = reservation(plan, discovery);
  const probes: Prepared["probes"] = [];
  for (const selection of budget.selections) {
    const output = await ports.run(
      selection,
      'Compatibility check. Return {"ok":true} using the supplied schema.',
      compatibilitySchema,
    );
    if (!object(output) || output.ok !== true || Object.keys(output).length !== 1)
      throw new Error("compatibility_unavailable");
    probes.push({ selection, output });
  }
  const runs: EvaluationRun[] = [];
  for (const run of plan) {
    const isReview = run.role.endsWith("Reviewer");
    const fixture = isReview
      ? reviews.find((item) => item.id === run.fixture)!
      : coding.find((item) => item.id === run.fixture)!;
    const prompt = JSON.stringify({
      id: fixture.id,
      task: fixture.task,
      ...("files" in fixture ? { files: fixture.files } : {}),
    });
    const schema = isReview ? reviewSchema : codingSchema;
    if (
      Buffer.byteLength(prompt) + Buffer.byteLength(JSON.stringify(schema)) + 4096 >
      limits.inputBytes
    )
      throw new Error("budget_exceeded");
    runs.push({ ...run, output: await ports.run(run.selection, prompt, schema) });
  }
  return {
    version: 1,
    controlSha,
    config,
    configHash: digest(config),
    fixtureHash: fixtureHash(),
    discovery,
    probes,
    runs,
    reservedUsd: budget.usd,
  };
}

function reviewScore(run: EvaluationRun): { mandatory: boolean; score: number } {
  const fixture = reviews.find((item) => item.id === run.fixture)!;
  const files: Record<string, string> = fixture.files;
  if (
    !object(run.output) ||
    Object.keys(run.output).join() !== "findings" ||
    !Array.isArray(run.output.findings) ||
    run.output.findings.length > 8
  )
    return { mandatory: false, score: 0 };
  const found = new Set<string>();
  for (const finding of run.output.findings) {
    if (
      !object(finding) ||
      Object.keys(finding).sort().join() !== "consequence,line,path,quote" ||
      typeof finding.path !== "string" ||
      typeof finding.line !== "number" ||
      !Number.isInteger(finding.line) ||
      typeof finding.quote !== "string" ||
      typeof finding.consequence !== "string" ||
      finding.consequence.length < 12
    )
      return { mandatory: false, score: 0 };
    const line = files[finding.path]?.split("\n")[finding.line - 1];
    const defect = fixture.defects.find(
      (item) => item.path === finding.path && item.line === finding.line,
    );
    if (
      !line ||
      line !== finding.quote ||
      !defect ||
      !new RegExp(defect.context, "i").test(finding.consequence) ||
      !/expos|leak|execut|bundl|unauthor|access|import|runs?/i.test(finding.consequence) ||
      found.has(`${finding.path}:${finding.line}`)
    )
      return { mandatory: false, score: 0 };
    found.add(`${finding.path}:${finding.line}`);
  }
  return {
    mandatory: fixture.defects.every(
      (item) => !item.mandatory || found.has(`${item.path}:${item.line}`),
    ),
    score: found.size,
  };
}

export function proposeModelUpdate(
  prepared: Prepared,
  verification: Verification,
): { kind: "unchanged" | "proposal"; config: ModelConfig; improved: Role[] } {
  const config = parseModelConfig(prepared.config);
  if (
    prepared.version !== 1 ||
    prepared.fixtureHash !== fixtureHash() ||
    prepared.configHash !== digest(config) ||
    !/^[a-f0-9]{40}$/.test(prepared.controlSha) ||
    verification.preparedHash !== digest(prepared)
  )
    throw new Error("evaluation_unavailable");
  validateDiscovery(prepared.discovery, config);
  const plan = evaluationPlan(config, prepared.discovery);
  const budget = reservation(plan, prepared.discovery);
  if (
    prepared.reservedUsd !== budget.usd ||
    !Array.isArray(prepared.probes) ||
    prepared.probes.length !== budget.selections.length ||
    budget.selections.some(
      (selected) =>
        !prepared.probes.some(
          (probe) =>
            digest(probe.selection) === digest(selected) &&
            object(probe.output) &&
            probe.output.ok === true &&
            Object.keys(probe.output).length === 1,
        ),
    )
  )
    throw new Error("compatibility_unavailable");
  if (
    !Array.isArray(prepared.runs) ||
    prepared.runs.length !== plan.length ||
    plan.some(
      (run, index) =>
        digest(run) !==
        digest(
          prepared.runs[index] && (({ output: _output, ...rest }) => rest)(prepared.runs[index]!),
        ),
    )
  )
    throw new Error("evaluation_unavailable");
  const codeRuns = plan.filter((run) => run.role.endsWith("Implementer"));
  if (
    !Array.isArray(verification.results) ||
    verification.results.length !== codeRuns.length ||
    new Set(verification.results.map((item) => item.id)).size !== codeRuns.length ||
    codeRuns.some((run) => !verification.results.some((item) => item.id === run.id))
  )
    throw new Error("evaluation_unavailable");
  const scores = new Map<string, { mandatory: boolean; score: number }>();
  for (const run of prepared.runs) {
    if (run.role.endsWith("Reviewer")) scores.set(run.id, reviewScore(run));
    else {
      const fixture = coding.find((item) => item.id === run.fixture)!;
      const outputs = verification.results.find((item) => item.id === run.id)?.outputs;
      const score = Array.isArray(outputs)
        ? fixture.checks.filter(
            (check, index) => JSON.stringify(check.expected) === JSON.stringify(outputs[index]),
          ).length
        : 0;
      scores.set(run.id, {
        mandatory:
          score === fixture.checks.length &&
          Array.isArray(outputs) &&
          outputs.length === fixture.checks.length,
        score,
      });
    }
  }
  const improved: Role[] = [];
  const next: ModelConfig = structuredClone(config);
  for (const role of roles) {
    const candidates = prepared.runs.filter(
      (run) => run.role === role && run.variant === "candidate",
    );
    if (!candidates.length) continue;
    let gain = 0;
    const noRegression = candidates.every((run) => {
      const candidate = scores.get(run.id)!;
      const baseline = scores.get(run.id.replace("/candidate/", "/baseline/"))!;
      gain += candidate.score - baseline.score;
      return candidate.mandatory && candidate.score >= baseline.score;
    });
    if (noRegression && gain > 0) {
      improved.push(role);
      next.roles[role] = candidates[0]!.selection;
    }
  }
  return { kind: improved.length ? "proposal" : "unchanged", config: next, improved };
}
