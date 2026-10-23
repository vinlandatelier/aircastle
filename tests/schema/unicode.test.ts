import { beforeAll, describe, test } from "bun:test";
import type { CompiledCollection } from "../../src/index.ts";
import { compileCollection, requireSchemaApi } from "../support/api.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";
import { loadRuntimeGraphemeFixtures } from "../support/unicode.ts";

describe("Unicode fixtures under the approved Intl policy", () => {
  const fixtures = loadRuntimeGraphemeFixtures();
  type Compiled = CompiledCollection<Record<string, unknown>>;
  const collections = new Map<number, { exact: Compiled; shorter: Compiled; longer: Compiled }>();
  beforeAll(() => {
    const api = requireSchemaApi();
    for (const count of new Set(fixtures.map((fixture) => fixture.graphemes))) {
      collections.set(count, {
        exact: compileCollection(api, { body: api.text().min(count).max(count) }),
        shorter: compileCollection(api, { body: api.text().max(count - 1) }),
        longer: compileCollection(api, { body: api.text().min(count + 1) }),
      });
    }
  });
  for (const fixture of fixtures) {
    test(`reference line ${fixture.reference.line}`, () => {
      const { exact, shorter, longer } = collections.get(fixture.graphemes)!;
      expectSuccess(exact.validate({ body: fixture.reference.input }), { body: fixture.reference.input });
      expectFailure(shorter.validate({ body: fixture.reference.input }), [{
        code: "too_long", path: ["body"], maximum: fixture.graphemes - 1, actual: fixture.graphemes, unit: "graphemes",
      }]);
      expectFailure(longer.validate({ body: fixture.reference.input }), [{
        code: "too_short", path: ["body"], minimum: fixture.graphemes + 1, actual: fixture.graphemes, unit: "graphemes",
      }]);
    });
  }
});
