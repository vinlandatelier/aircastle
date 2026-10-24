#!/usr/bin/env bun
import { push } from "./index.ts";

const args = process.argv.slice(2);
if (args[0] !== "push" || args.slice(1).some((arg) => arg !== "--reconcile") || args.length > 2) {
  console.error(
    JSON.stringify({
      ok: false,
      error: { code: "invalid_request" },
      message: "Usage: aircastle push [--reconcile]",
    }),
  );
  process.exitCode = 1;
} else {
  process.exitCode = await push({ reconcile: args.includes("--reconcile") });
}
