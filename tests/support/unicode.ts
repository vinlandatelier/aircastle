import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface GraphemeFixture {
  line: number;
  input: string;
  boundaries: readonly number[];
  graphemes: number;
}

export function parseGraphemeFixtures(source: string): GraphemeFixture[] {
  const fixtures: GraphemeFixture[] = [];
  source.split(/\r?\n/).forEach((line, index) => {
    const body = line.split("#", 1)[0]!.trim();
    if (!body) return;
    const tokens = body.split(/\s+/);
    if (tokens.length < 3 || tokens.length % 2 !== 1 || tokens[0] !== "÷" || tokens.at(-1) !== "÷") {
      throw new Error(`Invalid Unicode fixture framing at line ${index + 1}`);
    }
    let input = "";
    const boundaries: number[] = [];
    for (let position = 0; position < tokens.length; position++) {
      const token = tokens[position]!;
      if (position % 2 === 0) {
        if (token !== "÷" && token !== "×") throw new Error(`Invalid break marker at line ${index + 1}`);
        if (token === "÷") boundaries.push(input.length);
      } else {
        const point = /^[0-9A-F]{4,6}$/.test(token) ? Number.parseInt(token, 16) : NaN;
        if (!Number.isInteger(point) || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
          throw new Error(`Invalid Unicode scalar at line ${index + 1}`);
        }
        input += String.fromCodePoint(point);
      }
    }
    fixtures.push({ line: index + 1, input, boundaries, graphemes: boundaries.length - 1 });
  });
  if (fixtures.length === 0) throw new Error("No Unicode fixtures were parsed");
  return fixtures;
}

export function loadGraphemeFixtures(): GraphemeFixture[] {
  const directory = resolve(import.meta.dir, "../fixtures/unicode/15.1.0");
  const source = readFileSync(resolve(directory, "GraphemeBreakTest.txt"), "utf8");
  const metadata = JSON.parse(readFileSync(resolve(directory, "source.json"), "utf8")) as {
    sha256: string; cases: number; unicodeVersion: string; licenseSha256: string;
  };
  if (createHash("sha256").update(source).digest("hex") !== metadata.sha256) throw new Error("Unicode fixture checksum mismatch");
  const license = readFileSync(resolve(directory, "LICENSE.txt"));
  if (createHash("sha256").update(license).digest("hex") !== metadata.licenseSha256) throw new Error("Unicode license checksum mismatch");
  if (process.versions.unicode !== metadata.unicodeVersion) throw new Error("Runtime Unicode version differs from fixture version");
  const fixtures = parseGraphemeFixtures(source);
  if (fixtures.length !== metadata.cases) throw new Error("Unicode fixture case count mismatch");
  if (fixtures.some((fixture) => fixture.input.includes("\u0000"))) throw new Error("Unicode fixture requires a separate forbidden-character classification");
  return fixtures;
}
