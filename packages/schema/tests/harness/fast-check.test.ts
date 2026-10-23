import { expect, test } from "vite-plus/test";
import fc from "fast-check";

test("fast-check runs passing properties under the pinned Bun runtime", () => {
  fc.assert(
    fc.property(fc.string(), (value) => value.slice() === value),
    { seed: 20261023, numRuns: 20 },
  );
});

test("fast-check reports, shrinks and replays a deliberate failure", () => {
  const property = fc.property(fc.integer({ min: 0, max: 100 }), () => false);
  const result = fc.check(property, { seed: 20261023, numRuns: 20 });
  expect(result.failed).toBe(true);
  if (!result.failed) throw new Error("Expected the smoke property to fail");
  if (result.counterexamplePath === null) throw new Error("Expected a replay path");
  expect(result.counterexample).toEqual([0]);
  const replay = fc.check(property, {
    seed: result.seed,
    path: result.counterexamplePath,
    numRuns: 20,
  });
  expect(replay.failed).toBe(true);
  expect(replay.counterexample).toEqual(result.counterexample);
});
