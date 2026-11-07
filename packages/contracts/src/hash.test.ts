import { describe, expect, test } from "vite-plus/test";
import { canonicalContract, contractId } from "./index.ts";
import { description, field, freezeDeep } from "./support/fixtures.ts";

const vectors = [
  {
    name: "empty collection",
    input: description({}),
    bytes: '{"fields":{}}',
    digest: "f35cd02cd97b67077a86f78eb15ec16044957e3420ff5787bcf1b5a715f40d06",
  },
  {
    name: "a legitimate field named editor",
    input: description({ editor: field() }),
    bytes: '{"fields":{"editor":{"nullable":false,"required":true,"type":"text","unique":false}}}',
    digest: "c958b885869fcd921fa5c47a65516e17462ef85110d61f9eff6ac8822f652152",
  },
  {
    name: "required text title",
    input: description(),
    bytes: '{"fields":{"title":{"nullable":false,"required":true,"type":"text","unique":false}}}',
    digest: "cba60446f99c12f7e6acb7ddb9ec8beb0a18584a5fb498bf7a6237f033119325",
  },
  {
    name: "choices kept as an ordered array",
    input: description({ title: field({ choices: ["draft", "published"] }) }),
    bytes:
      '{"fields":{"title":{"choices":["draft","published"],"nullable":false,"required":true,"type":"text","unique":false}}}',
    digest: "065b107c124ae608ff3de01c781b1309fa6759d7f966af8b8b93026f33762d36",
  },
];

describe("canonical data contract identifiers", () => {
  test.each(vectors)("$name has the pinned canonical bytes", ({ input, bytes }) => {
    expect(canonicalContract(input)).toBe(bytes);
  });

  test.each(vectors)("$name matches its independently pinned digest", async ({ input, digest }) => {
    expect(await contractId(input)).toBe(`v1:${digest}`);
  });

  test("editor-only changes leave the data identifier unchanged", async () => {
    const plain = description();
    const textarea = description({ title: field({ editor: { type: "textarea", rows: 8 } }) });
    const code = description({
      title: field({ editor: { type: "code", language: "typescript" } }),
    });
    expect(await contractId(textarea)).toBe(await contractId(plain));
    expect(await contractId(code)).toBe(await contractId(plain));
  });

  test("field and descriptor-key order do not change the data identifier", async () => {
    const first = description({ title: field(), summary: field({ required: false }) });
    const second = {
      fields: {
        summary: { unique: false, nullable: false, required: false, type: "text" as const },
        title: { unique: false, nullable: false, required: true, type: "text" as const },
      },
    };
    expect(await contractId(first)).toBe(await contractId(second));
  });

  test.each([
    ["field name", description({ subtitle: field() })],
    ["minimum", description({ title: field({ min: 1 }) })],
    ["maximum", description({ title: field({ max: 10 }) })],
    ["presence", description({ title: field({ required: false }) })],
    ["nullability", description({ title: field({ nullable: true }) })],
    ["uniqueness", description({ title: field({ unique: true }) })],
    ["format", description({ title: field({ format: "email" }) })],
    ["choices", description({ title: field({ choices: ["draft", "published"] }) })],
    ["default", description({ title: field({ required: false, default: "draft" }) })],
  ])("a changed %s changes the identifier", async (_name, changed) => {
    expect(await contractId(changed)).not.toBe(await contractId(description()));
  });

  test("explicit null default and absent default are distinct", async () => {
    const absent = description({ title: field({ required: false, nullable: true }) });
    const explicit = description({
      title: field({ required: false, nullable: true, default: null }),
    });
    expect(await contractId(absent)).not.toBe(await contractId(explicit));
  });

  test("choice-array order is preserved in canonical bytes", async () => {
    const first = description({ title: field({ choices: ["draft", "published"] }) });
    const second = description({ title: field({ choices: ["published", "draft"] }) });
    expect(await contractId(first)).not.toBe(await contractId(second));
  });

  test("Unicode spelling remains significant and frozen input is not changed", async () => {
    const decomposed = freezeDeep(description({ title: field({ choices: ["e\u0301"] }) }));
    const composed = description({ title: field({ choices: ["é"] }) });
    expect(await contractId(decomposed)).not.toBe(await contractId(composed));
    expect(decomposed.fields.title!.choices).toEqual(["e\u0301"]);
  });
});
