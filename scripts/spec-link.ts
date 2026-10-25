export type SpecLinkResult = { ok: true } | { ok: false; reason: string };

const featureTitle = /^\s*feat\b/i;
const whyHeading = /^##\s+Why\s*$/im;
const nextHeading = /^##\s/m;
const htmlComment = /<!--[\s\S]*?(?:-->|$)/g;
const detailsBlock = /<details\b[\s\S]*?(?:<\/details>|$)/gi;
const codeFence = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:^ {0,3}\1[`~]*[ \t]*$|(?![\s\S]))/gm;
const specReference = [
  /\bhttps?:\/\/[^\s<>]+\.[^\s<>]+/i,
  /(?:^|[\s(])(?:[\w.-]+\/[\w.-]+)?#\d+\b/,
  /(?:^|[\s(`])[\w.~-]*\/[\w./-]*\.\w+\b/,
];

const whySection = (body: string) => {
  const visible = body.replace(codeFence, "").replace(htmlComment, "").replace(detailsBlock, "");
  const heading = whyHeading.exec(visible);
  if (heading === null) return undefined;
  const rest = visible.slice(heading.index + heading[0].length);
  const end = nextHeading.exec(rest);
  return end === null ? rest : rest.slice(0, end.index);
};

/** Feature PRs must link their agreed spec in the body's visible Why section, outside comments, code fences and details blocks. Other PRs pass. */
export const checkSpecLink = (title: string, body: string): SpecLinkResult => {
  if (!featureTitle.test(title)) return { ok: true };
  const section = whySection(body);
  if (section === undefined) {
    return { ok: false, reason: "Feature PRs need a ## Why section that links the agreed spec." };
  }
  if (!specReference.some((pattern) => pattern.test(section))) {
    return {
      ok: false,
      reason:
        "The ## Why section needs a link to the agreed spec: a URL, an issue, or a repo path.",
    };
  }
  return { ok: true };
};

if (import.meta.main) {
  const result = checkSpecLink(process.env.PR_TITLE ?? "", process.env.PR_BODY ?? "");
  if (!result.ok) {
    console.error(result.reason);
    process.exitCode = 1;
  }
}
