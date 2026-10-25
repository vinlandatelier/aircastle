import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vite-plus/test";
import { checkSpecLink } from "../../scripts/spec-link.ts";

const template = readFileSync(
  resolve(import.meta.dirname, "../../.github/pull_request_template.md"),
  "utf8",
);
const withSpec = (spec: string) => template.replace(/(## Spec\n)/, `$1\n${spec}\n`);

test("the pull request template has a Spec section", () => {
  expect(template).toMatch(/^## Spec$/m);
});

test.each([
  ["an unfilled template", template],
  ["no Spec section", "## Problem\n\nhttps://github.com/o/r/issues/1\n"],
  ["n/a", withSpec("n/a: refactor")],
  ["a placeholder", withSpec("<link to the spec>, R1")],
  ["a link only in another section", `${withSpec("")}\nhttps://example.com/spec\n`],
])("a feat PR with %s fails", (_case, body) => {
  expect(checkSpecLink("feat(api): add drafts", body).ok).toBe(false);
});

test.each([
  ["an issue URL", "https://github.com/vinlandatelier/aircastle/issues/12, R1 R2"],
  ["an issue reference", "#12 (R1, R2)"],
  ["a repo path", "`docs/specs/drafts.md` R1"],
  ["a feat:spec record path", ".feat/drafts/feature.json R1-R3"],
])("a feat PR with %s passes", (_case, spec) => {
  expect(checkSpecLink("feat: add drafts", withSpec(spec))).toEqual({ ok: true });
});

test.each(["Feat: add drafts", "feat!: drop v1", " feat(web): add drafts"])(
  "%s counts as a feature title",
  (title) => {
    expect(checkSpecLink(title, template).ok).toBe(false);
  },
);

test("a fix PR with n/a passes", () => {
  expect(checkSpecLink("fix(core): reject empty slugs", withSpec("n/a: bug fix"))).toEqual({
    ok: true,
  });
});
