import { readFileSync } from "node:fs";

/**
 * Reads the Scalar standalone bundle from the installed, pinned package. Startup imports this as
 * a Bun macro, so builds inline the bundle and the image needs no CDN or `node_modules`.
 */
export function scalarScript(): string {
  return readFileSync(
    new URL("browser/standalone.js", import.meta.resolve("@scalar/api-reference")),
    "utf8",
  );
}
