import { describe, expect, test } from "vite-plus/test";
import fc from "fast-check";
import { datetime, number } from "../../src/index.ts";
import { compileValid } from "../support/compile-valid.ts";
import { expectFailure, expectSuccess } from "../support/assertions.ts";
import { propertyParameters } from "../support/properties.ts";

const finite = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(-0, 0, 1, -1, 0.5, Number.MAX_SAFE_INTEGER),
);
const positiveZero = (value: number) => (Object.is(value, -0) ? 0 : value);

function outputOf(result: unknown, name: string): unknown {
  const settled = result as { ok: boolean; data?: Record<string, unknown> };
  expect(settled.ok).toBe(true);
  return settled.data?.[name];
}

const pad = (value: number, width: number) => String(value).padStart(width, "0");

function localSpelling(instant: number, offsetMinutes: number): string {
  const local = new Date(instant + offsetMinutes * 60_000);
  const day = `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1, 2)}-${pad(local.getUTCDate(), 2)}`;
  const minutes = `${pad(local.getUTCHours(), 2)}:${pad(local.getUTCMinutes(), 2)}`;
  const seconds = local.getUTCSeconds();
  const millis = local.getUTCMilliseconds();
  const time =
    millis !== 0
      ? `${minutes}:${pad(seconds, 2)}.${pad(millis, 3)}`
      : seconds !== 0
        ? `${minutes}:${pad(seconds, 2)}`
        : minutes;
  const sign = offsetMinutes < 0 ? "-" : "+";
  const size = Math.abs(offsetMinutes);
  return `${day}T${time}${sign}${pad(Math.floor(size / 60), 2)}:${pad(size % 60, 2)}`;
}

const instants = fc.integer({
  min: Date.UTC(1000, 0, 1),
  max: Date.UTC(9000, 11, 31, 23, 59, 59, 999),
});
const offsets = fc.integer({ min: -(23 * 60 + 59), max: 23 * 60 + 59 });

describe("generated scalar laws", () => {
  test("finite numbers inside bounds pass unchanged except that -0 becomes 0", () => {
    fc.assert(
      fc.property(finite, finite, finite, (value, first, second) => {
        const minimum = positiveZero(Math.min(first, second));
        const maximum = positiveZero(Math.max(first, second));
        if (Object.is(value, -0) && (value < minimum || value > maximum)) return;
        const result = compileValid({ rating: number().min(minimum).max(maximum) }).validate({
          rating: value,
        });
        if (value < minimum) {
          expectFailure(result, [{ code: "too_small", path: ["rating"], minimum, actual: value }]);
        } else if (value > maximum) {
          expectFailure(result, [{ code: "too_large", path: ["rating"], maximum, actual: value }]);
        } else {
          expectSuccess(result, { rating: positiveZero(value) });
          expect(Object.is(outputOf(result, "rating"), positiveZero(value))).toBe(true);
        }
      }),
      propertyParameters,
    );
  });

  test("tightening a maximum never accepts more and repeated maximums act as the tightest", () => {
    fc.assert(
      fc.property(finite, finite, finite, (value, first, second) => {
        const tight = positiveZero(Math.min(first, second));
        const loose = positiveZero(Math.max(first, second));
        const rating = positiveZero(value);
        for (const field of [
          number().max(tight),
          number().max(loose).max(tight),
          number().max(tight).max(loose),
        ]) {
          const result = compileValid({ rating: field }).validate({ rating });
          if (rating > tight)
            expectFailure(result, [
              { code: "too_large", path: ["rating"], maximum: tight, actual: rating },
            ]);
          else expectSuccess(result, { rating });
        }
        const tightResult = compileValid({ rating: number().max(tight) }).validate({ rating });
        if (tightResult.ok)
          expectSuccess(compileValid({ rating: number().max(loose) }).validate({ rating }), {
            rating,
          });
      }),
      propertyParameters,
    );
  });

  test("tightening a minimum never accepts more and repeated minimums act as the tightest", () => {
    fc.assert(
      fc.property(finite, finite, finite, (value, first, second) => {
        const tight = positiveZero(Math.max(first, second));
        const loose = positiveZero(Math.min(first, second));
        const rating = positiveZero(value);
        for (const field of [
          number().min(tight),
          number().min(loose).min(tight),
          number().min(tight).min(loose),
        ]) {
          const result = compileValid({ rating: field }).validate({ rating });
          if (rating < tight)
            expectFailure(result, [
              { code: "too_small", path: ["rating"], minimum: tight, actual: rating },
            ]);
          else expectSuccess(result, { rating });
        }
        const tightResult = compileValid({ rating: number().min(tight) }).validate({ rating });
        if (tightResult.ok)
          expectSuccess(compileValid({ rating: number().min(loose) }).validate({ rating }), {
            rating,
          });
      }),
      propertyParameters,
    );
  });

  test("tightening an integer range never accepts more", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1000, max: 1000 }),
        fc.integer({ min: -20, max: 120 }),
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 }),
        (low, offset, raise, lower) => {
          const value = low + offset;
          const minimum = low + raise;
          const maximum = low + 100 - lower;
          const loose = number()
            .int()
            .min(low)
            .max(low + 100);
          const tight = loose.min(minimum).max(maximum);
          const tightResult = compileValid({ rating: tight }).validate({ rating: value });
          if (value < minimum)
            expectFailure(tightResult, [
              { code: "too_small", path: ["rating"], minimum, actual: value },
            ]);
          else if (value > maximum)
            expectFailure(tightResult, [
              { code: "too_large", path: ["rating"], maximum, actual: value },
            ]);
          else {
            expectSuccess(tightResult, { rating: value });
            expectSuccess(compileValid({ rating: loose }).validate({ rating: value }), {
              rating: value,
            });
          }
        },
      ),
      propertyParameters,
    );
  });

  test("datetime output validates again unchanged", () => {
    const collection = compileValid({ updatedAt: datetime() });
    fc.assert(
      fc.property(instants, offsets, (instant, offset) => {
        const first = collection.validate({ updatedAt: localSpelling(instant, offset) });
        const output = outputOf(first, "updatedAt");
        expect(output).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
        expectSuccess(collection.validate({ updatedAt: output }), { updatedAt: output });
      }),
      propertyParameters,
    );
  });

  test("two spellings of the same instant give the same UTC output", () => {
    const collection = compileValid({ updatedAt: datetime() });
    fc.assert(
      fc.property(instants, offsets, offsets, (instant, firstOffset, secondOffset) => {
        const expected = new Date(instant).toISOString();
        for (const updatedAt of [
          localSpelling(instant, firstOffset),
          localSpelling(instant, secondOffset),
          localSpelling(instant, 0).replace(/\+00:00$/, "Z"),
        ]) {
          expectSuccess(collection.validate({ updatedAt }), { updatedAt: expected });
        }
      }),
      propertyParameters,
    );
  });
});
