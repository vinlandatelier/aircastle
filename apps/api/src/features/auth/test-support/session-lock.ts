import type postgres from "postgres";
import { deadline } from "./postgres-wire.ts";

export async function holdSession(sql: ReturnType<typeof postgres>, namespace: string) {
  let acquired!: (pid: number) => void;
  let release!: (operation: "none" | "delete-user") => void;
  const ready = new Promise<number>((resolve) => {
    acquired = resolve;
  });
  const released = new Promise<"none" | "delete-user">((resolve) => {
    release = resolve;
  });
  const done = sql.begin(async (tx) => {
    const rows = await tx<
      { user_id: string }[]
    >`SELECT user_id FROM ${tx(namespace)}.auth_sessions FOR UPDATE`;
    if (rows.length !== 1 || !rows[0]) throw new Error("Expected exactly one real session to hold");
    const process = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    const pid = process[0]?.pid;
    if (!pid) throw new Error("Expected session lock backend PID");
    acquired(pid);
    if ((await released) === "delete-user")
      await tx`DELETE FROM ${tx(namespace)}.auth_users WHERE id = ${rows[0].user_id}`;
  });
  void Promise.allSettled([done]);
  const pid = await deadline(
    Promise.race([
      ready,
      done.then(() => {
        throw new Error("Lock holder exited without readiness");
      }),
    ]),
    "Session lock was not acquired",
  );
  return { pid, done, release: (operation: "none" | "delete-user" = "none") => release(operation) };
}
