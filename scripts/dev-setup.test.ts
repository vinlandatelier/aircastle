import { randomUUID } from "node:crypto";
import { expect, test } from "vite-plus/test";
import { execute } from "../tests/support/content-processes.ts";

function settings(output: string) {
  return Object.fromEntries(
    [...output.matchAll(/^(AIRCASTLE_(?:URL|PROJECT_ID|API_KEY))=(.+)$/gm)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

test("development setup creates and prints usable local connection settings", async () => {
  const namespace = `setup_${randomUUID().replaceAll("-", "")}`;
  const result = await execute("vp", ["run", "dev:setup"], {
    env: { AIRCASTLE_DATABASE_NAMESPACE: namespace, AIRCASTLE_URL: "http://localhost:43122" },
  });
  expect(result.code, result.output).toBe(0);
  const values = settings(result.output);
  expect(values.AIRCASTLE_URL).toBe("http://localhost:43122");
  expect(values.AIRCASTLE_PROJECT_ID).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  );
  expect(values.AIRCASTLE_API_KEY).toMatch(/^[A-Za-z0-9_-]{32,}$/);
}, 30_000);

test("setup reruns reuse the project and reveal no existing secret; new-key is explicit", async () => {
  const namespace = `setup_${randomUUID().replaceAll("-", "")}`;
  const options = {
    env: { AIRCASTLE_DATABASE_NAMESPACE: namespace, AIRCASTLE_URL: "http://localhost:43122" },
  };
  const first = await execute("vp", ["run", "dev:setup"], options);
  expect(first.code, first.output).toBe(0);
  const original = settings(first.output);
  const repeated = await execute("vp", ["run", "dev:setup"], options);
  expect(repeated.code, repeated.output).toBe(0);
  expect(settings(repeated.output).AIRCASTLE_PROJECT_ID).toBe(original.AIRCASTLE_PROJECT_ID);
  expect(settings(repeated.output).AIRCASTLE_API_KEY).toBeUndefined();
  expect(repeated.output).not.toContain(original.AIRCASTLE_API_KEY);
  const another = await execute("vp", ["run", "dev:setup", "--new-key"], options);
  expect(another.code, another.output).toBe(0);
  const newer = settings(another.output);
  expect(newer.AIRCASTLE_PROJECT_ID).toBe(original.AIRCASTLE_PROJECT_ID);
  expect(newer.AIRCASTLE_API_KEY).toMatch(/^[A-Za-z0-9_-]{32,}$/);
  expect(newer.AIRCASTLE_API_KEY).not.toBe(original.AIRCASTLE_API_KEY);
}, 80_000);
