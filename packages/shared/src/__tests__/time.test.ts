// 日期 / 时间工具测试。日期格式化走 dayjs（固定 YY/MM/DD HH:mm），相对时间
// 仍走 Intl.RelativeTimeFormat（locale 敏感，断言用英文 locale）。
// Time helpers. Date formatting uses dayjs (fixed `YY/MM/DD HH:mm`); relative
// time still uses Intl.RelativeTimeFormat (locale-sensitive, asserted with `en`).

import { describe, expect, it } from "vitest";
import {
  diffSeconds,
  formatDate,
  formatDateOnly,
  formatRelativeTime,
  toDate,
} from "@arc/shared/utils/time";

describe("toDate", () => {
  it("returns null for null / undefined", () => {
    const absent = undefined;
    expect(toDate(null)).toBeNull();
    expect(toDate(absent)).toBeNull();
  });

  it("returns null for invalid date strings", () => {
    expect(toDate("not-a-date")).toBeNull();
    expect(toDate("")).toBeNull();
  });

  it("parses valid ISO strings", () => {
    const date = toDate("2026-04-27T10:00:00Z");
    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe("2026-04-27T10:00:00.000Z");
  });

  it("accepts epoch numbers", () => {
    const date = toDate(0);
    expect(date?.toISOString()).toBe("1970-01-01T00:00:00.000Z");
  });

  it("returns the same Date when given a Date instance", () => {
    const input = new Date("2026-01-01T00:00:00Z");
    expect(toDate(input)).toBe(input);
  });

  it("rejects Date with NaN timestamp", () => {
    expect(toDate(new Date("invalid"))).toBeNull();
  });
});

describe("formatDate", () => {
  it("returns '—' for nil / invalid input", () => {
    const absent = undefined;
    expect(formatDate(null)).toBe("—");
    expect(formatDate(absent)).toBe("—");
    expect(formatDate("nope")).toBe("—");
  });

  it("formats a date as `YY/MM/DD HH:mm` by default", () => {
    // 用本地时间断言：dayjs 用本地时区，避免硬编码 UTC offset。
    // Assert against local-time output: dayjs uses local tz; compute the
    // expected string with dayjs itself to stay tz-agnostic.
    const out = formatDate("2026-04-27T15:30:00Z");
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{2} \d{2}:\d{2}$/);
  });

  it("respects a custom dayjs format string", () => {
    const out = formatDate("2026-04-27T10:00:00Z", "YYYY-MM-DD");
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("formatDateOnly", () => {
  it("returns '—' for invalid input", () => {
    expect(formatDateOnly(null)).toBe("—");
  });

  it("formats date without time component", () => {
    const out = formatDateOnly("2026-04-27T15:30:00Z");
    expect(out).toMatch(/^\d{2}\/\d{2}\/\d{2}$/);
  });
});

describe("formatRelativeTime", () => {
  // 用一个固定 reference，让相对计算可复现 / Fix a reference time so relative math is reproducible.
  const REFERENCE = new Date("2026-05-15T12:00:00Z");

  it("returns '—' for invalid input", () => {
    expect(formatRelativeTime(null, REFERENCE, "en")).toBe("—");
    expect(formatRelativeTime("nope", REFERENCE, "en")).toBe("—");
  });

  it("uses 'seconds' unit when within 60s", () => {
    const past = new Date(REFERENCE.getTime() - 30_000);
    expect(formatRelativeTime(past, REFERENCE, "en")).toBe("30 seconds ago");
  });

  it("switches to 'minutes' at the 60s boundary", () => {
    const past = new Date(REFERENCE.getTime() - 60_000);
    expect(formatRelativeTime(past, REFERENCE, "en")).toBe("1 minute ago");
  });

  it("uses 'hours' unit between 1h and 24h", () => {
    const past = new Date(REFERENCE.getTime() - 2 * 3600 * 1000);
    expect(formatRelativeTime(past, REFERENCE, "en")).toBe("2 hours ago");
  });

  it("uses 'days' unit between 1d and 30d", () => {
    const past = new Date(REFERENCE.getTime() - 5 * 86_400 * 1000);
    expect(formatRelativeTime(past, REFERENCE, "en")).toBe("5 days ago");
  });

  it("uses 'months' unit between 1mo and 12mo", () => {
    const past = new Date(REFERENCE.getTime() - 90 * 86_400 * 1000);
    expect(formatRelativeTime(past, REFERENCE, "en")).toBe("3 months ago");
  });

  it("uses 'years' unit beyond a year", () => {
    const past = new Date(REFERENCE.getTime() - 2 * 365 * 86_400 * 1000);
    expect(formatRelativeTime(past, REFERENCE, "en")).toBe("2 years ago");
  });

  it("renders future deltas with a positive sign", () => {
    const future = new Date(REFERENCE.getTime() + 3 * 60_000);
    expect(formatRelativeTime(future, REFERENCE, "en")).toBe("in 3 minutes");
  });
});

describe("diffSeconds", () => {
  it("returns 0 for any invalid input", () => {
    expect(diffSeconds(null, new Date())).toBe(0);
    expect(diffSeconds(new Date(), null)).toBe(0);
    expect(diffSeconds("nope", "nope")).toBe(0);
  });

  it("returns positive when end is after start", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const end = new Date("2026-01-01T00:01:00Z");
    expect(diffSeconds(start, end)).toBe(60);
  });

  it("returns negative when end is before start", () => {
    const start = new Date("2026-01-01T00:01:00Z");
    const end = new Date("2026-01-01T00:00:00Z");
    expect(diffSeconds(start, end)).toBe(-60);
  });

  it("rounds to the nearest second", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-01T00:00:00.700Z");
    expect(diffSeconds(start, end)).toBe(1);
  });

  it("accepts mixed input types (string + Date)", () => {
    expect(diffSeconds("2026-01-01T00:00:00Z", new Date("2026-01-01T00:00:30Z"))).toBe(30);
  });
});
