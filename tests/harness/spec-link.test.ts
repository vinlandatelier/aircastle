import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { checkSpecLink } from "../../scripts/spec-link.ts";

const template = readFileSync(
  resolve(import.meta.dirname, "../../.github/pull_request_template.md"),
  "utf8",
);
const withWhy = (why: string) => template.replace(/(## Why\n)/, `$1\n${why}\n`);

test("the pull request template has a Why section", () => {
  expect(template).toMatch(/^## Why$/m);
});

test.each([
  ["an unfilled template", template],
  ["no Why section", "## What?\n\nhttps://github.com/o/r/issues/1\n"],
  ["n/a", withWhy("n/a: refactor")],
  ["a placeholder", withWhy("<link to the spec>, R1")],
  ["a link only inside an HTML comment", withWhy("<!-- https://example.com/spec #12 -->")],
  ["a link only in another section", `${withWhy("")}\nhttps://example.com/spec\n`],
  [
    "a Why heading only inside a code fence",
    "## What?\n\n```md\n## Why\n\nhttps://example.com/spec\n```\n",
  ],
  ["a link only inside a code fence", withWhy("```\nhttps://example.com/spec\n```")],
  ["a link only inside an unclosed code fence", withWhy("~~~\n#12")],
])("a feat PR with %s fails", (_case, body) => {
  expect(checkSpecLink("feat(api): add drafts", body).ok).toBe(false);
});

test.each([
  ["an issue URL", "https://github.com/vinlandatelier/aircastle/issues/12, R1 R2"],
  ["an issue reference", "#12 (R1, R2)"],
  ["a repo path", "`docs/specs/drafts.md` R1"],
  ["a feat:spec record path", ".feat/drafts/feature.json R1-R3"],
  ["a link after a code fence", "```\nR1\n```\n#12"],
  ["a link after a CRLF code fence", "```\r\nR1\r\n```\r\n#12"],
])("a feat PR with %s in Why passes", (_case, why) => {
  expect(checkSpecLink("feat: add drafts", withWhy(why))).toEqual({ ok: true });
});

test.each(["Feat: add drafts", "feat!: drop v1", " feat(web): add drafts"])(
  "%s counts as a feature title",
  (title) => {
    expect(checkSpecLink(title, template).ok).toBe(false);
  },
);

test("a fix PR with an unfilled template passes", () => {
  expect(checkSpecLink("fix(core): reject empty slugs", template)).toEqual({ ok: true });
});
