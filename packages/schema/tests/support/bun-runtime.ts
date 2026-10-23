import { deepStrictEqual, strictEqual } from "node:assert";
import { collection, compileSchema, text } from "../../src/index.ts";
import { loadRuntimeGraphemeFixtures } from "./unicode.ts";

const fixtures = loadRuntimeGraphemeFixtures();
strictEqual(fixtures.length, 1187);
for (const { reference, graphemes } of fixtures) {
  const exact = compileSchema({
    articles: collection({ body: text().min(graphemes).max(graphemes) }),
  });
  deepStrictEqual(exact.articles.validate({ body: reference.input }), {
    ok: true,
    data: { body: reference.input },
  });
  for (const [field, expected] of [
    [text().min(graphemes + 1), { code: "too_short", minimum: graphemes + 1 }],
    [text().max(graphemes - 1), { code: "too_long", maximum: graphemes - 1 }],
  ] as const) {
    const result = compileSchema({ articles: collection({ body: field }) }).articles.validate({
      body: reference.input,
    });
    strictEqual(result.ok, false);
    if (result.ok) throw new Error(`Expected length failure at Unicode line ${reference.line}`);
    deepStrictEqual(
      result.issues.map(({ message, ...issue }) => {
        strictEqual(typeof message, "string");
        return issue;
      }),
      [{ ...expected, path: ["body"], actual: graphemes, unit: "graphemes" }],
    );
  }
}
console.log(`Validated ${fixtures.length} Unicode fixtures under Bun`);
