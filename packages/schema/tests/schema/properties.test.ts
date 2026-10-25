import { describe, expect, test } from "vite-plus/test";
import fc from "fast-check";
import { text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";
import { propertyParameters } from "../support/properties.ts";

describe("generated schema laws", () => {
  const graphemes = fc
    .array(fc.constantFrom("a", "é", "e\u0301", "😀", "🇦🇺", "👨‍👩‍👧‍👦", " ", "\r\n", "\t"), {
      maxLength: 30,
    })
    .map((parts) => parts.join(""));
  const ascii = fc
    .array(fc.constantFrom("a", "b", " ", "\t", "\n"), { maxLength: 40 })
    .map((parts) => parts.join(""));

  test("accepted text is preserved and successful output validates again", () => {
    const collection = compileCollection({
      title: text(),
      subtitle: text().optional(),
      status: text().default("draft"),
    });
    fc.assert(
      fc.property(graphemes, (title) => {
        const result = collection.validate({ title, subtitle: undefined });
        expectSuccess(result, { title, status: "draft" });
        if (!result.ok) throw new Error("Generated valid document failed");
        expectSuccess(collection.validate(result.data), { title, status: "draft" });
      }),
      propertyParameters,
    );
  });

  test("ASCII boundaries use an independent count and compatible chains agree", () => {
    fc.assert(
      fc.property(
        ascii,
        fc.integer({ min: 0, max: 20 }),
        fc.integer({ min: 0, max: 20 }),
        (title, first, second) => {
          const min = Math.min(first, second);
          const max = Math.max(first, second);
          for (const field of [text().min(min).max(max), text().max(max).min(min)]) {
            const result = compileCollection({ title: field }).validate({ title });
            if (title.length < min)
              expectFailure(result, [
                {
                  code: "too_short",
                  path: ["title"],
                  minimum: min,
                  actual: title.length,
                  unit: "graphemes",
                },
              ]);
            else if (title.length > max)
              expectFailure(result, [
                {
                  code: "too_long",
                  path: ["title"],
                  maximum: max,
                  actual: title.length,
                  unit: "graphemes",
                },
              ]);
            else expectSuccess(result, { title });
          }
        },
      ),
      propertyParameters,
    );
  });

  test("tightening a valid maximum cannot introduce newly accepted values", () => {
    fc.assert(
      fc.property(graphemes, fc.integer({ min: 0, max: 20 }), (title, maximum) => {
        const tight = compileCollection({ title: text().max(maximum) });
        const loose = compileCollection({ title: text().max(maximum + 1) });
        const result = tight.validate({ title });
        if (result.ok) expectSuccess(loose.validate({ title }), { title });
      }),
      propertyParameters,
    );
  });

  test("omitted and explicit undefined both default without changing the input", () => {
    fc.assert(
      fc.property(graphemes, (fallback) => {
        const collection = compileCollection({
          title: text().optional().default(fallback),
        });
        const explicit = { title: undefined };
        expectSuccess(collection.validate({}), { title: fallback });
        expectSuccess(collection.validate(explicit), { title: fallback });
        expect(Object.hasOwn(explicit, "title")).toBe(true);
        expect(explicit.title).toBeUndefined();
      }),
      propertyParameters,
    );
  });

  test("generated lone UTF-16 surrogates are rejected before dependent rules", () => {
    const loneSurrogate = fc.oneof(
      fc.integer({ min: 0xd800, max: 0xdbff }).map((unit) => `a${String.fromCharCode(unit)}`),
      fc.integer({ min: 0xdc00, max: 0xdfff }).map((unit) => `${String.fromCharCode(unit)}a`),
    );
    const collection = compileCollection({ title: text().min(10).email() });
    fc.assert(
      fc.property(loneSurrogate, (title) => {
        expectFailure(collection.validate({ title }), [
          { code: "invalid_unicode", path: ["title"] },
        ]);
      }),
      propertyParameters,
    );
  });
});
