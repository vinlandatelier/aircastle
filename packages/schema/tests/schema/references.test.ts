import { describe, expect, test } from "vite-plus/test";
import {
  blocks,
  collection,
  compileSchema,
  list,
  object,
  reference,
  text,
} from "../../src/index.ts";
import type { FieldDeclaration } from "../support/collections.ts";
import { expectFailure, expectSchemaError, expectSuccess } from "../support/assertions.ts";

function articlesWith(fields: Readonly<Record<string, FieldDeclaration>>) {
  return compileSchema({
    authors: collection({ name: text() }),
    articles: collection(fields),
  }).articles;
}

function withTargets(fields: Readonly<Record<string, FieldDeclaration>>) {
  return compileSchema({
    posts: collection({ title: text() }),
    pages: collection({ title: text() }),
    articles: collection(fields),
  }).articles;
}

describe("single references", () => {
  test("stores the target id string unchanged", () => {
    expectSuccess(articlesWith({ author: reference("authors") }).validate({ author: "a_123" }), {
      author: "a_123",
    });
  });

  test("R8: pure validate accepts an id with no stored document", () => {
    const articles = articlesWith({ author: reference("authors") });
    expectSuccess(articles.validate({ author: "00000000-0000-4000-8000-000000000000" }), {
      author: "00000000-0000-4000-8000-000000000000",
    });
    expectSuccess(articles.validate({ author: "not-a-uuid" }), { author: "not-a-uuid" });
  });

  test("R2: an empty id is invalid_reference", () => {
    expectFailure(articlesWith({ author: reference("authors") }).validate({ author: "" }), [
      { code: "invalid_reference", path: ["author"] },
    ]);
  });

  test.for([
    [5, "number"],
    [true, "boolean"],
    [{ id: "a" }, "object"],
    [["a"], "array"],
  ] as const)("R2: non-string %o is invalid_type expected string", ([value, received]) => {
    expectFailure(articlesWith({ author: reference("authors") }).validate({ author: value }), [
      { code: "invalid_type", path: ["author"], expected: "string", received },
    ]);
  });

  test("a missing required reference is required", () => {
    expectFailure(articlesWith({ author: reference("authors") }).validate({}), [
      { code: "required", path: ["author"] },
    ]);
  });

  test("null on a non-nullable reference is invalid_type expected string received null", () => {
    expectFailure(articlesWith({ author: reference("authors") }).validate({ author: null }), [
      { code: "invalid_type", path: ["author"], expected: "string", received: "null" },
    ]);
  });

  test("optional and nullable references follow shared presence rules", () => {
    expectSuccess(articlesWith({ author: reference("authors").optional() }).validate({}), {});
    expectSuccess(
      articlesWith({ author: reference("authors").nullable() }).validate({ author: null }),
      { author: null },
    );
    expectSuccess(
      articlesWith({ author: reference("authors").optional().nullable() }).validate({
        author: undefined,
      }),
      {},
    );
  });

  test("a reference builder has no default or editor modifier", () => {
    const builder = reference("authors");
    expect(Reflect.get(builder, "default")).toBeUndefined();
    expect(Reflect.get(builder, "editor")).toBeUndefined();
  });

  test("E8: a NUL in a reference id is invalid_character", () => {
    expectFailure(articlesWith({ author: reference("authors") }).validate({ author: "a\u0000" }), [
      { code: "invalid_character", path: ["author"] },
    ]);
  });

  test("reference ids apply invalid_unicode then invalid_character", () => {
    const articles = articlesWith({ author: reference("authors") });
    expectFailure(articles.validate({ author: "a\uD800" }), [
      { code: "invalid_unicode", path: ["author"] },
    ]);
    expectFailure(articles.validate({ author: "\uD800\u0000" }), [
      { code: "invalid_unicode", path: ["author"] },
      { code: "invalid_character", path: ["author"] },
    ]);
  });

  test("references inside lists and objects validate at nested paths", () => {
    const articles = articlesWith({
      coauthors: list(reference("authors")),
      credits: object({ editor: reference("authors") }),
    });
    expectSuccess(articles.validate({ coauthors: ["a1", "a2"], credits: { editor: "a3" } }), {
      coauthors: ["a1", "a2"],
      credits: { editor: "a3" },
    });
    expectFailure(articles.validate({ coauthors: ["a1", "", 3], credits: { editor: "" } }), [
      { code: "invalid_reference", path: ["coauthors", 1] },
      { code: "invalid_type", path: ["coauthors", 2], expected: "string", received: "number" },
      { code: "invalid_reference", path: ["credits", "editor"] },
    ]);
  });

  test("R7: a self-reference compiles and validates", () => {
    const pages = compileSchema({
      pages: collection({ title: text(), parent: reference("pages").nullable() }),
    }).pages;
    expectSuccess(pages.validate({ title: "Child", parent: "p_1" }), {
      title: "Child",
      parent: "p_1",
    });
    expectSuccess(pages.validate({ title: "Root", parent: null }), {
      title: "Root",
      parent: null,
    });
  });
});

describe("reference targets", () => {
  test("R1: an unknown target is unknown_collection at the field path", () => {
    expectSchemaError(
      () => articlesWith({ author: reference("nope") }),
      [{ code: "unknown_collection", path: ["articles", "author"], collection: "nope" }],
    );
  });

  test("E4: a config that omits a referenced collection throws unknown_collection", () => {
    expectSchemaError(
      () => compileSchema({ articles: collection({ author: reference("authors") }) }),
      [{ code: "unknown_collection", path: ["articles", "author"], collection: "authors" }],
    );
  });

  test("target names match collection names exactly", () => {
    expectSchemaError(
      () => articlesWith({ author: reference("Authors") }),
      [{ code: "unknown_collection", path: ["articles", "author"], collection: "Authors" }],
    );
  });

  test("a target declared after the referring collection is found", () => {
    const articles = compileSchema({
      articles: collection({ author: reference("authors") }),
      authors: collection({ name: text() }),
    }).articles;
    expectSuccess(articles.validate({ author: "a" }), { author: "a" });
  });

  test("unknown targets nested in objects, lists and variants use config paths", () => {
    expectSchemaError(
      () =>
        articlesWith({
          credits: object({ editor: reference("editors") }),
          coauthors: list(reference("writers")),
          layout: blocks({ quote: object({ by: reference("people") }) }),
        }),
      [
        {
          code: "unknown_collection",
          path: ["articles", "credits", "editor"],
          collection: "editors",
        },
        { code: "unknown_collection", path: ["articles", "coauthors"], collection: "writers" },
        {
          code: "unknown_collection",
          path: ["articles", "layout", "quote", "by"],
          collection: "people",
        },
      ],
    );
  });

  test("an unknown name in a multi-reference list reports its index", () => {
    expectSchemaError(
      () => withTargets({ related: reference(["posts", "nope"]) }),
      [{ code: "unknown_collection", path: ["articles", "related"], collection: "nope", index: 1 }],
    );
  });

  test("R6: an empty multi-reference list is invalid_references reason empty", () => {
    expectSchemaError(
      () => withTargets({ related: reference([] as never) }),
      [{ code: "invalid_references", path: ["articles", "related"], reason: "empty" }],
    );
  });

  test("R6: a repeated multi-reference name is invalid_references reason duplicate", () => {
    expectSchemaError(
      () => withTargets({ related: reference(["posts", "posts"]) }),
      [
        {
          code: "invalid_references",
          path: ["articles", "related"],
          reason: "duplicate",
          index: 1,
        },
      ],
    );
  });
});

describe("multi-collection references", () => {
  const related = () => reference(["posts", "pages"]);

  test("stores collection and id unchanged", () => {
    expectSuccess(
      withTargets({ related: related() }).validate({ related: { collection: "pages", id: "p1" } }),
      { related: { collection: "pages", id: "p1" } },
    );
  });

  test("pure validate accepts a target id with no stored document", () => {
    expectSuccess(
      withTargets({ related: related() }).validate({ related: { collection: "posts", id: "x" } }),
      { related: { collection: "posts", id: "x" } },
    );
  });

  test("a one-element list still uses the object shape", () => {
    expectSuccess(
      withTargets({ related: reference(["posts"]) }).validate({
        related: { collection: "posts", id: "p1" },
      }),
      { related: { collection: "posts", id: "p1" } },
    );
  });

  test("R5: an unlisted collection is invalid_choice at the collection path", () => {
    expectFailure(
      withTargets({ related: related() }).validate({ related: { collection: "users", id: "x" } }),
      [{ code: "invalid_choice", path: ["related", "collection"], allowed: ["posts", "pages"] }],
    );
  });

  test("a listed collection is matched exactly", () => {
    expectFailure(
      withTargets({ related: related() }).validate({ related: { collection: "Posts", id: "x" } }),
      [{ code: "invalid_choice", path: ["related", "collection"], allowed: ["posts", "pages"] }],
    );
  });

  test("a missing collection is invalid_choice", () => {
    expectFailure(withTargets({ related: related() }).validate({ related: { id: "x" } }), [
      { code: "invalid_choice", path: ["related", "collection"], allowed: ["posts", "pages"] },
    ]);
  });

  test("a non-string collection is invalid_type expected string", () => {
    expectFailure(
      withTargets({ related: related() }).validate({ related: { collection: 5, id: "x" } }),
      [
        {
          code: "invalid_type",
          path: ["related", "collection"],
          expected: "string",
          received: "number",
        },
      ],
    );
  });

  test("a missing id is required", () => {
    expectFailure(
      withTargets({ related: related() }).validate({ related: { collection: "posts" } }),
      [{ code: "required", path: ["related", "id"] }],
    );
  });

  test("extra keys are unknown fields", () => {
    expectFailure(
      withTargets({ related: related() }).validate({
        related: { collection: "posts", id: "x", title: "T" },
      }),
      [{ code: "unknown_field", path: ["related", "title"] }],
    );
  });

  test("collection and id are checked independently", () => {
    expectFailure(
      withTargets({ related: related() }).validate({ related: { collection: "users" } }),
      [
        { code: "invalid_choice", path: ["related", "collection"], allowed: ["posts", "pages"] },
        { code: "required", path: ["related", "id"] },
      ],
    );
    expectFailure(
      withTargets({ related: related() }).validate({
        related: { collection: 1, id: "x\u0000" },
      }),
      [
        {
          code: "invalid_type",
          path: ["related", "collection"],
          expected: "string",
          received: "number",
        },
        { code: "invalid_character", path: ["related", "id"] },
      ],
    );
  });

  test("multi-reference ids apply invalid_unicode then invalid_character", () => {
    expectFailure(
      withTargets({ related: related() }).validate({
        related: { collection: "posts", id: "\uD800\u0000" },
      }),
      [
        { code: "invalid_unicode", path: ["related", "id"] },
        { code: "invalid_character", path: ["related", "id"] },
      ],
    );
  });

  test("optional and nullable multi-references follow shared presence rules", () => {
    expectSuccess(withTargets({ related: related().optional() }).validate({}), {});
    expectSuccess(withTargets({ related: related().nullable() }).validate({ related: null }), {
      related: null,
    });
  });

  test("multi-references inside lists report item paths", () => {
    expectFailure(
      withTargets({ related: list(related()) }).validate({
        related: [
          { collection: "posts", id: "a" },
          { collection: "users", id: "b" },
        ],
      }),
      [
        {
          code: "invalid_choice",
          path: ["related", 1, "collection"],
          allowed: ["posts", "pages"],
        },
      ],
    );
  });
});
