export async function checkDailyWindow(input: {
  repository: string;
  runId: string;
  attempt: string;
  token: string;
  date: string;
}): Promise<void> {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input.repository) ||
    !/^\d+$/.test(input.runId) ||
    !input.token ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.date)
  )
    throw new Error("setup_required");
  if (input.attempt !== "1") throw new Error("daily_budget_used");
  let response: Response;
  try {
    response = await fetch(
      `https://api.github.com/repos/${input.repository}/actions/workflows/ai-model-updates.yml/runs?branch=main&created=${input.date}&per_page=100`,
      {
        headers: {
          authorization: `Bearer ${input.token}`,
          accept: "application/vnd.github+json",
          "x-github-api-version": "2022-11-28",
        },
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch {
    throw new Error("daily_budget_unavailable");
  }
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("daily_budget_unavailable");
  }
  const text = await response.text();
  if (text.length > 2_000_000) throw new Error("daily_budget_unavailable");
  let data: { workflow_runs?: { id: number; event: string; run_started_at: string }[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("daily_budget_unavailable");
  }
  if (!data || !Array.isArray(data.workflow_runs) || data.workflow_runs.length >= 100)
    throw new Error("daily_budget_unavailable");
  if (
    data.workflow_runs.some(
      (run) =>
        String(run.id) !== input.runId &&
        ["schedule", "workflow_dispatch"].includes(run.event) &&
        run.run_started_at.startsWith(input.date),
    )
  )
    throw new Error("daily_budget_used");
}
