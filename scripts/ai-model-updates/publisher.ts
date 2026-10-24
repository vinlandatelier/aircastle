import { parseModelConfig } from "../ai-models/index.ts";
import { digest, proposeModelUpdate, type Prepared, type Verification } from "./index.ts";

const branch = "automation/ai-model-updates";
const configPath = ".github/ai-models.json";
const proofPath = "scripts/ai-model-updates/proposal.json";
type Publication = { kind: "unchanged" } | { kind: "published"; url: string; head: string };
type PublishInput = { repository: string; botLogin: string; token: string; runUrl: string };
type GitCommit = { sha: string; tree: { sha: string } };

export async function publishModelUpdate(
  prepared: Prepared,
  verification: Verification,
  input: PublishInput,
): Promise<Publication> {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository) ||
    !/^[a-zA-Z0-9-]+\[bot\]$/.test(input.botLogin) ||
    !input.token ||
    !input.runUrl.startsWith(`https://github.com/${input.repository}/actions/runs/`)
  )
    throw new Error("setup_required");
  const proposal = proposeModelUpdate(prepared, verification);
  if (proposal.kind === "unchanged") return { kind: "unchanged" };
  const api = async <T>(
    path: string,
    method = "GET",
    body?: unknown,
    allowMissing = false,
  ): Promise<T | null> => {
    let response: Response;
    try {
      response = await fetch(`https://api.github.com/repos/${input.repository}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${input.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
          "content-type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new Error("publisher_unavailable");
    }
    if (allowMissing && response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`publisher_http_${response.status}`);
    }
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error("publisher_invalid_response");
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error("publisher_invalid_response");
    }
  };
  const content = async (path: string, ref: string): Promise<string> => {
    const file = await api<{ content: string; encoding: string }>(
      `/contents/${path}?ref=${encodeURIComponent(ref)}`,
    );
    if (!file || file.encoding !== "base64" || typeof file.content !== "string")
      throw new Error("publisher_invalid_response");
    return Buffer.from(file.content, "base64").toString("utf8");
  };
  const base = await api<{ object: { sha: string } }>("/git/ref/heads/main");
  if (base?.object.sha !== prepared.controlSha) throw new Error("stale_control_revision");
  if (
    digest(parseModelConfig(JSON.parse(await content(configPath, prepared.controlSha)))) !==
    prepared.configHash
  )
    throw new Error("stale_model_config");
  type Pull = {
    number: number;
    state: string;
    merged_at: string | null;
    user: { login: string; type: string };
    head: { sha: string };
    html_url: string;
  };
  const pulls = await api<Pull[]>(
    `/pulls?state=all&head=${encodeURIComponent(`${input.repository.split("/")[0]}:${branch}`)}&per_page=100`,
  );
  if (
    !Array.isArray(pulls) ||
    pulls.length >= 100 ||
    pulls.filter((pull) => pull.state === "open").length > 1
  )
    throw new Error("publisher_invalid_response");
  if (pulls.some((pull) => pull.user.login !== input.botLogin || pull.user.type !== "Bot"))
    throw new Error("human_owned_proposal");
  const pull = pulls.find((item) => item.state === "open");
  if (!pull && pulls[0]?.merged_at === null) throw new Error("proposal_closed");
  const existing = await api<{ object: { sha: string } }>(
    `/git/ref/heads/${branch}`,
    "GET",
    undefined,
    true,
  );
  if (pull && existing?.object.sha !== pull.head.sha) throw new Error("proposal_changed");
  if (existing) {
    const commit = await api<{ author: { login: string }; committer: { login: string } }>(
      `/commits/${existing.object.sha}`,
    );
    if (commit?.author?.login !== input.botLogin || commit.committer?.login !== input.botLogin)
      throw new Error("human_edited_proposal");
    const proof: { version: number; configHash: string; baseSha: string } = JSON.parse(
      await content(proofPath, existing.object.sha),
    );
    const previousConfig = parseModelConfig(
      JSON.parse(await content(configPath, existing.object.sha)),
    );
    if (
      proof.version !== 1 ||
      proof.configHash !== digest(previousConfig) ||
      !/^[0-9a-f]{40}$/.test(proof.baseSha)
    )
      throw new Error("human_edited_proposal");
    const comparison = await api<{ files: { filename: string }[]; total_commits: number }>(
      `/compare/${proof.baseSha}...${existing.object.sha}`,
    );
    if (
      !comparison ||
      !Array.isArray(comparison.files) ||
      comparison.total_commits > 100 ||
      comparison.files.length !== 2 ||
      comparison.files.some((file) => ![configPath, proofPath].includes(file.filename))
    )
      throw new Error("human_edited_proposal");
    if (digest(previousConfig) === digest(proposal.config) && pull)
      return { kind: "published", url: pull.html_url, head: existing.object.sha };
  }
  const baseCommit = await api<GitCommit>(`/git/commits/${prepared.controlSha}`);
  if (!baseCommit?.tree.sha) throw new Error("publisher_invalid_response");
  const proof = {
    version: 1,
    baseSha: prepared.controlSha,
    configHash: digest(proposal.config),
    fixtureHash: prepared.fixtureHash,
    preparedHash: digest(prepared),
    verificationHash: digest(verification),
    evidenceUrl: input.runUrl,
    improved: proposal.improved,
  };
  const tree: { path: string; mode: string; type: string; sha: string }[] = [];
  for (const [path, value] of [
    [configPath, proposal.config],
    [proofPath, proof],
  ] as const) {
    const blob = await api<{ sha: string }>("/git/blobs", "POST", {
      content: `${JSON.stringify(value, null, 2)}\n`,
      encoding: "utf-8",
    });
    if (!blob?.sha) throw new Error("publisher_invalid_response");
    tree.push({ path, mode: "100644", type: "blob", sha: blob.sha });
  }
  const nextTree = await api<{ sha: string }>("/git/trees", "POST", {
    base_tree: baseCommit.tree.sha,
    tree,
  });
  const commit = await api<{ sha: string }>("/git/commits", "POST", {
    message: "Propose evaluated AI model selections",
    tree: nextTree?.sha,
    parents: existing ? [existing.object.sha, prepared.controlSha] : [prepared.controlSha],
  });
  if (!commit?.sha) throw new Error("publisher_invalid_response");
  if (existing) await api(`/git/refs/heads/${branch}`, "PATCH", { sha: commit.sha, force: false });
  else await api("/git/refs", "POST", { ref: `refs/heads/${branch}`, sha: commit.sha });
  if (pull) return { kind: "published", url: pull.html_url, head: commit.sha };
  const created = await api<{ html_url: string }>("/pulls", "POST", {
    title: "Update evaluated AI model selections",
    head: branch,
    base: "main",
    body: `The candidate passed repeated review or coding comparisons with no mandatory regression and a strict score improvement.\n\nChanged roles: ${proposal.improved.join(", ")}. Raw hashed receipts and independent verification: ${input.runUrl}.\n\nThe models take effect only after a human merges this PR.`,
  });
  if (!created?.html_url) throw new Error("publisher_invalid_response");
  return { kind: "published", url: created.html_url, head: commit.sha };
}
