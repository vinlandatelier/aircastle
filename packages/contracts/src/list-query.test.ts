import { describe, expect, test } from "vite-plus/test";
import {
  defaultListLimit,
  isListLimit,
  isListQueryKey,
  isListSort,
  maximumListLimit,
} from "./index.ts";

describe("list query rules", () => {
  test("pages default to 20 documents and allow at most 100", () => {
    expect(defaultListLimit).toBe(20);
    expect(maximumListLimit).toBe(100);
  });

  test("a limit is an integer from 1 to 100", () => {
    for (const limit of [1, 20, 100]) expect(isListLimit(limit)).toBe(true);
    for (const limit of [0, -1, 101, 1.5, Number.NaN, Infinity, "20", null, undefined])
      expect(isListLimit(limit)).toBe(false);
  });

  test("a sort is a field name with an optional leading minus", () => {
    for (const sort of ["title", "-title", "_a1", "-B_2"]) expect(isListSort(sort)).toBe(true);
    for (const sort of ["", "-", "--title", "1title", "ti-tle", "title ", "+title", 1, undefined])
      expect(isListSort(sort)).toBe(false);
  });

  test("only where, sort, limit and cursor are query keys", () => {
    for (const key of ["where", "sort", "limit", "cursor"]) expect(isListQueryKey(key)).toBe(true);
    for (const key of ["filter", "Limit", "", "toString", "__proto__"])
      expect(isListQueryKey(key)).toBe(false);
  });
});
