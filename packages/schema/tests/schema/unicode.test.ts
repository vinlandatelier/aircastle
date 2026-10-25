import { beforeAll, describe, test } from "vite-plus/test";
import type { CompiledCollection } from "../../src/index.ts";
import { text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";
import { loadRuntimeGraphemeFixtures } from "../support/unicode.ts";

describe("Unicode fixtures under the approved Intl policy", () => {
  const fixtures = loadRuntimeGraphemeFixtures();
  type Compiled = CompiledCollection<Record<string, unknown>>;
  const collections = new Map<number, { exact: Compiled; shorter: Compiled; longer: Compiled }>();
  beforeAll(() => {
    for (const count of new Set(fixtures.map((fixture) => fixture.graphemes))) {
      collections.set(count, {
        exact: compileCollection({ body: text().min(count).max(count) }),
        shorter: compileCollection({ body: text().max(count - 1) }),
        longer: compileCollection({ body: text().min(count + 1) }),
      });
    }
  });
  for (const fixture of fixtures) {
    test(`reference line ${fixture.reference.line}`, () => {
      const { exact, shorter, longer } = collections.get(fixture.graphemes)!;
      expectSuccess(exact.validate({ body: fixture.reference.input }), {
        body: fixture.reference.input,
      });
      expectFailure(shorter.validate({ body: fixture.reference.input }), [
        {
          code: "too_long",
          path: ["body"],
          maximum: fixture.graphemes - 1,
          actual: fixture.graphemes,
          unit: "graphemes",
        },
      ]);
      expectFailure(longer.validate({ body: fixture.reference.input }), [
        {
          code: "too_short",
          path: ["body"],
          minimum: fixture.graphemes + 1,
          actual: fixture.graphemes,
          unit: "graphemes",
        },
      ]);
    });
  }
});
