import {
  authorize,
  controlPath,
  digest,
  integer,
  operationId,
  parseCommand,
  record,
  renderReview,
  safePath,
  sha,
  text,
  validateEdits,
  validateReview,
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

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;
export type StoredReceipt = { commentId: number; receipt: Receipt };
type Options = {
  repository: string;
  token: string;
  botId: number;
  stateIssue: number;
  activatedAt: string;
  control: string;
  run: string;
  botLogin?: string;
};
type StreamCursor = { since: string; page: number; started: string };
type Cursor = { version: 1; prPage: number; issue: StreamCursor; inline: StreamCursor };
const marker = "<!-- aircastle-ai:v1 -->\n";
const cursorMarker = "<!-- aircastle-ai-cursor:v1 -->\n";
function identity(value: unknown): Identity {
  const user = record(value);
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
    if (
      !/^vinlandatelier\/[\w.-]+$/.test(options.repository) ||
      !options.token ||
      !Number.isFinite(Date.parse(options.activatedAt))
    )
      throw new Error("setup_required: repository, App token, activation time required");
    integer(options.botId);
    integer(options.stateIssue);
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
      const comment = record(raw),
        user = record(comment.user);
      if (
        user.id !== this.options.botId ||
        user.type !== "Bot" ||
        typeof comment.body !== "string" ||
        !comment.body.startsWith(marker)
      )
        return [];
      const value = record(JSON.parse(comment.body.slice(marker.length)));
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
        prior.receipt.digest !== digest(job))
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
    if (JSON.stringify(receipt).length > 55000) throw new Error("Receipt exceeds bound");
    if (prior) {
      await this.api(`${this.root}/issues/comments/${prior.commentId}`, "PATCH", {
        body: marker + JSON.stringify(receipt),
      });
      return { commentId: prior.commentId, receipt };
    }
    const posted = record(
      await this.api(`${this.root}/issues/${job.snapshot.number}/comments`, "POST", {
        body: marker + JSON.stringify(receipt),
      }),
    );
    return { commentId: integer(posted.id), receipt };
  }
  async finish(claim: StoredReceipt, state: Receipt["state"]): Promise<void> {
    await this.api(`${this.root}/issues/comments/${claim.commentId}`, "PATCH", {
      body: marker + JSON.stringify({ ...claim.receipt, state }),
    });
  }
  async current(job: Job): Promise<boolean> {
    if ((await this.membership(job.requester.login)) !== "member") return false;
    const user = record(await this.api(`/users/${encodeURIComponent(job.requester.login)}`));
    if (user.id !== job.requester.id || user.type !== "User") return false;
    const pr = record(await this.api(`${this.root}/pulls/${job.snapshot.number}`));
    return (
      pr.state === "open" &&
      record(pr.head).sha === job.snapshot.head &&
      record(pr.base).sha === job.snapshot.base
    );
  }
  async publishReview(
    job: Job,
    value: unknown,
    claim: StoredReceipt,
  ): Promise<"published" | "stale"> {
    const review = validateReview(value, job.snapshot);
    if (!(await this.current(job))) {
      await this.finish(claim, "stale");
      return "stale";
    }
    const reviews = await this.list(`${this.root}/pulls/${job.snapshot.number}/reviews`);
    const receiptMarker = `<!-- aircastle-ai-result:${job.id} -->`;
    if (
      !reviews.some((raw) => {
        const r = record(raw);
        return record(r.user).id === this.options.botId && String(r.body).endsWith(receiptMarker);
      })
    ) {
      await this.api(`${this.root}/pulls/${job.snapshot.number}/reviews`, "POST", {
        event: "COMMENT",
        commit_id: job.snapshot.head,
        body: `${renderReview(job, review)}\n\n${receiptMarker}`,
      });
    }
    await this.finish(claim, "published");
    return "published";
  }
  async snapshot(number: number, bound?: Receipt["job"]["snapshot"]): Promise<Snapshot> {
    const pr = record(await this.api(`${this.root}/pulls/${integer(number)}`));
    const head = record(pr.head),
      base = record(pr.base),
      headRepo = record(head.repo),
      baseRepo = record(base.repo);
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
    const changed = await this.list(`${this.root}/pulls/${number}/files`);
    const paths = changed.map((raw) => safePath(record(raw).filename));
    const commit = record(await this.api(`${this.root}/git/commits/${revision.head}`));
    const tree = sha(record(commit.tree).sha);
    const files: SourceFile[] = [],
      omitted: string[] = [];
    let bytes = 0;
    for (const raw of changed) {
      const file = record(raw),
        path = safePath(file.filename);
      if (files.length >= 40 || bytes > 300000) {
        omitted.push(path);
        continue;
      }
      const patch = typeof file.patch === "string" ? file.patch.slice(0, 16000) : "";
      if (!patch || patch.length !== String(file.patch).length)
        omitted.push(`${path}: diff unavailable or truncated`);
      if (file.status === "removed") {
        files.push({ path, sha: null, mode: "100644", text: null, patch });
        bytes += patch.length;
        continue;
      }
      const entry = await this.entry(revision.head, path);
      if (!entry || entry.type !== "blob" || !["100644", "100755"].includes(entry.mode)) {
        omitted.push(`${path}: nonregular file`);
        continue;
      }
      if (sha(file.sha) !== entry.sha) throw new Error("Stale diff blob");
      const blob = record(await this.api(`${this.root}/git/blobs/${entry.sha}`));
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
      bytes += Buffer.byteLength(source) + patch.length;
      files.push({ path, sha: entry.sha, mode: entry.mode, text: source, patch });
    }
    const final = record(await this.api(`${this.root}/pulls/${number}`));
    if (
      final.state !== "open" ||
      record(final.head).sha !== revision.head ||
      record(final.base).sha !== revision.base
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
      const result = record(await this.api(`${this.root}/git/trees/${tree}`));
      if (result.truncated) throw new Error("Git tree truncated");
      const found = array(result.tree)
        .map(record)
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
    const compare = record(await this.api(`${this.root}/compare/${sha(old)}...${sha(head)}`));
    if (!["ahead", "identical"].includes(String(compare.status)))
      return `History rewritten since ${old}; perform a full review.`;
    const reviews = await this.list(`${this.root}/pulls/${number}/reviews`);
    const review = reviews
      .map(record)
      .find(
        (r) =>
          record(r.user).id === this.options.botId &&
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
    const c = record(raw);
    if (
      typeof c.body !== "string" ||
      !parseCommand(c.body) ||
      c.created_at !== c.updated_at ||
      Date.parse(String(c.created_at)) < Date.parse(this.options.activatedAt)
    )
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
        .map(record)
        .filter((r) => r.id === root || r.in_reply_to_id === root || r.id === c.id);
      if (!relevant.some((r) => r.id === root)) throw new Error("Inline root context unavailable");
      thread = JSON.stringify(
        relevant.map((r) => ({
          id: r.id,
          author: identity(r.user).login,
          body: r.body,
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
  async cursor(): Promise<{ commentId: number | null; value: Cursor }> {
    const comments = await this.list(`${this.root}/issues/${this.options.stateIssue}/comments`);
    const owned = comments
      .map(record)
      .find(
        (c) =>
          record(c.user).id === this.options.botId &&
          record(c.user).type === "Bot" &&
          String(c.body).startsWith(cursorMarker),
      );
    if (owned) {
      const value = record(JSON.parse(String(owned.body).slice(cursorMarker.length)));
      integer(value.prPage);
      for (const stream of [record(value.issue), record(value.inline)]) {
        integer(stream.page);
        if (
          !Number.isFinite(Date.parse(String(stream.since))) ||
          !Number.isFinite(Date.parse(String(stream.started)))
        )
          throw new Error("Invalid cursor time");
      }
      return { commentId: integer(owned.id), value: value as unknown as Cursor };
    }
    const initial = { since: this.options.activatedAt, started: new Date().toISOString(), page: 1 };
    return {
      commentId: null,
      value: { version: 1, prPage: 1, issue: { ...initial }, inline: { ...initial } },
    };
  }
  async prepare(config: ModelConfig, immediateComment?: number): Promise<Job[]> {
    const state = await this.cursor();
    const jobs: Job[] = [];
    const queue = async (number: number, role: Role, command?: Comment): Promise<boolean> => {
      if (jobs.length >= 6) return false;
      const response = await this.request(`${this.root}/pulls/${number}`);
      if (response.status === 404) return true;
      if (response.status !== 200) throw new Error("PR lookup unavailable");
      const pr = record(response.data);
      if (pr.state !== "open") return true;
      const requester = command?.author ?? identity(pr.user);
      if (requester.type !== "User" || (await this.membership(requester.login)) !== "member")
        return true;
      const existing = await this.receipts(number);
      const base = record(pr.base),
        head = record(pr.head);
      const bare: Snapshot = {
        repositoryId: integer(record(base.repo).id),
        number,
        base: sha(base.sha),
        head: sha(head.sha),
        headRepositoryId: integer(record(head.repo).id),
        baseRef: text(base.ref, 200),
        author: identity(pr.user),
        fork: record(head.repo).id !== record(base.repo).id,
        tree: sha(head.sha),
        files: [],
        omitted: [],
        changedPaths: [],
        complete: false,
      };
      const invocation: Invocation = command
        ? { kind: "manual", snapshot: bare, role, command, control: this.options.control }
        : { kind: "automatic", snapshot: bare, role, control: this.options.control };
      const id = operationId(invocation),
        prior = existing.find((r) => r.receipt.id === id);
      if (
        prior &&
        (prior.receipt.state === "published" ||
          prior.receipt.state === "stale" ||
          prior.receipt.attempt >= 2 ||
          Date.now() - Date.parse(prior.receipt.at) < 30 * 60_000)
      )
        return true;
      if (
        prior &&
        (prior.receipt.job.snapshot.head !== bare.head ||
          prior.receipt.job.snapshot.base !== bare.base)
      ) {
        await this.finish(prior, "stale");
        return true;
      }
      const authorization = await this.authorize(invocation);
      if (authorization.kind !== "authorized") return true;
      const snapshot = await this.snapshot(number, prior?.receipt.job.snapshot);
      const job: Job = {
        version: 1,
        id,
        task: authorization.task,
        role,
        requester,
        snapshot,
        instructions: authorization.instructions,
        thread: authorization.thread,
        control: this.options.control,
        selection: config.roles[role],
        previous: await this.previous(number, role, existing, snapshot.head),
      };
      if (job.task === "fix" && !snapshot.complete)
        throw new Error("Fix requires complete bounded changed-file context");
      if (prior && prior.receipt.digest !== digest(job)) return true;
      if (await this.claim(job, existing)) jobs.push(job);
      return true;
    };
    const manual = async (raw: unknown, source: Comment["source"]): Promise<boolean> => {
      const c = record(raw);
      if (typeof c.body !== "string" || !parseCommand(c.body)) return true;
      if ((await this.membership(identity(c.user).login)) !== "member") return true;
      const accepted = await this.command(raw, source);
      if (!accepted) return true;
      const cmd = parseCommand(accepted.comment.body)!;
      const role: Role = `${cmd.provider === "openai" ? "codex" : "claude"}${cmd.kind === "fix" ? "Implementer" : "Reviewer"}`;
      return queue(accepted.number, role, accepted.comment);
    };
    if (immediateComment)
      await manual(
        await this.api(`${this.root}/issues/comments/${integer(immediateComment)}`),
        "issue",
      );
    for (const source of ["issue", "inline"] as const) {
      const stream = state.value[source];
      const path = source === "issue" ? "issues/comments" : "pulls/comments";
      const comments = await this.page(
        `${this.root}/${path}?since=${encodeURIComponent(stream.since)}&sort=created&direction=asc`,
        stream.page,
      );
      let consumed = true;
      for (const raw of comments)
        if (!(await manual(raw, source))) {
          consumed = false;
          break;
        }
      if (consumed) {
        if (comments.length === 100) stream.page++;
        else {
          stream.since = new Date(
            Math.max(Date.parse(this.options.activatedAt), Date.parse(stream.started) - 600000),
          ).toISOString();
          stream.started = new Date().toISOString();
          stream.page = 1;
        }
      }
    }
    const prs = await this.page(
      `${this.root}/pulls?state=open&sort=created&direction=asc`,
      state.value.prPage,
    );
    let consumed = true;
    for (const raw of prs) {
      const number = integer(record(raw).number);
      for (const role of ["codexReviewer", "claudeReviewer"] as const)
        if (!(await queue(number, role))) {
          consumed = false;
          break;
        }
      if (!consumed) break;
      const existing = await this.receipts(number);
      for (const prior of existing.filter(
        (r) => ["claimed", "failed"].includes(r.receipt.state) && r.receipt.attempt < 2,
      )) {
        const original = prior.receipt.job;
        if (
          Date.now() - Date.parse(prior.receipt.at) < 30 * 60_000 ||
          jobs.length >= 6 ||
          !(await this.current({ ...original, snapshot: { ...original.snapshot, files: [] } }))
        )
          continue;
        const snapshot = await this.snapshot(number, original.snapshot);
        const job = { ...original, snapshot };
        if (await this.claim(job, existing)) jobs.push(job);
      }
    }
    if (consumed) state.value.prPage = prs.length === 100 ? state.value.prPage + 1 : 1;
    if (state.commentId)
      await this.api(`${this.root}/issues/comments/${state.commentId}`, "PATCH", {
        body: cursorMarker + JSON.stringify(state.value),
      });
    else
      await this.api(`${this.root}/issues/${this.options.stateIssue}/comments`, "POST", {
        body: cursorMarker + JSON.stringify(state.value),
      });
    return jobs;
  }
  async publishFix(
    job: Job,
    raw: unknown,
    verification: Verification,
    claim: StoredReceipt,
  ): Promise<string> {
    const fix: Fix = validateEdits(raw, job.snapshot);
    if (
      verification.id !== job.id ||
      verification.digest !== digest(job) ||
      verification.editsDigest !== digest(fix.edits) ||
      verification.passed !== true
    ) {
      await this.finish(claim, "failed");
      return "verification_failed";
    }
    if (!(await this.current(job))) {
      await this.finish(claim, "stale");
      return "stale";
    }
    if (job.snapshot.fork && job.snapshot.changedPaths.some(controlPath)) {
      await this.api(`${this.root}/issues/${job.snapshot.number}/comments`, "POST", {
        body: `Fix for reviewed SHA ${job.snapshot.head} is patch-only because this fork changes automation/configuration. No branch was promoted. Download the original structured patch artifact from run ${this.options.run}. Verification: ${verification.scope}.`,
      });
      await this.finish(claim, "published");
      return "patch_only";
    }
    const branch = `ai-fix/${job.id}`;
    const pullRequests = await this.list(
      `${this.root}/pulls?state=all&head=vinlandatelier:${encodeURIComponent(branch)}`,
    );
    const prior = pullRequests
      .map(record)
      .find(
        (pr) =>
          record(pr.user).id === this.options.botId &&
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
        const blob = record(
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
    const tree = record(
      await this.api(`${this.root}/git/trees`, "POST", {
        base_tree: job.snapshot.tree,
        tree: entries,
      }),
    );
    const parent = record(await this.api(`${this.root}/git/commits/${job.snapshot.head}`));
    const author = {
      name: "Aircastle AI",
      email: "aircastle-ai@users.noreply.github.com",
      date: text(record(parent.committer).date, 40),
    };
    const commit = record(
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
    else if (ref.status !== 200 || record(record(ref.data).object).sha !== commit.sha)
      throw new Error("Existing fix branch differs; refusing overwrite");
    const pr = record(
      await this.api(`${this.root}/pulls`, "POST", {
        title: `AI fix for #${job.snapshot.number}: ${fix.summary.slice(0, 100)}`,
        head: branch,
        base: job.snapshot.baseRef,
        body: `Explicit fix requested by @${job.requester.login} for #${job.snapshot.number}.\n\nSource head: ${job.snapshot.head}\nModel: ${job.selection.model}; effort sent: ${job.selection.effort}.\n\n${fix.summary}\n\nVerification: ${verification.scope}. Recipe ${verification.recipe}. Ordinary deterministic CI must pass.\n\nThis successor PR includes the original source changes plus the fix. No automatic merge.\n\n<!-- aircastle-ai-fix:${job.id} -->`,
      }),
    );
    await this.finish(claim, "published");
    return text(pr.html_url, 1000);
  }
  async setup(): Promise<void> {
    const repo = record(await this.api(this.root));
    if (repo.private !== false || repo.default_branch !== "main")
      throw new Error("setup_required: public repository with default main required");
    const environment = record(await this.api(`${this.root}/environments/ai-automation`));
    const policy = record(environment.deployment_branch_policy);
    if (policy.custom_branch_policies !== true || policy.protected_branches !== false)
      throw new Error("setup_required: exact main environment branch restriction required");
    const branches = record(
      await this.api(`${this.root}/environments/ai-automation/deployment-branch-policies`),
    );
    const policies = array(branches.branch_policies).map(record);
    if (policies.length !== 1 || policies[0]?.name !== "main" || policies[0]?.type !== "branch")
      throw new Error("setup_required: environment must allow only main, no tags");
    const bot = record(await this.api(`/user/${this.options.botId}`));
    if (bot.type !== "Bot" || (this.options.botLogin && bot.login !== this.options.botLogin))
      throw new Error("setup_required: configured bot identity must be a bot");
    const members = await this.request("/orgs/vinlandatelier/members?per_page=1");
    if (members.status !== 200) throw new Error("setup_required: App Members read unavailable");
  }
}
