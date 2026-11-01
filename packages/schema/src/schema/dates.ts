import type { IssuePath, ValidationIssue } from "./contract.ts";
import { validationIssue } from "./errors.ts";
import type { DateRules, Outcome } from "./fields.ts";
import { receivedType } from "./records.ts";

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const datetimePattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})$/;
const earliestInstant = -62135596800000;
const latestInstant = 253402300799999;

function realDay(year: number, month: number, day: number): boolean {
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1]!;
}

/** Returns the date unchanged when it names a real day from 0001-01-01 to 9999-12-31. */
export function parseDate(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = datePattern.exec(value);
  if (!match) return undefined;
  return realDay(Number(match[1]), Number(match[2]), Number(match[3])) ? value : undefined;
}

/** Returns the UTC instant as `YYYY-MM-DDTHH:MM:SS.sssZ`, or undefined when the text is not a valid datetime. */
export function parseDatetime(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const match = datetimePattern.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = match[6] === undefined ? 0 : Number(match[6]);
  const millisecond = match[7] === undefined ? 0 : Number(match[7].padEnd(3, "0"));
  if (!realDay(year, month, day) || hour > 23 || minute > 59 || second > 59) return undefined;
  const zone = match[8]!;
  let offset = 0;
  if (zone !== "Z") {
    const offsetHour = Number(zone.slice(1, 3));
    const offsetMinute = Number(zone.slice(4, 6));
    if (offsetHour > 23 || offsetMinute > 59) return undefined;
    offset = (zone.startsWith("-") ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  }
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  const instant = local.getTime() - offset * 60_000;
  if (instant < earliestInstant || instant > latestInstant) return undefined;
  return new Date(instant).toISOString();
}

export function validateDate(value: unknown, rules: DateRules, path: IssuePath): Outcome {
  if (typeof value !== "string")
    return {
      ok: false,
      issues: [
        validationIssue(path, {
          code: "invalid_type",
          expected: "string",
          received: receivedType(value),
        }),
      ],
    };
  const normalized = rules.kind === "date" ? parseDate(value) : parseDatetime(value);
  if (normalized === undefined)
    return {
      ok: false,
      issues: [
        validationIssue(path, {
          code: rules.kind === "date" ? "invalid_date" : "invalid_datetime",
        }),
      ],
    };
  const issues: ValidationIssue[] = [];
  if (rules.min !== undefined && normalized < rules.min)
    issues.push(
      validationIssue(path, { code: "too_early", minimum: rules.min, actual: normalized }),
    );
  if (rules.max !== undefined && normalized > rules.max)
    issues.push(
      validationIssue(path, { code: "too_late", maximum: rules.max, actual: normalized }),
    );
  return issues.length ? { ok: false, issues } : { ok: true, value: normalized };
}
