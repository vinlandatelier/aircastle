import { createHash } from "node:crypto";

export const hashText = (value: string): string => createHash("sha256").update(value).digest("hex");
export const digest = (value: unknown): string => hashText(JSON.stringify(value));
