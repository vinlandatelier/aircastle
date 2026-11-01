import { describe, test } from "vite-plus/test";
import { blocks, list, object, text } from "../../src/index.ts";
import { compileCollection } from "../support/collections.ts";
import {
  expectFailure,
  expectOwnKeys,
  expectSchemaError,
  expectSuccess,
} from "../support/assertions.ts";

const layout = () =>
  blocks({
    hero: object({ heading: text() }),
    quote: object({ text: text(), by: text().optional() }),
  });
const allowed = ["hero", "quote"];

describe("block values", () => {
  test("K1: a valid block validates unchanged and validate adds no id", () => {
    const result = compileCollection({ layout: layout() }).validate({
      layout: [{ type: "hero", heading: "Hi" }],
    });
    expectSuccess(result, { layout: [{ type: "hero", heading: "Hi" }] });
    expectOwnKeys((result as unknown as { data: { layout: object[] } }).data.layout[0]!, [
      "type",
      "heading",
    ]);
  });

  test("blocks of different variants validate in order", () => {
    const value = [
      { type: "quote", text: "Q", by: "Ada" },
      { type: "hero", heading: "H" },
      { type: "quote", text: "R" },
    ];
    expectSuccess(compileCollection({ layout: layout() }).validate({ layout: value }), {
      layout: [
        { type: "quote", text: "Q", by: "Ada" },
        { type: "hero", heading: "H" },
        { type: "quote", text: "R" },
      ],
    });
  });

  test("a required blocks field accepts an empty array", () => {
    expectSuccess(compileCollection({ layout: layout() }).validate({ layout: [] }), {
      layout: [],
    });
  });

  test.for([
    [{ type: "banner" }],
    [{ heading: "Hi" }],
    [{ type: 1 }],
    [{ type: null, heading: "Hi" }],
    [{ type: "constructor" }],
    [{ type: "__proto__" }],
    [{ type: "Hero", heading: "Hi" }],
  ])("K2: %o is invalid_block_type at the item path with no further item issues", ([item]) => {
    expectFailure(compileCollection({ layout: layout() }).validate({ layout: [item] }), [
      { code: "invalid_block_type", path: ["layout", 0], allowed },
    ]);
  });

  test("invalid_block_type stops the item before id, field and unknown key checks", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [{ type: "banner", id: "", heading: 5, extra: 1 }],
      }),
      [{ code: "invalid_block_type", path: ["layout", 0], allowed }],
    );
  });

  test("invalid_block_type lists variants in declaration order", () => {
    const collection = compileCollection({
      layout: blocks({ quote: object({ text: text() }), hero: object({ heading: text() }) }),
    });
    expectFailure(collection.validate({ layout: [{ type: "banner" }] }), [
      { code: "invalid_block_type", path: ["layout", 0], allowed: ["quote", "hero"] },
    ]);
  });

  test.for([
    ["x", "string"],
    [5, "number"],
    [null, "null"],
    [[], "array"],
  ] as const)("a non-object item %o is invalid_type expected object", ([item, received]) => {
    expectFailure(compileCollection({ layout: layout() }).validate({ layout: [item] }), [
      { code: "invalid_type", path: ["layout", 0], expected: "object", received },
    ]);
  });

  test("K3: keys outside the variant are unknown fields", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [{ type: "hero", heading: "Hi", text: "x" }],
      }),
      [{ code: "unknown_field", path: ["layout", 0, "text"] }],
    );
  });

  test("variant fields are validated at item paths", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [{ type: "hero" }, { type: "quote", text: 5 }],
      }),
      [
        { code: "required", path: ["layout", 0, "heading"] },
        {
          code: "invalid_type",
          path: ["layout", 1, "text"],
          expected: "string",
          received: "number",
        },
      ],
    );
  });

  test("an empty variant accepts only type and id", () => {
    const collection = compileCollection({ layout: blocks({ divider: object({}) }) });
    expectSuccess(
      collection.validate({ layout: [{ type: "divider" }, { type: "divider", id: "d" }] }),
      {
        layout: [{ type: "divider" }, { type: "divider", id: "d" }],
      },
    );
    expectFailure(collection.validate({ layout: [{ type: "divider", heading: "x" }] }), [
      { code: "unknown_field", path: ["layout", 0, "heading"] },
    ]);
  });

  test("variant field defaults apply per block", () => {
    const collection = compileCollection({
      layout: blocks({ quote: object({ text: text(), by: text().default("anon") }) }),
    });
    expectSuccess(
      collection.validate({
        layout: [
          { type: "quote", text: "a" },
          { type: "quote", text: "b", by: "Ada" },
          { type: "quote", text: "c" },
        ],
      }),
      {
        layout: [
          { type: "quote", text: "a", by: "anon" },
          { type: "quote", text: "b", by: "Ada" },
          { type: "quote", text: "c", by: "anon" },
        ],
      },
    );
  });
});

describe("blocks list semantics", () => {
  test.for([
    ["x", "string"],
    [{}, "object"],
    [7, "number"],
  ] as const)("a non-array %o is invalid_type expected array", ([value, received]) => {
    expectFailure(compileCollection({ layout: layout() }).validate({ layout: value }), [
      { code: "invalid_type", path: ["layout"], expected: "array", received },
    ]);
  });

  test("a sparse blocks array is invalid_list", () => {
    const sparse: unknown[] = [];
    sparse[1] = { type: "hero", heading: "Hi" };
    expectFailure(compileCollection({ layout: layout() }).validate({ layout: sparse }), [
      { code: "invalid_list", path: ["layout"] },
    ]);
  });

  test("a blocks array with an extra own property is invalid_list", () => {
    const value = Object.assign([{ type: "hero", heading: "Hi" }], { extra: true });
    expectFailure(compileCollection({ layout: layout() }).validate({ layout: value }), [
      { code: "invalid_list", path: ["layout"] },
    ]);
  });

  test("min and max bound the block count inclusively", () => {
    const collection = compileCollection({ layout: layout().min(1).max(2) });
    const hero = { type: "hero", heading: "Hi" };
    expectFailure(collection.validate({ layout: [] }), [
      { code: "too_few", path: ["layout"], minimum: 1, actual: 0 },
    ]);
    expectSuccess(collection.validate({ layout: [hero] }), { layout: [hero] });
    expectSuccess(collection.validate({ layout: [hero, hero] }), { layout: [hero, hero] });
    expectFailure(collection.validate({ layout: [hero, hero, hero] }), [
      { code: "too_many", path: ["layout"], maximum: 2, actual: 3 },
    ]);
  });
});

describe("block ids", () => {
  test("supplied ids are kept unchanged", () => {
    expectSuccess(
      compileCollection({ layout: layout() }).validate({
        layout: [
          { type: "hero", id: "b1", heading: "Hi" },
          { type: "hero", heading: "There" },
        ],
      }),
      {
        layout: [
          { type: "hero", id: "b1", heading: "Hi" },
          { type: "hero", heading: "There" },
        ],
      },
    );
  });

  test("an explicit undefined block id is treated as omitted", () => {
    const result = compileCollection({ layout: layout() }).validate({
      layout: [{ type: "hero", id: undefined, heading: "Hi" }],
    });
    expectSuccess(result, { layout: [{ type: "hero", heading: "Hi" }] });
    expectOwnKeys((result as unknown as { data: { layout: object[] } }).data.layout[0]!, [
      "type",
      "heading",
    ]);
  });

  test("K6: duplicate ids fail at the later block's id with the first index", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [
          { type: "hero", id: "b", heading: "Hi" },
          { type: "quote", id: "c", text: "Q" },
          { type: "quote", id: "b", text: "R" },
        ],
      }),
      [{ code: "duplicate_id", path: ["layout", 2, "id"], firstIndex: 0 }],
    );
  });

  test("ids in different blocks lists do not conflict", () => {
    const collection = compileCollection({ top: layout(), bottom: layout() });
    expectSuccess(
      collection.validate({
        top: [{ type: "hero", id: "b", heading: "1" }],
        bottom: [{ type: "hero", id: "b", heading: "2" }],
      }),
      {
        top: [{ type: "hero", id: "b", heading: "1" }],
        bottom: [{ type: "hero", id: "b", heading: "2" }],
      },
    );
  });

  test.for([
    [5, "number"],
    [null, "null"],
    [false, "boolean"],
    [["b"], "array"],
  ] as const)("a non-string id %o is invalid_type expected string", ([id, received]) => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [{ type: "hero", id, heading: "Hi" }],
      }),
      [{ code: "invalid_type", path: ["layout", 0, "id"], expected: "string", received }],
    );
  });

  test("an empty id is invalid_id", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [{ type: "hero", id: "", heading: "Hi" }],
      }),
      [{ code: "invalid_id", path: ["layout", 0, "id"] }],
    );
  });

  test("E8: a NUL in a block id is invalid_character at the id path", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [{ type: "hero", id: "b\u0000", heading: "Hi" }],
      }),
      [{ code: "invalid_character", path: ["layout", 0, "id"] }],
    );
  });

  test("block ids apply invalid_unicode then invalid_character", () => {
    const collection = compileCollection({ layout: layout() });
    expectFailure(
      collection.validate({ layout: [{ type: "hero", id: "\uDC00", heading: "Hi" }] }),
      [{ code: "invalid_unicode", path: ["layout", 0, "id"] }],
    );
    expectFailure(
      collection.validate({ layout: [{ type: "hero", id: "\uDC00\u0000", heading: "Hi" }] }),
      [
        { code: "invalid_unicode", path: ["layout", 0, "id"] },
        { code: "invalid_character", path: ["layout", 0, "id"] },
      ],
    );
  });

  test("a stopped block is not counted for duplicate ids", () => {
    expectFailure(
      compileCollection({ layout: layout() }).validate({
        layout: [
          { type: "banner", id: "b" },
          { type: "hero", id: "b", heading: "Hi" },
        ],
      }),
      [{ code: "invalid_block_type", path: ["layout", 0], allowed }],
    );
  });
});

describe("block presence and nesting", () => {
  test("optional, nullable and default blocks follow shared presence rules", () => {
    expectSuccess(compileCollection({ layout: layout().optional() }).validate({}), {});
    expectSuccess(compileCollection({ layout: layout().nullable() }).validate({ layout: null }), {
      layout: null,
    });
    expectFailure(compileCollection({ layout: layout() }).validate({ layout: null }), [
      { code: "invalid_type", path: ["layout"], expected: "array", received: "null" },
    ]);
    expectFailure(compileCollection({ layout: layout() }).validate({}), [
      { code: "required", path: ["layout"] },
    ]);
    const defaulted = compileCollection({
      layout: layout().default([{ type: "hero", heading: "Welcome" }]),
    });
    expectSuccess(defaulted.validate({}), { layout: [{ type: "hero", heading: "Welcome" }] });
  });

  test("blocks nest inside objects", () => {
    const collection = compileCollection({ page: object({ body: layout() }) });
    expectFailure(collection.validate({ page: { body: [{ type: "hero", heading: 1 }] } }), [
      {
        code: "invalid_type",
        path: ["page", "body", 0, "heading"],
        expected: "string",
        received: "number",
      },
    ]);
  });

  test("blocks nest inside lists", () => {
    const collection = compileCollection({ sections: list(layout()) });
    expectFailure(
      collection.validate({ sections: [[{ type: "hero", heading: "a" }], [{ type: "banner" }]] }),
      [{ code: "invalid_block_type", path: ["sections", 1, 0], allowed }],
    );
  });

  test("blocks nest inside other blocks", () => {
    const collection = compileCollection({
      layout: blocks({
        section: object({ children: layout() }),
        divider: object({}),
      }),
    });
    const value = [
      { type: "divider" },
      {
        type: "section",
        id: "s",
        children: [
          { type: "hero", id: "s", heading: "a" },
          { type: "quote", text: "b" },
        ],
      },
    ];
    expectSuccess(collection.validate({ layout: value }), {
      layout: [
        { type: "divider" },
        {
          type: "section",
          id: "s",
          children: [
            { type: "hero", id: "s", heading: "a" },
            { type: "quote", text: "b" },
          ],
        },
      ],
    });
    expectFailure(
      collection.validate({
        layout: [{ type: "section", children: [{ type: "quote", text: "b", extra: 1 }] }],
      }),
      [{ code: "unknown_field", path: ["layout", 0, "children", 0, "extra"] }],
    );
  });
});

describe("block declarations", () => {
  test("K4: an empty variant map is invalid_blocks reason empty", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({}) }),
      [{ code: "invalid_blocks", path: ["articles", "layout"], reason: "empty" }],
    );
  });

  test("K4: a non-object variant is invalid_blocks reason not_object", () => {
    expectSchemaError(
      () => compileCollection({ layout: blocks({ hero: text() as never }) }),
      [
        {
          code: "invalid_blocks",
          path: ["articles", "layout"],
          reason: "not_object",
          variant: "hero",
        },
      ],
    );
  });

  for (const field of ["type", "id"] as const) {
    test(`K4: a variant field named ${field} is invalid_blocks reason reserved_field`, () => {
      expectSchemaError(
        () => compileCollection({ layout: blocks({ hero: object({ [field]: text() }) }) }),
        [
          {
            code: "invalid_blocks",
            path: ["articles", "layout"],
            reason: "reserved_field",
            variant: "hero",
            field,
          },
        ],
      );
    });
  }
});
