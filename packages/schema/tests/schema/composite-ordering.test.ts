import { describe, expect, test } from "vite-plus/test";
import { blocks, list, number, object, text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import { expectFailure } from "../support/assertions.ts";

const variants = () =>
  blocks({
    hero: object({ heading: text(), level: number().int() }),
    quote: object({ text: text() }),
  });

describe("depth-first issue order", () => {
  test("a nested object's issues and unknown fields precede the next sibling field", () => {
    const collection = compileCollection({
      seo: object({ slug: text(), meta: object({ a: text() }) }),
      title: text(),
    });
    expectFailure(
      collection.validate({
        zeta: 1,
        title: 5,
        seo: { extra: 1, meta: { zz: 1, a: 2 }, slug: 3, alpha: 1 },
      }),
      [
        { code: "invalid_type", path: ["seo", "slug"], expected: "string", received: "number" },
        {
          code: "invalid_type",
          path: ["seo", "meta", "a"],
          expected: "string",
          received: "number",
        },
        { code: "unknown_field", path: ["seo", "meta", "zz"] },
        { code: "unknown_field", path: ["seo", "alpha"] },
        { code: "unknown_field", path: ["seo", "extra"] },
        { code: "invalid_type", path: ["title"], expected: "string", received: "number" },
        { code: "unknown_field", path: ["zeta"] },
      ],
    );
  });

  test("list items report in ascending index with each item's nested issues together", () => {
    const collection = compileCollection({
      rows: list(object({ a: text(), b: text() })),
      after: text(),
    });
    expectFailure(
      collection.validate({
        after: 1,
        rows: [{ b: 1, a: 2, z: 0 }, { a: "ok", b: "ok" }, { y: 1 }],
      }),
      [
        { code: "invalid_type", path: ["rows", 0, "a"], expected: "string", received: "number" },
        { code: "invalid_type", path: ["rows", 0, "b"], expected: "string", received: "number" },
        { code: "unknown_field", path: ["rows", 0, "z"] },
        { code: "required", path: ["rows", 2, "a"] },
        { code: "required", path: ["rows", 2, "b"] },
        { code: "unknown_field", path: ["rows", 2, "y"] },
        { code: "invalid_type", path: ["after"], expected: "string", received: "number" },
      ],
    );
  });

  test("ordering holds across object, list and blocks nesting", () => {
    const collection = compileCollection({
      page: object({
        sections: list(object({ layout: variants(), note: text() })),
        footer: text(),
      }),
      title: text(),
    });
    expectFailure(
      collection.validate({
        title: 0,
        page: {
          footer: 1,
          sections: [
            {
              note: 2,
              layout: [
                { type: "quote", text: 3, by: "x" },
                { type: "hero", heading: "h", level: 1.5 },
              ],
            },
            { layout: [{ type: "video" }], note: "n" },
          ],
        },
      }),
      [
        {
          code: "invalid_type",
          path: ["page", "sections", 0, "layout", 0, "text"],
          expected: "string",
          received: "number",
        },
        { code: "unknown_field", path: ["page", "sections", 0, "layout", 0, "by"] },
        { code: "not_integer", path: ["page", "sections", 0, "layout", 1, "level"] },
        {
          code: "invalid_type",
          path: ["page", "sections", 0, "note"],
          expected: "string",
          received: "number",
        },
        {
          code: "invalid_block_type",
          path: ["page", "sections", 1, "layout", 0],
          allowed: ["hero", "quote"],
        },
        { code: "invalid_type", path: ["page", "footer"], expected: "string", received: "number" },
        { code: "invalid_type", path: ["title"], expected: "string", received: "number" },
      ],
    );
  });
});

describe("list issue order", () => {
  test("invalid_type stops the list", () => {
    const collection = compileCollection({ tags: list(text()).min(2) });
    expectFailure(collection.validate({ tags: { 0: 1 } }), [
      { code: "invalid_type", path: ["tags"], expected: "array", received: "object" },
    ]);
  });

  test("invalid_list stops before count and item checks", () => {
    const collection = compileCollection({ tags: list(text()).min(5) });
    const sparse: unknown[] = [1];
    sparse[2] = 2;
    expectFailure(collection.validate({ tags: sparse }), [
      { code: "invalid_list", path: ["tags"] },
    ]);
    const extra = Object.assign([1], { note: 2 });
    expectFailure(collection.validate({ tags: extra }), [{ code: "invalid_list", path: ["tags"] }]);
  });

  test("too_few precedes item issues and both report", () => {
    expectFailure(compileCollection({ tags: list(text()).min(3) }).validate({ tags: ["a", 5] }), [
      { code: "too_few", path: ["tags"], minimum: 3, actual: 2 },
      { code: "invalid_type", path: ["tags", 1], expected: "string", received: "number" },
    ]);
  });

  test("too_many precedes item issues and both report", () => {
    expectFailure(
      compileCollection({ tags: list(text()).max(1) }).validate({ tags: [1, "b", 2] }),
      [
        { code: "too_many", path: ["tags"], maximum: 1, actual: 3 },
        { code: "invalid_type", path: ["tags", 0], expected: "string", received: "number" },
        { code: "invalid_type", path: ["tags", 2], expected: "string", received: "number" },
      ],
    );
  });

  test("blocks count issues precede block item issues", () => {
    expectFailure(
      compileCollection({ layout: variants().max(1) }).validate({
        layout: [{ type: "quote", text: 1 }, { type: "nope" }],
      }),
      [
        { code: "too_many", path: ["layout"], maximum: 1, actual: 2 },
        {
          code: "invalid_type",
          path: ["layout", 0, "text"],
          expected: "string",
          received: "number",
        },
        { code: "invalid_block_type", path: ["layout", 1], allowed: ["hero", "quote"] },
      ],
    );
  });
});

describe("block item issue order", () => {
  test("invalid_type stops a block item", () => {
    expectFailure(
      compileCollection({ layout: variants() }).validate({
        layout: ["hero", { type: "quote", text: "q" }],
      }),
      [{ code: "invalid_type", path: ["layout", 0], expected: "object", received: "string" }],
    );
  });

  test("invalid_block_type stops a block item", () => {
    expectFailure(
      compileCollection({ layout: variants() }).validate({
        layout: [{ id: 5, heading: 1, extra: true }],
      }),
      [{ code: "invalid_block_type", path: ["layout", 0], allowed: ["hero", "quote"] }],
    );
  });

  test("id issues precede variant fields, which precede unknown keys", () => {
    expectFailure(
      compileCollection({ layout: variants() }).validate({
        layout: [{ zz: 1, level: "x", heading: 2, id: "", aa: 3, type: "hero" }],
      }),
      [
        { code: "invalid_id", path: ["layout", 0, "id"] },
        {
          code: "invalid_type",
          path: ["layout", 0, "heading"],
          expected: "string",
          received: "number",
        },
        {
          code: "invalid_type",
          path: ["layout", 0, "level"],
          expected: "number",
          received: "string",
        },
        { code: "unknown_field", path: ["layout", 0, "aa"] },
        { code: "unknown_field", path: ["layout", 0, "zz"] },
      ],
    );
  });

  test("duplicate_id precedes the later block's field issues", () => {
    expectFailure(
      compileCollection({ layout: variants() }).validate({
        layout: [
          { type: "quote", id: "b", text: "q" },
          { type: "hero", heading: 1, level: 1, id: "b", extra: 0 },
        ],
      }),
      [
        { code: "duplicate_id", path: ["layout", 1, "id"], firstIndex: 0 },
        {
          code: "invalid_type",
          path: ["layout", 1, "heading"],
          expected: "string",
          received: "number",
        },
        { code: "unknown_field", path: ["layout", 1, "extra"] },
      ],
    );
  });

  test("a block whose fields fail still counts for duplicate ids", () => {
    expectFailure(
      compileCollection({ layout: variants() }).validate({
        layout: [
          { type: "quote", id: "b", text: 1 },
          { type: "quote", id: "b", text: "q" },
        ],
      }),
      [
        {
          code: "invalid_type",
          path: ["layout", 0, "text"],
          expected: "string",
          received: "number",
        },
        { code: "duplicate_id", path: ["layout", 1, "id"], firstIndex: 0 },
      ],
    );
  });

  test("stopped blocks are not counted, so firstIndex names the first counted block", () => {
    expectFailure(
      compileCollection({ layout: variants() }).validate({
        layout: [
          { type: "nope", id: "b" },
          { type: "quote", id: "b", text: "q" },
          "x",
          { type: "quote", id: "b", text: "r" },
        ],
      }),
      [
        { code: "invalid_block_type", path: ["layout", 0], allowed: ["hero", "quote"] },
        { code: "invalid_type", path: ["layout", 2], expected: "object", received: "string" },
        { code: "duplicate_id", path: ["layout", 3, "id"], firstIndex: 1 },
      ],
    );
  });
});

describe("row issue order", () => {
  test("a row reports id issues before its fields and unknown keys", () => {
    expectFailure(
      compileCollection({ rows: list(object({ a: text() })) }).validate({
        rows: [{ z: 1, a: 1, id: 7 }],
      }),
      [
        { code: "invalid_type", path: ["rows", 0, "id"], expected: "string", received: "number" },
        { code: "invalid_type", path: ["rows", 0, "a"], expected: "string", received: "number" },
        { code: "unknown_field", path: ["rows", 0, "z"] },
      ],
    );
  });

  test("duplicate_id precedes the later row's field issues", () => {
    expectFailure(
      compileCollection({ rows: list(object({ a: text() })) }).validate({
        rows: [
          { a: "x", id: "r" },
          { z: 1, a: 1, id: "r" },
        ],
      }),
      [
        { code: "duplicate_id", path: ["rows", 1, "id"], firstIndex: 0 },
        { code: "invalid_type", path: ["rows", 1, "a"], expected: "string", received: "number" },
        { code: "unknown_field", path: ["rows", 1, "z"] },
      ],
    );
  });

  test("a stopped row is not counted for duplicate ids", () => {
    class Row {
      a = "x";
      id = "r";
    }
    expectFailure(
      compileCollection({ rows: list(object({ a: text() })) }).validate({
        rows: [new Row(), { a: "y", id: "r" }, { a: "z", id: "r" }],
      }),
      [
        { code: "invalid_object", path: ["rows", 0] },
        { code: "duplicate_id", path: ["rows", 2, "id"], firstIndex: 1 },
      ],
    );
  });
});

describe("number issue order inside composites", () => {
  test("not_integer precedes too_small and both report", () => {
    expectFailure(
      compileCollection({ scores: list(number().int().min(5)) }).validate({ scores: [2.5] }),
      [
        { code: "not_integer", path: ["scores", 0] },
        { code: "too_small", path: ["scores", 0], minimum: 5, actual: 2.5 },
      ],
    );
  });

  test("not_integer precedes too_large and both report", () => {
    expectFailure(
      compileCollection({ stats: object({ rank: number().int().max(1) }) }).validate({
        stats: { rank: 1.5 },
      }),
      [
        { code: "not_integer", path: ["stats", "rank"] },
        { code: "too_large", path: ["stats", "rank"], maximum: 1, actual: 1.5 },
      ],
    );
  });
});

describe("validation never mutates composite input", () => {
  test("nested input descriptors are unchanged after validation", () => {
    const seo = { a: "1" };
    const rows = [{ a: "x" }];
    const layout = [{ type: "quote", text: "q" }];
    const collection = compileCollection({
      seo: object({ a: text(), b: text().default("d") }),
      rows: list(object({ a: text(), b: text().default("d") })),
      layout: variants(),
    });
    collection.validate({ seo, rows, layout });
    expect(seo).toEqual({ a: "1" });
    expect(rows).toEqual([{ a: "x" }]);
    expect(layout).toEqual([{ type: "quote", text: "q" }]);
    expect(Object.hasOwn(rows[0]!, "id")).toBe(false);
    expect(Object.hasOwn(layout[0]!, "id")).toBe(false);
  });
});
