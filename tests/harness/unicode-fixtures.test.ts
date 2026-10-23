import { expect, test } from "bun:test";
import { loadGraphemeFixtures, parseGraphemeFixtures } from "../support/unicode.ts";

test("Unicode expectations come from break markers, including UTF-16 positions", () => {
  expect(parseGraphemeFixtures("÷ 0065 × 0301 ÷ 1F600 ÷ # example\n")).toEqual([
    { line: 1, input: "e\u0301😀", boundaries: [0, 2, 4], graphemes: 2 },
  ]);
  expect(parseGraphemeFixtures("# header\n÷ 000D × 000A ÷\n")).toEqual([
    { line: 2, input: "\r\n", boundaries: [0, 2], graphemes: 1 },
  ]);
});

test.each([
  "", "# only a comment", "0061 ÷", "× 0061 ÷", "÷ 0061 ×", "÷ 0061 ? 0062 ÷",
  "÷ XXXX ÷", "÷ 110000 ÷", "÷ D800 ÷", "÷ 0061 0062 ÷",
])("malformed Unicode fixture data cannot silently disappear: %s", (source) => {
  expect(() => parseGraphemeFixtures(source)).toThrow();
});

test("the independent Unicode fixture has its pinned checksum and vector count", () => {
  const fixtures = loadGraphemeFixtures();
  expect(fixtures).toHaveLength(1187);
  expect(fixtures.filter((fixture) => fixture.graphemes === 1)).toHaveLength(387);
  expect(fixtures.filter((fixture) => fixture.graphemes === 2)).toHaveLength(746);
  expect(fixtures.filter((fixture) => fixture.graphemes === 3)).toHaveLength(49);
  expect(fixtures.filter((fixture) => fixture.graphemes === 4)).toHaveLength(5);
});
