import { expect, test } from "vite-plus/test";
import { createAircastle } from "./index.ts";
import { access, collections, controlledStore, deferred } from "./test-support/fixtures.ts";

test("runtime initializes owned storage before serving operations", async () => {
  const { store, observations } = controlledStore();
  const runtime = await createAircastle({ database: store });
  expect(observations.initialized).toBeGreaterThan(0);
  expect(await runtime.schema(access)).toEqual({
    ok: true,
    data: { revision: "revision-start", collections },
  });
  await runtime.close();
  expect(observations.closed).toBe(1);
});

test("failed startup releases resources and rejects startup", async () => {
  const failure = new Error("storage-initialization-failed");
  const { store, observations } = controlledStore({
    initialize: async () => {
      throw failure;
    },
  });
  await expect(createAircastle({ database: store })).rejects.toBeInstanceOf(Error);
  expect(observations.closed).toBe(1);
});

test("repeated close releases owned resources only once", async () => {
  const { store, observations } = controlledStore();
  const runtime = await createAircastle({ database: store });
  await Promise.all([runtime.close(), runtime.close(), runtime.close()]);
  await runtime.close();
  expect(observations.closed).toBe(1);
});

test("close drains an admitted operation and refuses new operations", async () => {
  const gate = deferred<void>();
  const { store, observations } = controlledStore({ beforeTransaction: () => gate.promise });
  const runtime = await createAircastle({ database: store });
  const admitted = runtime.schema(access);
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observations.transactions).toBeGreaterThan(0);
    const closing = runtime.close();
    await Promise.resolve();
    expect(observations.closed).toBe(0);
    const admittedTransactions = observations.transactions;
    const refused = runtime.schema(access);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(observations.transactions).toBe(admittedTransactions);
    expect(await refused).toEqual({ ok: false, error: { code: "unavailable" } });
    gate.resolve();
    expect(await admitted).toEqual({ ok: true, data: { revision: "revision-start", collections } });
    await closing;
    expect(observations.closed).toBe(1);
  } finally {
    gate.resolve();
    await runtime.close();
  }
});
