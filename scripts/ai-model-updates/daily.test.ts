import { afterEach, expect, test, vi } from "vite-plus/test";
import { checkDailyWindow } from "./daily.ts";

const input = {
  repository: "owner/repo",
  runId: "12",
  attempt: "1",
  date: "2026-10-25",
  token: "read-only-secret",
};
afterEach(() => vi.unstubAllGlobals());

test("daily budget accepts the first run and denies earlier attempts regardless of their outcome", async () => {
  vi.stubGlobal("fetch", async () =>
    Response.json({
      workflow_runs: [{ id: 12, event: "schedule", run_started_at: "2026-10-25T03:17:00Z" }],
    }),
  );
  await expect(checkDailyWindow(input)).resolves.toBeUndefined();
  await expect(checkDailyWindow({ ...input, attempt: "2" })).rejects.toThrow("daily_budget_used");
  vi.stubGlobal("fetch", async () =>
    Response.json({
      workflow_runs: [
        { id: 11, event: "workflow_dispatch", run_started_at: "2026-10-25T01:17:00Z" },
      ],
    }),
  );
  await expect(checkDailyWindow(input)).rejects.toThrow("daily_budget_used");
});

test("unknown daily billing state denies before model cost", async () => {
  vi.stubGlobal("fetch", async () => new Response("read-only-secret", { status: 403 }));
  await expect(checkDailyWindow(input)).rejects.toThrow("daily_budget_unavailable");
});
