import type { PageBlock } from "../config.ts";
type Group = Extract<PageBlock, { type: "group" }>;
export const record: Group["inner"][number] = { type: "divider" };
