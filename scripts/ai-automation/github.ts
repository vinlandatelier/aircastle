import {
  authorize,
  digest,
  integer,
  operationId,
  parseCommand,
  requireObject,
  safePath,
  sha,
  text,
  validateEdits,
  type Authorization,
  type Comment,
  type Fix,
  type Identity,
  type Invocation,
  type Job,
  type Membership,
  type Receipt,
  type Snapshot,
  type SourceFile,
  type Verification,
} from "./index.ts";
import type { ModelConfig, Role } from "../ai-models/index.ts";
import { boundVerification, verificationPlan } from "./checks.ts";
import { reviewPayload, validateReviewPasses } from "./reviews.ts";

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type StoredReceipt = { commentId: number; receipt: Receipt };
type Options = {
  repository: string;
  token: string;
  botId: number;
  control: string;
  run: string;
  botLogin?: string;
};
const marker = "<!-- aircastle-ai:v1 -->\n";
function receiptBody(receipt: Receipt): string {
  const encoded = JSON.stringify(receipt).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
  const body = `${marker}<!--\n${encoded}\n-->`;
  if (Buffer.byteLength(body) > 55000) throw new Error("Receipt exceeds bound");
  return body;
}
function identity(value: unknown): Identity {
  const user = requireObject(value);
  const login = text(user.login, 100);
  if (!/^[\w[\]-]+$/.test(login)) throw new Error("Invalid identity");
  return { id: integer(user.id), login, type: text(user.type, 40) };
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected API array");
  return value;
}
export class Coordinator {
  readonly options: Options;
  readonly fetcher: Fetch;
  readonly root: string;
  constructor(options: Options, fetcher: Fetch = fetch) {
    if (!/^vinlandatelier\/[\w.-]+$/.test(options.repository) || !options.token)
      throw new Error("setup_required: repository and App token required");
    integer(options.botId);
    sha(options.control);
    this.options = options;
    this.fetcher = fetcher;
    this.root = `/repos/${options.repository}`;
  }
  async request(
    path: string,
    method = "GET",
    body?: unknown,
  ): Promise<{ status: number; data: unknown }> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid GitHub path");
    const response = await this.fetcher(`https://api.github.com${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        authorization: `Bearer ${this.options.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const reader = response.body?.getReader();
    let size = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 4_000_000) {
          await reader.cancel();
          throw new Error("GitHub response exceeds bound");
        }
        chunks.push(part.value);
      }
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    return {
      status: response.status,
      data: response.status >= 200 && response.status < 300 && raw ? JSON.parse(raw) : null,
    };
  }
  async api(path: string, method = "GET", body?: unknown): Promise<unknown> {
    const result = await this.request(path, method, body);
    if (result.status < 200 || result.status >= 300)
      throw new Error(`GitHub ${method} ${path.split("?")[0]} returned ${result.status}`);
    return result.data;
  }
  async page(path: string, page = 1): Promise<unknown[]> {
    return array(
      await this.api(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${integer(page)}`),
    );
  }
  async list(path: string, maxPages = 3): Promise<unknown[]> {
    const result: unknown[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const items = await this.page(path, page);
      result.push(...items);
      if (items.length < 100) return result;
    }
    throw new Error("Bounded pagination incomplete; refusing authority from partial state");
  }
  async membership(login: string): Promise<Membership> {
    try {
      const result = await this.request(
        `/orgs/vinlandatelier/members/${encodeURIComponent(login)}`,
      );
      return result.status === 204 ? "member" : result.status === 404 ? "outside" : "unknown";
    } catch {
      return "unknown";
    }
  }
  authorize(input: Invocation): Promise<Authorization> {
    return authorize(input, this);
  }
  async receipts(number: number): Promise<StoredReceipt[]> {
    const comments = await this.list(`${this.root}/issues/${integer(number)}/comments`);
    return comments.flatMap((raw) => {
      const comment = requireObject(raw),
        user = requireObject(comment.user);
      if (
        user.id !== this.options.botId ||
        user.type !== "Bot" ||
        typeof comment.body !== "string" ||
        !comment.body.startsWith(marker)
      )
        return [];
      const stored = comment.body.slice(marker.length);
      const encoded =
        stored.startsWith("<!--\n") && stored.endsWith("\n-->") ? stored.slice(5, -4) : stored;
      const value = requireObject(JSON.parse(encoded));
      if (
        value.version !== 1 ||
        !/^[a-f0-9]{64}$/.test(String(value.id)) ||
        !["claimed", "published", "stale", "failed"].includes(String(value.state))
      )
        throw new Error("Invalid bot receipt");
      return [{ commentId: integer(comment.id), receipt: value as unknown as Receipt }];
    });
  }
  async claim(job: Job, existing: StoredReceipt[]): Promise<StoredReceipt | null> {
    const prior = existing.find((item) => item.receipt.id === job.id);
    if (
      prior &&
      (prior.receipt.state === "published" ||
        prior.receipt.state === "stale" ||
        prior.receipt.attempt >= 2 ||
        Date.now() - Date.parse(prior.receipt.at) < 30 * 60_000 ||
        prior.receipt.job.snapshot.head !== job.snapshot.head ||
        prior.receipt.digest !==
          digest({
            ...job,
            control: prior.receipt.job.control,
            selection: prior.receipt.job.selection,
          }))
    )
      return null;
    const { files: _files, ...snapshot } = job.snapshot;
    const receipt: Receipt = {
      version: 1,
      id: job.id,
      job: { ...job, snapshot },
      digest: digest(job),
      state: "claimed",
      run: this.options.run,
      attempt: (prior?.receipt.attempt ?? 0) + 1,
      at: new Date().toISOString(),
    };
    const body = receiptBody(receipt);
    if (prior) {
      await this.api(`${this.root}/issues/comments/${prior.commentId}`, "PATCH", {
        body,
      });
      return { commentId: prior.commentId, receipt };
    }
    const posted = requireObject(
      await this.api(`${this.root}/issues/${job.snapshot.number}/comments`, "POST", {
        body,
      }),
    );
    return { commentId: integer(posted.id), receipt };
  }
  async finish(claim: StoredReceipt, state: Receipt["state"]): Promise<void> {
    await this.api(`${this.root}/issues/comments/${claim.commentId}`, "PATCH", {
      body: receiptBody({ ...claim.receipt, state }),
    });
  }
  async current(job: Job): Promise<boolean> {
    if ((await this.membership(job.requester.login)) !== "member") return false;
    const user = requireObject(await this.api(`/users/${encodeURIComponent(job.requester.login)}`));
    if (user.id !== job.requester.id || user.type !== "User") return false;
    const pr = requireObject(await this.api(`${this.root}/pulls/${job.snapshot.number}`));
    return (
      pr.state === "open" &&
      requireObject(pr.head).sha === job.snapshot.head &&
      requireObject(pr.base).sha === job.snapshot.base
    );
  }
  async publishReview(
    job: Job,
    value: unknown,
    claim: StoredReceipt,
  ): Promise<"published" | "stale"> {
    const passes = validateReviewPasses(value, job.snapshot);
    if (!(await this.current(job))) {
      await this.finish(claim, "stale");
      return "stale";
    }
    const reviews = await this.list(`${this.root}/pulls/${job.snapshot.number}/reviews`);
    const receiptMarker = `<!-- aircastle-ai-result:${job.id} -->`;
    if (
      !reviews.some((raw) => {
        const r = requireObject(raw);
        return (
          requireObject(r.user).id === this.options.botId && String(r.body).endsWith(receiptMarker)
        );
      })
    ) {
      const payload = await reviewPayload(job, passes);
      await this.api(`${this.root}/pulls/${job.snapshot.number}/reviews`, "POST", {
        ...payload,
        body: `${payload.body}\n\n${receiptMarker}`,
      });
    }
    await this.finish(claim, "published");
    return "published";
  }
  async snapshot(number: number, bound?: Receipt["job"]["snapshot"]): Promise<Snapshot> {
    const pr = requireObject(await this.api(`${this.root}/pulls/${integer(number)}`));
    const head = requireObject(pr.head),
      base = requireObject(pr.base),
      headRepo = requireObject(head.repo),
      baseRepo = requireObject(base.repo);
    const revision = {
      repositoryId: integer(baseRepo.id),
      number,
      base: sha(base.sha),
      head: sha(head.sha),
      headRepositoryId: integer(headRepo.id),
      baseRef: text(base.ref, 200),
      author: identity(pr.user),
      fork: headRepo.id !== baseRepo.id,
    };
    if (
      pr.state !== "open" ||
      (bound && (bound.head !== revision.head || bound.base !== revision.base))
    )
      throw new Error("Stale revision");
    const comparison = requireObject(
      await this.api(`${this.root}/compare/${revision.base}...${revision.head}?per_page=1`),
    );
    const compared = array(comparison.files);
    const changed = compared.slice(0, 300);
    const paths = changed.map((raw) => safePath(requireObject(raw).filename));
    const commit = requireObject(await this.api(`${this.root}/git/commits/${revision.head}`));
    const tree = sha(requireObject(commit.tree).sha);
    const files: SourceFile[] = [],
      omitted: string[] = compared.length >= 300 ? ["comparison reached the 300-file bound"] : [];
    const capture = (file: SourceFile): void => {
      if (Buffer.byteLength(JSON.stringify([...files, file])) > 100000)
        omitted.push(`${file.path}: serialized context budget`);
      else files.push(file);
    };
    for (const raw of changed) {
      const file = requireObject(raw),
        path = safePath(file.filename);
      if (files.length >= 40) {
        omitted.push(path);
        continue;
      }
      const patch = typeof file.patch === "string" ? file.patch.slice(0, 16000) : "";
      if (!patch || patch.length !== String(file.patch).length)
        omitted.push(`${path}: diff unavailable or truncated`);
      if (file.status === "removed") {
        capture({ path, sha: null, mode: "100644", text: null, patch });
        continue;
      }
      const entry = await this.entry(revision.head, path);
      if (!entry || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) {
        omitted.push(`${path}: nonregular file`);
        continue;
      }
      if (sha(file.sha) !== entry.sha) throw new Error("Stale diff blob");
      const blob = requireObject(await this.api(`${this.root}/git/blobs/${entry.sha}`));
      if (blob.encoding !== "base64" || Number(blob.size) > 80000) {
        omitted.push(`${path}: oversized or unavailable blob`);
        continue;
      }
      if (typeof blob.content !== "string" || blob.content.length > 150000)
        throw new Error("Invalid blob content");
      const rawText = Buffer.from(blob.content.replaceAll("\n", ""), "base64");
      const source = rawText.toString("utf8");
      if (source.includes("\0") || !rawText.equals(Buffer.from(source))) {
        omitted.push(`${path}: binary`);
        continue;
      }
      capture({ path, sha: entry.sha, mode: entry.mode, text: source, patch });
    }
    const final = requireObject(await this.api(`${this.root}/pulls/${number}`));
    if (
      final.state !== "open" ||
      requireObject(final.head).sha !== revision.head ||
      requireObject(final.base).sha !== revision.base
    )
      throw new Error("Stale revision during context collection");
    return {
      ...revision,
      tree,
      files,
      omitted,
      changedPaths: paths,
      complete: omitted.length === 0,
    };
  }
  async entry(
    commit: string,
    path: string,
  ): Promise<{ sha: string; mode: string; type: string } | null> {
    const parts = safePath(path).split("/");
    let tree = sha(commit);
    for (let i = 0; i < parts.length; i++) {
      const result = requireObject(await this.api(`${this.root}/git/trees/${tree}`));
      if (result.truncated) throw new Error("Git tree truncated");
      const found = array(result.tree)
        .map(requireObject)
        .find((entry) => entry.path === parts[i]);
      if (!found) return null;
      if (i < parts.length - 1 && found.mode !== "040000")
        throw new Error("Symlink or non-directory ancestor");
      tree = sha(found.sha);
      if (i === parts.length - 1)
        return { sha: tree, mode: text(found.mode, 10), type: text(found.type, 10) };
    }
    return null;
  }
  async previous(
    number: number,
    role: Role,
    existing: StoredReceipt[],
    head: string,
  ): Promise<string> {
    const prior = existing
      .filter(
        (item) =>
          item.receipt.state === "published" &&
          item.receipt.job.role === role &&
          item.receipt.job.task === "review",
      )
      .at(-1);
    if (!prior) return "Initial full base-to-head review.";
    const old = prior.receipt.job.snapshot.head;
    const compare = requireObject(
      await this.api(`${this.root}/compare/${sha(old)}...${sha(head)}`),
    );
    if (!["ahead", "identical"].includes(String(compare.status)))
      return `History rewritten since ${old}; perform a full review.`;
    const reviews = await this.list(`${this.root}/pulls/${number}/reviews`);
    const review = reviews
      .map(requireObject)
      .find(
        (r) =>
          requireObject(r.user).id === this.options.botId &&
          String(r.body).endsWith(`<!-- aircastle-ai-result:${prior.receipt.id} -->`),
      );
    return review
      ? `Incremental review since ${old}. Previous advisory evidence:\n${String(review.body).slice(0, 16000)}`
      : "Previous evidence unavailable; perform a full review.";
  }
  async command(
    raw: unknown,
    source: Comment["source"],
  ): Promise<{ number: number; comment: Comment } | null> {
    const c = requireObject(raw);
    if (typeof c.body !== "string" || !parseCommand(c.body) || c.created_at !== c.updated_at)
      return null;
    const author = identity(c.user);
    if (author.type !== "User") return null;
    const url = source === "issue" ? c.issue_url : c.pull_request_url;
    const match = new RegExp(
      `^https://api\\.github\\.com/repos/${this.options.repository.replaceAll(".", "\\.")}/${source === "issue" ? "issues" : "pulls"}/([0-9]+)$`,
    ).exec(String(url));
    if (!match) throw new Error("Command repository mismatch");
    const number = integer(Number(match[1]));
    let thread = "";
    if (source === "inline") {
      const comments = await this.list(`${this.root}/pulls/${number}/comments`);
      const root = c.in_reply_to_id ?? c.id;
      const relevant = comments
        .map(requireObject)
        .filter((r) => r.id === root || r.in_reply_to_id === root || r.id === c.id);
      if (!relevant.some((r) => r.id === root)) throw new Error("Inline root context unavailable");
      const trusted = new Map<string, boolean>();
      for (const r of relevant) {
        const user = identity(r.user);
        if (!trusted.has(user.login))
          trusted.set(
            user.login,
            user.id === this.options.botId || (await this.membership(user.login)) === "member",
          );
      }
      thread = JSON.stringify(
        relevant.map((r) => ({
          id: r.id,
          author: identity(r.user).login,
          body: trusted.get(identity(r.user).login)
            ? r.body
            : "[omitted: not written by an organization member]",
          path: r.path,
          diff_hunk: r.diff_hunk,
          commit_id: r.commit_id,
          original_commit_id: r.original_commit_id,
        })),
      ).slice(0, 24000);
    }
    return {
      number,
      comment: {
        id: integer(c.id),
        author,
        body: c.body,
        source,
        thread,
        createdAt: text(c.created_at, 40),
      },
    };
  }
  async prepare(config: ModelConfig, commentId: number): Promise<Job[]> {
    for (const role of [
      "codexReviewer",
      "codexImplementer",
      "claudeReviewer",
      "claudeImplementer",
    ] as const) {
      if (config.roles[role].provider !== (role.startsWith("codex") ? "openai" : "anthropic"))
        throw new Error("setup_required: role provider does not match command provider");
    }
    const accepted = await this.command(
      await this.api(`${this.root}/issues/comments/${integer(commentId)}`),
      "issue",
    );
    if (!accepted) return [];
    const { number, comment: command } = accepted;
    const requester = command.author;
    if ((await this.membership(requester.login)) !== "member") return [];
    const cmd = parseCommand(command.body)!;
    const role: Role = `${cmd.provider === "openai" ? "codex" : "claude"}${cmd.kind === "fix" ? "Implementer" : "Reviewer"}`;
    const response = await this.request(`${this.root}/pulls/${number}`);
    if (response.status === 404) return [];
    if (response.status !== 200) throw new Error("PR lookup unavailable");
    const pr = requireObject(response.data);
    if (pr.state !== "open") return [];
    const existing = await this.receipts(number);
    const base = requireObject(pr.base),
      head = requireObject(pr.head);
    const bare: Snapshot = {
      repositoryId: integer(requireObject(base.repo).id),
      number,
      base: sha(base.sha),
      head: sha(head.sha),
      headRepositoryId: integer(requireObject(head.repo).id),
      baseRef: text(base.ref, 200),
      author: identity(pr.user),
      fork: requireObject(head.repo).id !== requireObject(base.repo).id,
      tree: sha(head.sha),
      files: [],
      omitted: [],
      changedPaths: [],
      complete: false,
    };
    const invocation: Invocation = {
      kind: "manual",
      snapshot: bare,
      role,
      command,
      control: this.options.control,
    };
    const id = operationId(invocation),
      prior = existing.find((r) => r.receipt.id === id);
    if (
      prior &&
      (prior.receipt.state === "published" ||
        prior.receipt.state === "stale" ||
        prior.receipt.attempt >= 2 ||
        Date.now() - Date.parse(prior.receipt.at) < 30 * 60_000)
    )
      return [];
    if (
      prior &&
      (prior.receipt.job.snapshot.head !== bare.head ||
        prior.receipt.job.snapshot.base !== bare.base)
    ) {
      await this.finish(prior, "stale");
      return [];
    }
    const authorization = await this.authorize(invocation);
    if (authorization.kind !== "authorized") return [];
    const snapshot = await this.snapshot(number, prior?.receipt.job.snapshot ?? bare);
    const job: Job = {
      version: 1,
      id,
      ...(cmd.kind === "request"
        ? ({ task: "request", implementation: config.roles.claudeImplementer } as const)
        : { task: authorization.task }),
      role,
      requester,
      snapshot,
      instructions: authorization.instructions,
      thread: authorization.thread,
      control: this.options.control,
      selection: config.roles[role],
      previous: await this.previous(number, role, existing, snapshot.head),
    };
    if (job.task === "fix" && (!snapshot.complete || job.thread.length >= 24000))
      throw new Error("Fix requires complete bounded changed-file context");
    if (prior && prior.receipt.digest !== digest(job)) return [];
    return (await this.claim(job, existing)) ? [job] : [];
  }
  async publishFix(
    job: Job,
    raw: unknown,
    verification: Verification,
    claim: StoredReceipt,
  ): Promise<string> {
    const fix: Fix = validateEdits(raw, job.snapshot);
    const selection = job.task === "request" ? job.implementation : job.selection;
    const commands = verificationPlan(fix.edits);
    if (!boundVerification(job, fix.edits, verification)) {
      await this.finish(claim, "failed");
      return "verification_failed";
    }
    if (!(await this.current(job))) {
      await this.finish(claim, "stale");
      return "stale";
    }
    if (commands === null || job.snapshot.fork) {
      const reason =
        commands === null
          ? "scoped verification is unavailable for these paths. This patch is unverified; no verification commands ran"
          : "the PR comes from a fork, and its commits are never copied into a branch of this repository. Selected scoped checks passed";
      await this.api(`${this.root}/issues/${job.snapshot.number}/comments`, "POST", {
        body: `Fix for reviewed SHA ${job.snapshot.head} is patch-only because ${reason}. No branch was promoted. Download artifact ai-model-${job.id} from https://github.com/${this.options.repository}/actions/runs/${this.options.run}. It contains a unified patch and original structured edits.`,
      });
      await this.finish(claim, "published");
      return "patch_only";
    }
    const branch = `ai-fix/${job.id}`;
    const pullRequests = await this.list(
      `${this.root}/pulls?state=all&head=vinlandatelier:${encodeURIComponent(branch)}`,
    );
    const prior = pullRequests
      .map(requireObject)
      .find(
        (pr) =>
          requireObject(pr.user).id === this.options.botId &&
          String(pr.body).endsWith(`<!-- aircastle-ai-fix:${job.id} -->`),
      );
    if (prior) {
      await this.finish(claim, "published");
      return String(prior.html_url);
    }
    const entries: Record<string, unknown>[] = [];
    for (const edit of fix.edits) {
      const original = await this.entry(job.snapshot.head, edit.path);
      if ((original?.sha ?? null) !== edit.expectedBlob)
        throw new Error("Publisher blob precondition failed");
      if (edit.content === null)
        entries.push({
          path: edit.path,
          mode: original?.mode ?? "100644",
          type: "blob",
          sha: null,
        });
      else {
        const blob = requireObject(
          await this.api(`${this.root}/git/blobs`, "POST", {
            content: edit.content,
            encoding: "utf-8",
          }),
        );
        entries.push({
          path: edit.path,
          mode: original?.mode ?? "100644",
          type: "blob",
          sha: sha(blob.sha),
        });
      }
    }
    const tree = requireObject(
      await this.api(`${this.root}/git/trees`, "POST", {
        base_tree: job.snapshot.tree,
        tree: entries,
      }),
    );
    const parent = requireObject(await this.api(`${this.root}/git/commits/${job.snapshot.head}`));
    const author = {
      name: "Aircastle AI",
      email: "aircastle-ai@users.noreply.github.com",
      date: text(requireObject(parent.committer).date, 40),
    };
    const commit = requireObject(
      await this.api(`${this.root}/git/commits`, "POST", {
        author,
        committer: author,
        message: `Apply requested AI fix for #${job.snapshot.number}\n\nOperation: ${job.id}`,
        tree: sha(tree.sha),
        parents: [job.snapshot.head],
      }),
    );
    if (!(await this.current(job))) {
      await this.finish(claim, "stale");
      return "stale";
    }
    const ref = await this.request(`${this.root}/git/ref/heads/${branch}`);
    if (ref.status === 404)
      await this.api(`${this.root}/git/refs`, "POST", {
        ref: `refs/heads/${branch}`,
        sha: sha(commit.sha),
      });
    else if (ref.status !== 200 || requireObject(requireObject(ref.data).object).sha !== commit.sha)
      throw new Error("Existing fix branch differs; refusing overwrite");
    const pr = requireObject(
      await this.api(`${this.root}/pulls`, "POST", {
        title: `AI fix for #${job.snapshot.number}: ${fix.summary.slice(0, 100)}`,
        head: branch,
        base: job.snapshot.baseRef,
        body: `Explicit fix requested by @${job.requester.login} for #${job.snapshot.number}.\n\nSource head: ${job.snapshot.head}\nModel: ${selection.model}; effort sent: ${selection.effort}.\n\n${fix.summary}\n\nVerification: ${verification.scope}. Recipe ${verification.recipe}.\n\nSelected commands:\n\n\`\`\`text\n${commands.map((args) => args.join(" ")).join("\n")}\n\`\`\`\n\nOrdinary deterministic CI must pass.\n\nThis successor PR includes the original source changes plus the fix. No automatic merge.\n\n<!-- aircastle-ai-fix:${job.id} -->`,
      }),
    );
    await this.finish(claim, "published");
    return text(pr.html_url, 1000);
  }
  async setup(): Promise<void> {
    const repo = requireObject(await this.api(this.root));
    if (repo.private !== false || repo.default_branch !== "main")
      throw new Error("setup_required: public repository with default main required");
    const environment = requireObject(await this.api(`${this.root}/environments/ai-automation`));
    const policy = requireObject(environment.deployment_branch_policy);
    if (policy.custom_branch_policies !== true || policy.protected_branches !== false)
      throw new Error("setup_required: exact main environment branch restriction required");
    const branches = requireObject(
      await this.api(`${this.root}/environments/ai-automation/deployment-branch-policies`),
    );
    const policies = array(branches.branch_policies).map(requireObject);
    if (policies.length !== 1 || policies[0]?.name !== "main" || policies[0]?.type !== "branch")
      throw new Error("setup_required: environment must allow only main, no tags");
    const bot = requireObject(await this.api(`/user/${this.options.botId}`));
    if (bot.type !== "Bot" || (this.options.botLogin && bot.login !== this.options.botLogin))
      throw new Error("setup_required: configured bot identity must be a bot");
    const members = await this.request("/orgs/vinlandatelier/members?per_page=1");
    if (members.status !== 200) throw new Error("setup_required: App Members read unavailable");
  }
}
