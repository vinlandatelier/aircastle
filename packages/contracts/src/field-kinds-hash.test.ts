import { createHash } from "node:crypto";
import { boolean, collection, type CollectionDescription } from "@aircastle/schema";
import { describe, expect, test } from "vite-plus/test";
import { canonicalContract, contractId, describeCollections, sameSchema } from "./index.ts";
import { freezeDeep } from "./support/fixtures.ts";

const vectors: readonly {
  name: string;
  input: CollectionDescription;
  bytes: string;
  digest: string;
}[] = [
  {
    name: "integer number with bounds",
    input: {
      fields: {
        rating: {
          type: "number",
          required: true,
          nullable: false,
          integer: true,
          min: 1,
          max: 5,
        },
      },
    },
    bytes:
      '{"fields":{"rating":{"integer":true,"max":5,"min":1,"nullable":false,"required":true,"type":"number"}}}',
    digest: "e394e26b9eb2e0656dcd905be662738bcb89bb1d3d344904c52290ac60485c67",
  },
  {
    name: "boolean with the switch editor",
    input: {
      fields: {
        featured: { type: "boolean", required: true, nullable: false, editor: { type: "switch" } },
      },
    },
    bytes: '{"fields":{"featured":{"nullable":false,"required":true,"type":"boolean"}}}',
    digest: "ad96825cb5f870aba8e1b04a8c10c420102ac7f0159a95ff376b924fe105d092",
  },
  {
    name: "object whose nested fields carry editors",
    input: {
      fields: {
        seo: {
          type: "object",
          required: true,
          nullable: false,
          fields: {
            slug: {
              type: "text",
              required: true,
              nullable: false,
              unique: false,
              editor: { type: "textarea", rows: 3 },
            },
            pinned: {
              type: "boolean",
              required: true,
              nullable: false,
              editor: { type: "switch" },
            },
          },
        },
      },
    },
    bytes:
      '{"fields":{"seo":{"fields":{"pinned":{"nullable":false,"required":true,"type":"boolean"},"slug":{"nullable":false,"required":true,"type":"text","unique":false}},"nullable":false,"required":true,"type":"object"}}}',
    digest: "c48bd0717cef11fa527560710f36ee6640b45165b3bff471f1fb7e73319fd37a",
  },
  {
    name: "list whose item carries an editor",
    input: {
      fields: {
        tags: {
          type: "list",
          required: true,
          nullable: false,
          max: 10,
          item: {
            type: "text",
            required: true,
            nullable: false,
            unique: false,
            max: 30,
            editor: { type: "textarea", rows: 2 },
          },
        },
      },
    },
    bytes:
      '{"fields":{"tags":{"item":{"max":30,"nullable":false,"required":true,"type":"text","unique":false},"max":10,"nullable":false,"required":true,"type":"list"}}}',
    digest: "07938515b01bf8ff1b9503c685cdcfe6caa62f8e09920cdaca390ebe71d8f6d8",
  },
  {
    name: "blocks whose variant fields and list items carry editors",
    input: {
      fields: {
        layout: {
          type: "blocks",
          required: true,
          nullable: false,
          min: 1,
          variants: {
            hero: {
              type: "object",
              required: true,
              nullable: false,
              fields: {
                heading: {
                  type: "text",
                  required: true,
                  nullable: false,
                  unique: false,
                  editor: { type: "code", language: "typescript" },
                },
                flags: {
                  type: "list",
                  required: true,
                  nullable: false,
                  item: {
                    type: "boolean",
                    required: true,
                    nullable: false,
                    editor: { type: "switch" },
                  },
                },
              },
            },
          },
        },
      },
    },
    bytes:
      '{"fields":{"layout":{"min":1,"nullable":false,"required":true,"type":"blocks","variants":{"hero":{"fields":{"flags":{"item":{"nullable":false,"required":true,"type":"boolean"},"nullable":false,"required":true,"type":"list"},"heading":{"nullable":false,"required":true,"type":"text","unique":false}},"nullable":false,"required":true,"type":"object"}}}}}',
    digest: "8e7f1882e4971253a4bcc01414ec931c95559242291f97d0b708c35831aa31f0",
  },
  {
    name: "nested field named editor",
    input: {
      fields: {
        seo: {
          type: "object",
          required: true,
          nullable: false,
          fields: { editor: { type: "text", required: true, nullable: false, unique: false } },
        },
      },
    },
    bytes:
      '{"fields":{"seo":{"fields":{"editor":{"nullable":false,"required":true,"type":"text","unique":false}},"nullable":false,"required":true,"type":"object"}}}',
    digest: "fe5385eb72ff3588c6b432002d82305ede266b6ab68abcda2b5c3e6c857b2953",
  },
  {
    name: "json default containing editor keys",
    input: {
      fields: {
        meta: {
          type: "json",
          required: false,
          nullable: false,
          default: {
            item: { editor: 1 },
            fields: { x: { editor: "keep" } },
            editor: { type: "switch" },
            a: 1,
          },
        },
      },
    },
    bytes:
      '{"fields":{"meta":{"default":{"a":1,"editor":{"type":"switch"},"fields":{"x":{"editor":"keep"}},"item":{"editor":1}},"nullable":false,"required":false,"type":"json"}}}',
    digest: "a2aa8845f5fefeede786ae2615dadcc797d9d1ba8561c7dabf3b117960935ba5",
  },
  {
    name: "multi-reference keeps collection order",
    input: {
      fields: {
        related: {
          type: "reference",
          required: false,
          nullable: true,
          collections: ["pages", "articles"],
        },
      },
    },
    bytes:
      '{"fields":{"related":{"collections":["pages","articles"],"nullable":true,"required":false,"type":"reference"}}}',
    digest: "6545848e7c2bb1f056824233d85a23665ae06aeecf2774c97610b204ca7f9f21",
  },
  {
    name: "point default with sorted keys",
    input: {
      fields: {
        location: {
          type: "point",
          required: false,
          nullable: false,
          default: { lng: 151.21, lat: -33.86 },
        },
      },
    },
    bytes:
      '{"fields":{"location":{"default":{"lat":-33.86,"lng":151.21},"nullable":false,"required":false,"type":"point"}}}',
    digest: "9ced3c3bdbdaee54cb3b1e32e48526a5fb3e0028426ba12a08f2826b8d0f3dcb",
  },
  {
    name: "empty object",
    input: { fields: { seo: { type: "object", required: true, nullable: false, fields: {} } } },
    bytes: '{"fields":{"seo":{"fields":{},"nullable":false,"required":true,"type":"object"}}}',
    digest: "0014ebe68c02e82304f9b4db87d72a6ffd5979d9cb388255cb413d44e5ff6bb3",
  },
  {
    name: "text-only multi-field schema with an editor",
    input: {
      fields: {
        title: { type: "text", required: true, nullable: false, unique: false, min: 1 },
        slug: { type: "text", required: true, nullable: false, unique: true },
        summary: {
          type: "text",
          required: false,
          nullable: false,
          unique: false,
          editor: { type: "textarea", rows: 4 },
        },
        status: {
          type: "text",
          required: false,
          nullable: false,
          unique: false,
          choices: ["draft", "published"],
          default: "draft",
        },
      },
    },
    bytes:
      '{"fields":{"slug":{"nullable":false,"required":true,"type":"text","unique":true},"status":{"choices":["draft","published"],"default":"draft","nullable":false,"required":false,"type":"text","unique":false},"summary":{"nullable":false,"required":false,"type":"text","unique":false},"title":{"min":1,"nullable":false,"required":true,"type":"text","unique":false}}}',
    digest: "044a90d797f2b637b6e691354fc4e7978faa116d4a495434d8fceba16fb85fba",
  },
];

describe("contract identifiers for every field kind", () => {
  test.each(vectors)(
    "independent bytes for $name produce the pinned digest",
    ({ bytes, digest }) => {
      expect(createHash("sha256").update(bytes, "utf8").digest("hex")).toBe(digest);
    },
  );

  test.each(vectors)("$name has the pinned canonical bytes", ({ input, bytes }) => {
    expect(canonicalContract(input)).toBe(bytes);
  });

  test.each(vectors)("$name matches its pinned digest", async ({ input, digest }) => {
    expect(await contractId(input)).toBe(`v1:${digest}`);
  });

  test("canonicalization leaves frozen nested input unchanged", async () => {
    const input = freezeDeep(structuredClone(vectors[4]!.input));
    const before = structuredClone(input);
    await contractId(input);
    canonicalContract(input);
    expect(input).toEqual(before);
  });
});

describe("editors at depth", () => {
  const plainBoolean = "v1:ad96825cb5f870aba8e1b04a8c10c420102ac7f0159a95ff376b924fe105d092";

  test("the switch editor declared with builders keeps the plain boolean contract id", async () => {
    const [switched] = describeCollections({
      articles: collection({ featured: boolean().editor("switch") }),
    });
    const [plain] = describeCollections({ articles: collection({ featured: boolean() }) });
    expect(await contractId(switched!.description)).toBe(plainBoolean);
    expect(await contractId(plain!.description)).toBe(plainBoolean);
  });

  test("a nested field named editor changes the id of an otherwise empty object", async () => {
    const empty = vectors[9]!;
    const named = vectors[5]!;
    expect(await contractId(named.input)).not.toBe(await contractId(empty.input));
  });

  test("an editor key inside a json default changes the contract id", async () => {
    const withEditor: CollectionDescription = {
      fields: {
        meta: { type: "json", required: false, nullable: false, default: { editor: "x" } },
      },
    };
    const withoutEditor: CollectionDescription = {
      fields: { meta: { type: "json", required: false, nullable: false, default: {} } },
    };
    expect(await contractId(withEditor)).not.toBe(await contractId(withoutEditor));
  });

  test.each([
    [
      "nested minimum",
      {
        fields: {
          seo: {
            type: "object",
            required: true,
            nullable: false,
            fields: {
              slug: {
                type: "text",
                required: true,
                nullable: false,
                unique: false,
                min: 1,
                editor: { type: "textarea", rows: 3 },
              },
              pinned: {
                type: "boolean",
                required: true,
                nullable: false,
                editor: { type: "switch" },
              },
            },
          },
        },
      },
      vectors[2]!,
    ],
    [
      "list item nullability",
      {
        fields: {
          tags: {
            type: "list",
            required: true,
            nullable: false,
            max: 10,
            item: {
              type: "text",
              required: true,
              nullable: true,
              unique: false,
              max: 30,
              editor: { type: "textarea", rows: 2 },
            },
          },
        },
      },
      vectors[3]!,
    ],
    [
      "variant field presence",
      {
        fields: {
          layout: {
            type: "blocks",
            required: true,
            nullable: false,
            min: 1,
            variants: {
              hero: {
                type: "object",
                required: true,
                nullable: false,
                fields: {
                  heading: { type: "text", required: false, nullable: false, unique: false },
                  flags: {
                    type: "list",
                    required: true,
                    nullable: false,
                    item: { type: "boolean", required: true, nullable: false },
                  },
                },
              },
            },
          },
        },
      },
      vectors[4]!,
    ],
  ] as const)(
    "a data rule change at depth (%s) changes the id",
    async (_name, changed, original) => {
      expect(await contractId(changed as CollectionDescription)).not.toBe(`v1:${original.digest}`);
    },
  );
});

describe("schema sameness versus contract identity", () => {
  const seo = (order: readonly ("slug" | "title")[]): CollectionDescription => ({
    fields: {
      seo: {
        type: "object",
        required: true,
        nullable: false,
        fields: Object.fromEntries(
          order.map((name) => [
            name,
            { type: "text", required: true, nullable: false, unique: false },
          ]),
        ),
      },
    },
  });
  const layout = (order: readonly ("hero" | "quote")[]): CollectionDescription => ({
    fields: {
      layout: {
        type: "blocks",
        required: true,
        nullable: false,
        variants: Object.fromEntries(
          order.map((name) => [
            name,
            {
              type: "object",
              required: true,
              nullable: false,
              fields: { text: { type: "text", required: true, nullable: false, unique: false } },
            },
          ]),
        ),
      },
    },
  });
  const rows = (order: readonly ("a" | "b")[]): CollectionDescription => ({
    fields: {
      rows: {
        type: "list",
        required: true,
        nullable: false,
        item: {
          type: "object",
          required: true,
          nullable: false,
          fields: Object.fromEntries(
            order.map((name) => [
              name,
              { type: "number", required: true, nullable: false, integer: false },
            ]),
          ),
        },
      },
    },
  });

  test.each([
    ["object fields", seo(["slug", "title"]), seo(["title", "slug"])],
    ["block variants", layout(["hero", "quote"]), layout(["quote", "hero"])],
    ["list row fields", rows(["a", "b"]), rows(["b", "a"])],
  ])(
    "reordered %s are a different schema with the same contract id",
    async (_name, first, second) => {
      expect(
        sameSchema(
          [{ name: "articles", description: first }],
          [{ name: "articles", description: second }],
        ),
      ).toBe(false);
      expect(
        sameSchema(
          [{ name: "articles", description: first }],
          [{ name: "articles", description: structuredClone(first) }],
        ),
      ).toBe(true);
      expect(await contractId(first)).toBe(await contractId(second));
    },
  );
});
