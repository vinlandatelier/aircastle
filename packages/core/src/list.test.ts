import type {
  CollectionDescription,
  ContentDocument,
  DocumentListQuery,
  Permission,
} from "@aircastle/contracts";
import { describe, expect, test } from "vite-plus/test";
import { createService, type ContentService, type ErrorSummary } from "./index.ts";
import {
  access,
  articles,
  contract,
  controlledStore,
  failOnReport,
  otherProject,
} from "./test-support/fixtures.ts";

const idOf = (number: number) => `00000000-0000-4000-8000-${number.toString().padStart(12, "0")}`;
const invalid = { ok: false, error: { code: "invalid_request" } };
const page = (documents: ContentDocument[], next: "more" | null) => ({
  ok: true,
  data: { documents, next: next === "more" ? expect.any(String) : null },
});

function article(number: number, fields: Record<string, string | null> = {}): ContentDocument {
  return {
    id: idOf(number),
    title: `t${number}`,
    slug: `s${number}`,
    status: "draft",
    ...fields,
  };
}

function service(
  documents: ContentDocument[],
  options: Parameters<typeof controlledStore>[0] = {},
) {
  const control = controlledStore({ documents: { articles: documents }, ...options });
  return { ...control, cms: createService(control.store, failOnReport) };
}

const list = (cms: ContentService, query: DocumentListQuery, collection = "articles") =>
  cms.list(access, collection, contract, query);

async function nextCursor(cms: ContentService, query: DocumentListQuery): Promise<string> {
  const result = await list(cms, query);
  expect(result).toEqual(page(expect.any(Array), "more"));
  if (!result.ok || result.data.next === null) throw new Error("Expected a next cursor");
  return result.data.next;
}

async function everyPage(cms: ContentService, query: DocumentListQuery, bound: number) {
  const collected: ContentDocument[] = [];
  let cursor: string | undefined;
  for (let index = 0; index < bound; index++) {
    const result = await list(cms, cursor === undefined ? query : { ...query, cursor });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return { collected, finished: false };
    expect(result.data.documents.length).toBeLessThanOrEqual(query.limit ?? 20);
    collected.push(...result.data.documents);
    if (result.data.next === null) return { collected, finished: true };
    cursor = result.data.next;
  }
  return { collected, finished: false };
}

describe("R7 pages and next", () => {
  test("an empty collection returns no documents and no next cursor", async () => {
    const { cms } = service([]);
    expect(await list(cms, {})).toEqual(page([], null));
  });

  test("without a limit a page holds 20 documents, newest first", async () => {
    const documents = Array.from({ length: 25 }, (_, index) => article(index + 1));
    const { cms } = service(documents);
    const newestFirst = [...documents].reverse();
    expect(await list(cms, {})).toEqual(page(newestFirst.slice(0, 20), "more"));
    const cursor = await nextCursor(cms, {});
    expect(await list(cms, { cursor })).toEqual(page(newestFirst.slice(20), null));
  });

  test("next is null exactly when no further documents match", async () => {
    const documents = [1, 2, 3, 4].map((number) => article(number));
    const { cms } = service(documents);
    expect(await list(cms, { limit: 4 })).toEqual(page([...documents].reverse(), null));
    expect(await list(cms, { limit: 5 })).toEqual(page([...documents].reverse(), null));
    expect(await list(cms, { limit: 3 })).toEqual(
      page([documents[3]!, documents[2]!, documents[1]!], "more"),
    );
  });

  test("a cursor continues with the following page and the last full page has no next", async () => {
    const documents = [1, 2, 3, 4].map((number) => article(number));
    const { cms } = service(documents);
    expect(await list(cms, { limit: 2 })).toEqual(page([documents[3]!, documents[2]!], "more"));
    const cursor = await nextCursor(cms, { limit: 2 });
    expect(await list(cms, { limit: 2, cursor })).toEqual(
      page([documents[1]!, documents[0]!], null),
    );
  });

  for (const limit of [0, 101, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
    test(`limit ${limit} returns invalid_request`, async () => {
      const { cms } = service([article(1)]);
      expect(await list(cms, { limit })).toEqual(invalid);
    });

  test("limits 1 and 100 are accepted", async () => {
    const documents = [1, 2].map((number) => article(number));
    const { cms } = service(documents);
    expect(await list(cms, { limit: 1 })).toEqual(page([documents[1]!], "more"));
    expect(await list(cms, { limit: 100 })).toEqual(page([documents[1]!, documents[0]!], null));
  });

  test("R13 a deleted cursor anchor continues from its recorded position", async () => {
    const documents = [1, 2, 3, 4].map((number) => article(number));
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { limit: 2 });
    expect(await cms.delete(access, "articles", contract, idOf(3))).toEqual({
      ok: true,
      data: { id: idOf(3) },
    });
    expect(await list(cms, { limit: 2, cursor })).toEqual(
      page([documents[1]!, documents[0]!], null),
    );
  });

  test("R13 a deleted cursor anchor in a field sort continues from its recorded value", async () => {
    const documents = [
      article(1, { title: "apple" }),
      article(2, { title: "Banana" }),
      article(3, { title: "cherry" }),
      article(4, { title: "date" }),
    ];
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { sort: "title", limit: 2 });
    expect(await cms.delete(access, "articles", contract, idOf(2))).toEqual({
      ok: true,
      data: { id: idOf(2) },
    });
    expect(await list(cms, { sort: "title", limit: 2, cursor })).toEqual(
      page([documents[2]!, documents[3]!], null),
    );
  });
});

describe("R7 R13 cursor binding", () => {
  const documents = [
    article(1, { title: "Alpha", status: "published" }),
    article(2, { title: "Beta", status: "published" }),
    article(3, { title: "Gamma" }),
    article(4, { title: "Delta", status: "published" }),
  ];
  const where = { status: "published", title: { contains: "a" } };
  const rest = [documents[1]!, documents[0]!];

  test("the cursor continues the same query", async () => {
    const { cms } = service(documents);
    expect(await list(cms, { where, limit: 1 })).toEqual(page([documents[3]!], "more"));
    const cursor = await nextCursor(cms, { where, limit: 1 });
    expect(await list(cms, { where, limit: 1, cursor })).toEqual(page([documents[1]!], "more"));
  });

  for (const [name, query] of [
    ["reordered filter keys", { where: { title: { contains: "a" }, status: "published" } }],
    [
      "a bare value written as is",
      { where: { status: { is: "published" }, title: { contains: "a" } } },
    ],
    ["a different limit", { where, limit: 5 }],
  ] as const)
    test(`the cursor stays valid with ${name}`, async () => {
      const { cms } = service(documents);
      const cursor = await nextCursor(cms, { where, limit: 1 });
      expect(await list(cms, { limit: 5, ...query, cursor })).toEqual(page(rest, null));
    });

  test("R13 an empty where shares a cursor with no where", async () => {
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { limit: 1 });
    expect(await list(cms, { where: {}, limit: 5, cursor })).toEqual(
      page([documents[2]!, documents[1]!, documents[0]!], null),
    );
  });

  test("the cursor is not bound to the contract identifier", async () => {
    const reader = `v1:${"2".repeat(64)}`;
    const { cms } = service(documents, { contracts: { [contract]: articles, [reader]: articles } });
    const cursor = await nextCursor(cms, { where, limit: 1 });
    expect(await cms.list(access, "articles", reader, { where, limit: 5, cursor })).toEqual(
      page(rest, null),
    );
  });

  for (const [name, query] of [
    ["a different filter value", { where: { status: "draft", title: { contains: "a" } } }],
    ["a missing filter", { where: { status: "published" } }],
    ["no filter", {}],
    [
      "an equivalent in filter",
      { where: { status: { in: ["published"] }, title: { contains: "a" } } },
    ],
    ["a sort", { where, sort: "title" }],
  ] as const)
    test(`the cursor is rejected with ${name}`, async () => {
      const { cms } = service(documents);
      const cursor = await nextCursor(cms, { where, limit: 1 });
      expect(await list(cms, { limit: 1, ...query, cursor })).toEqual(invalid);
    });

  test("in values keep their order in the cursor", async () => {
    const { cms } = service(documents);
    const ordered = { status: { in: ["published", "draft"] } };
    const cursor = await nextCursor(cms, { where: ordered, limit: 1 });
    expect(
      await list(cms, { where: { status: { in: ["draft", "published"] } }, limit: 1, cursor }),
    ).toEqual(invalid);
    expect(await list(cms, { where: ordered, limit: 1, cursor })).toEqual(
      page([documents[2]!], "more"),
    );
  });

  test("a sorted cursor is rejected with the opposite direction or another field", async () => {
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { sort: "title", limit: 1 });
    expect(await list(cms, { sort: "-title", limit: 1, cursor })).toEqual(invalid);
    expect(await list(cms, { sort: "slug", limit: 1, cursor })).toEqual(invalid);
    expect(await list(cms, { limit: 1, cursor })).toEqual(invalid);
    expect(await list(cms, { sort: "title", limit: 1, cursor })).toEqual(
      page([documents[1]!], "more"),
    );
  });

  test("a cursor from another collection is rejected", async () => {
    const { cms } = service(documents, {
      state: {
        revision: "two",
        collections: [
          { name: "articles", description: articles },
          { name: "pages", description: articles },
        ],
      },
    });
    const cursor = await nextCursor(cms, { limit: 1 });
    expect(await list(cms, { limit: 1, cursor }, "pages")).toEqual(invalid);
  });

  test("a cursor reused with another project is rejected", async () => {
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { where, limit: 1 });
    expect(
      await cms.list({ ...access, project: otherProject }, "articles", contract, {
        where,
        limit: 1,
        cursor,
      }),
    ).toEqual(invalid);
    expect(await list(cms, { where, limit: 5, cursor })).toEqual(page(rest, null));
  });

  test("reordering the operators inside one field keeps the cursor valid", async () => {
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, {
      where: { status: "published", title: { contains: "a", not: "Zeta" } },
      limit: 1,
    });
    expect(
      await list(cms, {
        where: { status: "published", title: { not: "Zeta", contains: "a" } },
        limit: 5,
        cursor,
      }),
    ).toEqual(page(rest, null));
  });

  const decoded = (cursor: string): Record<string, unknown> =>
    JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
  const encoded = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

  for (const order of [{}, { sort: "title" }] satisfies DocumentListQuery[])
    test(`an issued ${order.sort ?? "created"} cursor re-encoded unchanged still continues`, async () => {
      const { cms } = service(documents);
      const cursor = await nextCursor(cms, { ...order, limit: 1 });
      const original = await list(cms, { ...order, limit: 1, cursor });
      expect(original).toEqual(page(expect.any(Array), "more"));
      expect(await list(cms, { ...order, limit: 1, cursor: encoded(decoded(cursor)) })).toEqual(
        original,
      );
    });

  test("a cursor whose bytes are not UTF-8 returns invalid_request", async () => {
    const { cms } = service(documents);
    const cursor = Buffer.from([0x7b, 0xff, 0xfe, 0x7d]).toString("base64url");
    expect(await list(cms, { limit: 1, cursor })).toEqual(invalid);
  });

  test("a created-order cursor given a sort value returns invalid_request", async () => {
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { limit: 1 });
    const tampered = encoded({ ...decoded(cursor), s: "x" });
    expect(await list(cms, { limit: 1, cursor: tampered })).toEqual(invalid);
  });

  test("a field-sort cursor without its sort value returns invalid_request", async () => {
    const { cms } = service(documents);
    const cursor = await nextCursor(cms, { sort: "title", limit: 1 });
    const { s, ...withoutSort } = decoded(cursor);
    expect(s).toEqual(expect.any(String));
    const tampered = encoded(withoutSort);
    expect(await list(cms, { sort: "title", limit: 1, cursor: tampered })).toEqual(invalid);
  });

  for (const cursor of ["", "not-a-cursor", "e30", "!!!!", "eyJ2IjoxfQ"])
    test(`a malformed cursor ${JSON.stringify(cursor)} returns invalid_request`, async () => {
      const { cms } = service(documents);
      expect(await list(cms, { cursor })).toEqual(invalid);
    });
});

describe("R8 filter truth tables", () => {
  const documents = [
    article(1, { summary: "news", status: "published" }),
    article(2, { summary: "" }),
    article(3, { summary: null }),
    article(4),
    article(5, { summary: "News" }),
  ];
  const [d1, d2, d3, d4, d5] = documents as [
    ContentDocument,
    ContentDocument,
    ContentDocument,
    ContentDocument,
    ContentDocument,
  ];
  const table: [string, unknown, ContentDocument[]][] = [
    ["a bare value means is", { summary: "news" }, [d1]],
    ["is matches the exact value", { summary: { is: "news" } }, [d1]],
    ["is matches the empty string", { summary: { is: "" } }, [d2]],
    ["is is case-sensitive", { summary: { is: "News" } }, [d5]],
    ["is with an absent value matches nothing", { summary: { is: "absent" } }, []],
    ["not matches missing and null", { summary: { not: "news" } }, [d5, d4, d3, d2]],
    ["not of the empty string", { summary: { not: "" } }, [d5, d4, d3, d1]],
    ["in matches any listed value", { summary: { in: ["news", ""] } }, [d2, d1]],
    ["in with duplicates matches once", { summary: { in: ["news", "news"] } }, [d1]],
    ["empty true matches missing and null", { summary: { empty: true } }, [d4, d3]],
    ["empty false treats the empty string as a value", { summary: { empty: false } }, [d5, d2, d1]],
    ["contains ignores case", { summary: { contains: "EW" } }, [d5, d1]],
    ["contains skips missing, null and the empty string", { summary: { contains: "n" } }, [d5, d1]],
    [
      "operators on one field combine with AND",
      { summary: { not: "news", empty: false } },
      [d5, d2],
    ],
    ["fields combine with AND", { status: "published", summary: { contains: "n" } }, [d1]],
    ["not on a defaulted choice field", { status: { not: "published" } }, [d5, d4, d3, d2]],
    ["a value outside the choices matches nothing", { status: "archived" }, []],
    ["an empty where is no filter", {}, [d5, d4, d3, d2, d1]],
  ];
  for (const [name, where, expected] of table)
    test(name, async () => {
      const { cms } = service(documents);
      expect(await list(cms, { where })).toEqual(page(expected, null));
    });

  test("100 in values are accepted", async () => {
    const { cms } = service(documents);
    const values = [...Array.from({ length: 99 }, (_, index) => `v${index}`), "news"];
    expect(await list(cms, { where: { summary: { in: values } } })).toEqual(page([d1], null));
  });

  test("100 duplicate in values are accepted", async () => {
    const { cms } = service(documents);
    expect(
      await list(cms, { where: { summary: { in: Array.from({ length: 100 }, () => "news") } } }),
    ).toEqual(page([d1], null));
  });
});

describe("R8 R13 contains", () => {
  const documents = [
    article(1, { summary: "Éclair au chocolat" }),
    article(2, { summary: "café" }),
    article(3, { summary: "100%" }),
    article(4, { summary: "a_b" }),
    article(5, { summary: "back\\slash" }),
    article(6, { summary: "plain ab" }),
  ];
  const table: [string, string, number[]][] = [
    ["uppercase text matches a mixed-case value", "ÉCLAIR", [1]],
    ["lowercase text matches an uppercase value", "éclair", [1]],
    ["accents are not folded", "cafe", []],
    ["percent matches itself", "%", [3]],
    ["underscore matches itself", "_", [4]],
    ["an underscore pattern does not match other characters", "a_b", [4]],
    ["backslash matches itself", "\\", [5]],
    ["percent between letters matches nothing", "a%b", []],
  ];
  for (const [name, text, expected] of table)
    test(name, async () => {
      const { cms } = service(documents);
      expect(await list(cms, { where: { summary: { contains: text } } })).toEqual(
        page(expected.map((number) => documents[number - 1]!).reverse(), null),
      );
    });
});

describe("R8 R13 filter errors", () => {
  const table: [string, unknown][] = [
    ["a non-object where", "status"],
    ["an array where", []],
    ["a null where", null],
    ["a null bare value", { summary: null }],
    ["a null is value", { summary: { is: null } }],
    ["null inside in", { summary: { in: ["a", null] } }],
    ["a null empty flag", { summary: { empty: null } }],
    ["a number bare value", { summary: 5 }],
    ["a boolean is value", { summary: { is: true } }],
    ["a non-boolean empty flag", { summary: { empty: "yes" } }],
    ["a non-string contains value", { summary: { contains: 5 } }],
    ["a non-array in value", { summary: { in: "news" } }],
    ["an array bare value", { summary: ["news"] }],
    ["an unknown operator", { summary: { like: "news" } }],
    ["an unknown operator beside a known one", { summary: { is: "news", like: "news" } }],
    ["an empty operator object", { summary: {} }],
    ["an empty in list", { summary: { in: [] } }],
    ["101 in values", { summary: { in: Array.from({ length: 101 }, (_, index) => `v${index}`) } }],
    ["101 duplicate in values", { summary: { in: Array.from({ length: 101 }, () => "news") } }],
    ["an empty contains string", { summary: { contains: "" } }],
    ["NUL in a bare value", { summary: "a\u0000b" }],
    ["NUL in contains", { summary: { contains: "\u0000" } }],
    ["an unpaired high surrogate", { summary: { is: "a\ud800" } }],
    ["an unpaired low surrogate in in", { summary: { in: ["\udc00"] } }],
    ["an unpaired surrogate in not", { summary: { not: "\ud800b" } }],
    ["a lone low surrogate after text", { summary: { is: "a\udc00" } }],
    ["a number where", 5],
    ["a boolean where", true],
    ["an unknown field", { unknown: "x" }],
    ["the id field", { id: "00000000-0000-4000-8000-000000000001" }],
    ["a dotted path", { "title.text": "x" }],
  ];
  for (const [name, where] of table)
    test(`${name} returns invalid_request`, async () => {
      const { cms } = service([article(1, { summary: "news" })]);
      expect(await list(cms, { where })).toEqual(invalid);
    });

  test("a surrogate pair is a valid filter value", async () => {
    const emoji = article(1, { summary: "😀" });
    const { cms } = service([emoji, article(2, { summary: "news" })]);
    expect(await list(cms, { where: { summary: "😀" } })).toEqual(page([emoji], null));
  });

  test("a field outside the client contract returns invalid_request", async () => {
    const old: CollectionDescription = {
      fields: { title: articles.fields.title!, slug: articles.fields.slug! },
    };
    const { cms } = service([article(1, { summary: "news" })], { contracts: { [contract]: old } });
    expect(await list(cms, { where: { summary: "news" } })).toEqual(invalid);
    expect(await list(cms, { where: { title: "t1" } })).toEqual(
      page([{ id: idOf(1), title: "t1", slug: "s1" }], null),
    );
  });
});

describe("R9 sorting", () => {
  const documents = [
    article(1, { summary: "zebra" }),
    article(2, { summary: "apple" }),
    article(3, { summary: null }),
    article(4, { summary: "Éclair" }),
    article(5),
    article(6, { summary: "Banana" }),
    article(7, { summary: "item10" }),
    article(8, { summary: "item2" }),
    article(9, { summary: "item1" }),
    article(10, { summary: "" }),
    article(11, { summary: null }),
  ];
  const at = (numbers: number[]) => numbers.map((number) => documents[number - 1]!);

  test("ascending uses the root collation with missing and null last, newest first", async () => {
    const { cms } = service(documents);
    expect(await list(cms, { sort: "summary" })).toEqual(
      page(at([10, 2, 6, 4, 9, 7, 8, 1, 11, 5, 3]), null),
    );
  });

  test("descending reverses values with missing and null still last, newest first", async () => {
    const { cms } = service(documents);
    expect(await list(cms, { sort: "-summary" })).toEqual(
      page(at([1, 8, 7, 9, 4, 6, 2, 10, 11, 5, 3]), null),
    );
  });

  test("sorted pages continue through values and empties", async () => {
    const { cms } = service(documents);
    const result = await everyPage(cms, { sort: "-summary", limit: 3 }, 10);
    expect(result).toEqual({
      collected: at([1, 8, 7, 9, 4, 6, 2, 10, 11, 5, 3]),
      finished: true,
    });
  });

  test("equal values come newest first in both directions", async () => {
    const tied = [
      article(1, { summary: "same" }),
      article(2, { summary: "same" }),
      article(3, { summary: "other" }),
      article(4, { summary: "same" }),
    ];
    const { cms } = service(tied);
    expect(await list(cms, { sort: "summary" })).toEqual(
      page([tied[2]!, tied[3]!, tied[1]!, tied[0]!], null),
    );
    expect(await list(cms, { sort: "-summary" })).toEqual(
      page([tied[3]!, tied[1]!, tied[0]!, tied[2]!], null),
    );
    expect(await everyPage(cms, { sort: "-summary", limit: 1 }, 6)).toEqual({
      collected: [tied[3]!, tied[1]!, tied[0]!, tied[2]!],
      finished: true,
    });
  });

  test("a sort combines with a filter", async () => {
    const { cms } = service(documents);
    expect(await list(cms, { where: { summary: { contains: "item" } }, sort: "-summary" })).toEqual(
      page(at([8, 7, 9]), null),
    );
  });

  for (const sort of [
    "",
    "-",
    "--summary",
    "+summary",
    "summary-",
    " summary",
    "summary ",
    "1summary",
    "id",
    "-id",
    "unknown",
    "-unknown",
    "title.text",
    "summary,title",
  ])
    test(`sort ${JSON.stringify(sort)} returns invalid_request`, async () => {
      const { cms } = service(documents);
      expect(await list(cms, { sort })).toEqual(invalid);
    });

  test("a sort field outside the client contract returns invalid_request", async () => {
    const old: CollectionDescription = {
      fields: { title: articles.fields.title!, slug: articles.fields.slug! },
    };
    const { cms } = service(documents, { contracts: { [contract]: old } });
    expect(await list(cms, { sort: "-summary" })).toEqual(invalid);
  });
});

describe("R10 page projection and stored data", () => {
  const stricter: CollectionDescription = {
    fields: { ...articles.fields, title: { ...articles.fields.title!, min: 5 } },
  };
  const fits = article(2, { title: "Hello" });
  const misfit = article(1, { title: "Hi" });
  const corrupt = { id: idOf(3), title: "Broken", slug: "broken" };

  test("documents are projected to an older client contract", async () => {
    const old: CollectionDescription = {
      fields: { title: articles.fields.title!, slug: articles.fields.slug! },
    };
    const { cms } = service([article(1, { summary: "kept" })], { contracts: { [contract]: old } });
    expect(await list(cms, {})).toEqual(page([{ id: idOf(1), title: "t1", slug: "s1" }], null));
  });

  test("one document that does not fit the client contract fails the page", async () => {
    const { cms } = service([misfit, fits], { contracts: { [contract]: stricter } });
    expect(await list(cms, {})).toEqual({ ok: false, error: { code: "schema_mismatch" } });
  });

  test("a misfit document off the returned page is not checked", async () => {
    const { cms } = service([misfit, fits], { contracts: { [contract]: stricter } });
    expect(await list(cms, { limit: 1 })).toEqual(page([fits], "more"));
  });

  test("a corrupt document on the page is a reported internal_error", async () => {
    const { store } = controlledStore({ documents: { articles: [fits, corrupt] } });
    const reported: ErrorSummary[] = [];
    const cms = createService(store, (error) => reported.push(error));
    expect(await list(cms, {})).toEqual({ ok: false, error: { code: "internal_error" } });
    expect(reported).toHaveLength(1);
  });

  test("a corrupt document off the returned page is ignored", async () => {
    const { cms } = service([corrupt, fits]);
    expect(await list(cms, { limit: 1 })).toEqual(page([fits], "more"));
  });

  test("internal_error takes precedence over schema_mismatch on the same page", async () => {
    const { store } = controlledStore({
      documents: { articles: [corrupt, misfit] },
      contracts: { [contract]: stricter },
    });
    const reported: ErrorSummary[] = [];
    const cms = createService(store, (error) => reported.push(error));
    expect(await list(cms, {})).toEqual({ ok: false, error: { code: "internal_error" } });
    expect(reported).toHaveLength(1);
  });
});

describe("R10 R13 access, collection and contract", () => {
  test("list checks the content:read permission", async () => {
    const { cms, observations } = service([article(1)]);
    expect(await list(cms, {})).toEqual(page([article(1)], null));
    expect(observations.authorization.map((entry) => entry.permission)).toEqual(["content:read"]);
  });

  test("a key without content:read is forbidden", async () => {
    const authorization = (permission: Permission) =>
      permission === "content:read" ? "forbidden" : "authorized";
    const { cms, observations } = service([article(1)], { authorization });
    expect(await list(cms, {})).toEqual({ ok: false, error: { code: "forbidden" } });
    expect(observations.authorization.map((entry) => entry.permission)).toEqual(["content:read"]);
  });

  test("a missing API key is unauthorized", async () => {
    const { cms } = service([article(1)]);
    expect(await cms.list({ ...access, apiKey: "" }, "articles", contract, {})).toEqual({
      ok: false,
      error: { code: "unauthorized" },
    });
  });

  test("an unknown collection returns not_found before contract and query meaning", async () => {
    const { cms } = service([article(1)], { contracts: {} });
    expect(await cms.list(access, "missing", contract, { where: { unknown: "x" } })).toEqual({
      ok: false,
      error: { code: "not_found" },
    });
  });

  for (const sort of ["x.title", "title.x"])
    test(`R13 sort syntax ${JSON.stringify(sort)} returns invalid_request before an unknown collection`, async () => {
      const { cms } = service([article(1)]);
      expect(await cms.list(access, "missing", contract, { sort })).toEqual(invalid);
    });

  test("an unknown contract returns schema_mismatch before query meaning", async () => {
    const { cms } = service([article(1)], { contracts: {} });
    expect(await list(cms, {})).toEqual({ ok: false, error: { code: "schema_mismatch" } });
    expect(await list(cms, { where: { unknown: "x" }, sort: "unknown" })).toEqual({
      ok: false,
      error: { code: "schema_mismatch" },
    });
  });
});

const words = [
  "",
  "apple",
  "Banana",
  "cherry",
  "Éclair",
  "item1",
  "item10",
  "item2",
  "zebra",
] as const;
type Word = (typeof words)[number];
const lowered: Record<Word, string> = {
  "": "",
  apple: "apple",
  Banana: "banana",
  cherry: "cherry",
  Éclair: "éclair",
  item1: "item1",
  item10: "item10",
  item2: "item2",
  zebra: "zebra",
};
const needles = {
  a: "a",
  AN: "an",
  é: "é",
  É: "é",
  item1: "item1",
  "1": "1",
  e: "e",
  zz: "zz",
} as const;
type Needle = keyof typeof needles;
type Stored = Word | null | undefined;
type Condition =
  | { operator: "is" | "not"; value: Word }
  | { operator: "in"; values: Word[] }
  | { operator: "empty"; empty: boolean }
  | { operator: "contains"; text: Needle };
const fieldNames = ["first", "second"] as const;
type FieldName = (typeof fieldNames)[number];

const notes: CollectionDescription = {
  fields: {
    first: { type: "text", required: false, nullable: true, unique: false },
    second: { type: "text", required: false, nullable: true, unique: false },
  },
};

function matches(value: Stored, condition: Condition): boolean {
  const present = typeof value === "string";
  switch (condition.operator) {
    case "is":
      return present && value === condition.value;
    case "not":
      return !(present && value === condition.value);
    case "in":
      return present && condition.values.includes(value);
    case "empty":
      return condition.empty ? !present : present;
    case "contains":
      return present && lowered[value].includes(needles[condition.text]);
  }
}

function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const below = (bound: number) => Math.floor(next() * bound);
  const pick = <Value>(values: readonly Value[]): Value => values[below(values.length)]!;
  return { below, pick };
}

describe("R7 R8 R9 property", () => {
  test("concatenated pages equal a hand-written model of filters and sort", async () => {
    const seed = 20261101;
    console.log(`list property seed ${seed}`);
    const { below, pick } = random(seed);
    const options: Stored[] = [...words, null, undefined];
    for (let iteration = 0; iteration < 150; iteration++) {
      const count = below(11);
      const documents: ContentDocument[] = Array.from({ length: count }, (_, index) => {
        const document: ContentDocument = { id: idOf(index + 1) };
        for (const field of fieldNames) {
          const value = pick(options);
          if (value !== undefined) document[field] = value;
        }
        return document;
      });
      const conditions: { field: FieldName; condition: Condition }[] = [];
      const where: Record<string, unknown> = {};
      for (const field of fieldNames) {
        if (below(2) === 0) continue;
        const operators = [...(["is", "not", "in", "empty", "contains"] as const)];
        const chosen = Array.from(
          { length: 1 + below(2) },
          () => operators.splice(below(operators.length), 1)[0]!,
        );
        const object: Record<string, unknown> = {};
        for (const operator of chosen) {
          const condition: Condition =
            operator === "in"
              ? { operator, values: Array.from({ length: 1 + below(3) }, () => pick(words)) }
              : operator === "empty"
                ? { operator, empty: below(2) === 0 }
                : operator === "contains"
                  ? { operator, text: pick(Object.keys(needles) as Needle[]) }
                  : { operator, value: pick(words) };
          conditions.push({ field, condition });
          object[operator] =
            condition.operator === "in"
              ? condition.values
              : condition.operator === "empty"
                ? condition.empty
                : condition.operator === "contains"
                  ? condition.text
                  : condition.value;
        }
        where[field] =
          chosen.length === 1 && chosen[0] === "is" && below(2) === 0 ? object.is : object;
      }
      const sortField = pick([undefined, ...fieldNames]);
      const descending = below(2) === 0;
      const limit = 1 + below(4);
      const expected = documents
        .map((document, created) => ({ document, created }))
        .filter(({ document }) =>
          conditions.every(({ field, condition }) => matches(document[field] as Stored, condition)),
        )
        .sort((left, right) => {
          const newerFirst = right.created - left.created;
          if (sortField === undefined) return newerFirst;
          const leftValue = left.document[sortField] as Stored;
          const rightValue = right.document[sortField] as Stored;
          const leftRank = typeof leftValue === "string" ? words.indexOf(leftValue) : undefined;
          const rightRank = typeof rightValue === "string" ? words.indexOf(rightValue) : undefined;
          if (leftRank === undefined && rightRank === undefined) return newerFirst;
          if (leftRank === undefined) return 1;
          if (rightRank === undefined) return -1;
          const byValue = descending ? rightRank - leftRank : leftRank - rightRank;
          return byValue === 0 ? newerFirst : byValue;
        })
        .map(({ document }) => document);
      const query: DocumentListQuery = {
        where,
        limit,
        ...(sortField === undefined ? {} : { sort: descending ? `-${sortField}` : sortField }),
      };
      const { store } = controlledStore({
        state: { revision: "notes", collections: [{ name: "notes", description: notes }] },
        contracts: { [contract]: notes },
        documents: { notes: documents },
      });
      const cms = createService(store, failOnReport);
      const collected: ContentDocument[] = [];
      let cursor: string | undefined;
      let finished = false;
      for (let index = 0; index <= count + 1 && !finished; index++) {
        const result = await cms.list(
          access,
          "notes",
          contract,
          cursor === undefined ? query : { ...query, cursor },
        );
        expect(
          result,
          `seed ${seed} iteration ${iteration} ${JSON.stringify(query)}`,
        ).toMatchObject({ ok: true });
        if (!result.ok) break;
        expect(result.data.documents.length).toBeLessThanOrEqual(limit);
        collected.push(...result.data.documents);
        if (result.data.next === null) finished = true;
        else cursor = result.data.next;
      }
      expect(
        { finished, collected },
        `seed ${seed} iteration ${iteration} ${JSON.stringify(query)}`,
      ).toEqual({ finished: true, collected: expected });
    }
  });
});
