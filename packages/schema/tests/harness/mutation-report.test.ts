import { expect, test } from "bun:test";
import { applyMutation } from "../../scripts/classify-mutations.ts";

test("mutation replay uses one-based UTF-16 locations from the report", () => {
  const source = 'const emoji = "😀";\nconst n = 1;\n';
  expect(
    applyMutation(source, {
      location: { start: { line: 2, column: 11 }, end: { line: 2, column: 12 } },
      replacement: "2",
    }),
  ).toBe('const emoji = "😀";\nconst n = 2;\n');
  expect(
    applyMutation('"😀" + 1', {
      location: { start: { line: 1, column: 8 }, end: { line: 1, column: 9 } },
      replacement: "2",
    }),
  ).toBe('"😀" + 2');
});

test("mutation replay rejects out-of-range and reversed locations", () => {
  for (const [start, end] of [
    [0, 1],
    [1, 20],
    [3, 2],
  ]) {
    expect(() =>
      applyMutation("abc", {
        location: { start: { line: 1, column: start! }, end: { line: 1, column: end! } },
        replacement: "x",
      }),
    ).toThrow();
  }
});
