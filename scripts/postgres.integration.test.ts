import { execFile, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const root = fileURLToPath(new URL("../", import.meta.url));

function wrapped(code: string, interrupt = false) {
  return new Promise<{ code: number; output: string }>((resolve) => {
    const child = execFile(
      "bun",
      ["scripts/with-postgres.ts", "bun", "-e", code],
      {
        cwd: root,
        env: {
          ...process.env,
          AIRCASTLE_DATABASE_URL: "postgres://must-not-use",
          AIRCASTLE_DB_PORT: "1",
          AIRCASTLE_DB_NAME: "must_not_use",
          AIRCASTLE_DB_USER: "must_not_use",
          AIRCASTLE_DB_PASSWORD: "must_not_use",
        },
        timeout: 110_000,
      },
      (error, stdout, stderr) => {
        resolve({
          code: error ? (typeof error.code === "number" ? error.code : 1) : 0,
          output: stdout + stderr,
        });
      },
    );
    if (interrupt) {
      child.stdout?.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("interrupt-ready")) child.kill("SIGTERM");
      });
    }
  });
}

function expectClean(output: string) {
  const project = output.match(/Disposable Postgres project: (aircastle-test-[a-f0-9-]+)/)?.[1];
  expect(project).toBeDefined();
  for (const kind of ["container", "volume", "network"]) {
    const remaining = execFileSync(
      "docker",
      [kind, "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`],
      { encoding: "utf8" },
    );
    expect(remaining.trim()).toBe("");
  }
}

test("runs the requested command and preserves its failure status", async () => {
  const result = await wrapped('console.log("child-executed"); process.exit(7)');
  expect(result.output).toContain("child-executed");
  expect(result.code).toBe(7);
  expectClean(result.output);
});

test("parallel commands receive separate working databases and leave no storage", async () => {
  const code = `
    import { SQL } from "bun";
    const sql = new SQL(process.env.AIRCASTLE_DATABASE_URL);
    await sql.unsafe("CREATE TABLE isolated (value text)");
    await sql.unsafe("INSERT INTO isolated VALUES ('saved')");
    const rows = await sql.unsafe("SELECT value FROM isolated");
    if (rows[0].value !== "saved") throw new Error("write failed");
    console.log("DB_PROJECT=" + process.env.COMPOSE_PROJECT_NAME);
    console.log("DB_URL=" + process.env.AIRCASTLE_DATABASE_URL);
    await sql.close();
  `;
  const results = await Promise.all([wrapped(code), wrapped(code)]);
  for (const result of results) {
    expect(result.code, result.output).toBe(0);
    expectClean(result.output);
  }
  expect(results[0]?.output.match(/DB_URL=(.+)/)?.[1]).not.toBe(
    results[1]?.output.match(/DB_URL=(.+)/)?.[1],
  );
});

test("termination stops the command and removes its database", async () => {
  const result = await wrapped('console.log("interrupt-ready"); setInterval(() => {}, 1000)', true);
  expect(result.output).toContain("interrupt-ready");
  expect(result.code, result.output).toBe(143);
  expectClean(result.output);
});

test("dev data survives restart and disposable test cleanup, while reset clears it", async () => {
  const project = `aircastle-dev-check-${randomUUID()}`;
  const env = { ...process.env, COMPOSE_PROJECT_NAME: project, AIRCASTLE_DB_PORT: "0" };
  const command = (name: string) =>
    execFileSync("bun", ["run", name], { cwd: root, env, stdio: "pipe" });
  const sql = (query: string) =>
    execFileSync(
      "docker",
      [
        "compose",
        "-f",
        "compose.yaml",
        "exec",
        "-T",
        "postgres",
        "psql",
        "-U",
        "aircastle",
        "-d",
        "aircastle",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        query,
      ],
      { cwd: root, env, encoding: "utf8" },
    ).trim();
  try {
    command("db:up");
    command("db:up");
    expect(sql("SHOW server_version")).toMatch(/^18\.6\b/);
    sql(
      "CREATE TABLE persistence_probe (value text); INSERT INTO persistence_probe VALUES ('kept')",
    );
    command("db:down");
    command("db:up");
    expect(sql("SELECT value FROM persistence_probe")).toBe("kept");
    const disposable = await wrapped("process.exit(0)");
    expect(disposable.code, disposable.output).toBe(0);
    expect(sql("SELECT value FROM persistence_probe")).toBe("kept");
    command("db:reset");
    command("db:up");
    expect(sql("SELECT to_regclass('public.persistence_probe') IS NULL")).toBe("t");
  } finally {
    execFileSync("docker", ["compose", "-f", "compose.yaml", "down", "--volumes"], {
      cwd: root,
      env,
      stdio: "pipe",
    });
  }
});
