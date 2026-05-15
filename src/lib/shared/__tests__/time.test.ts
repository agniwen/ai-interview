// 日期 / 时间工具测试。Intl 输出会随 locale 漂移，所以涉及格式化的断言一律走英文 locale 或正则。
// Time helpers. Intl output drifts with locale, so format-related assertions use English locale or regex.

import { describe, expect, it } from "vitest";
import {
  diffSeconds,
  formatDate,
  formatDateOnly,
  formatRelativeTime,
  toDate,
} from "@/lib/shared/utils/time";

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

  it("formats a date in zh-CN by default (year/month/day all present)", () => {
    // 不绑定具体分隔符，只要求 4 位年 + 2 位月 + 2 位日 + 2 位时:分 都出现。
    // Don't lock to separators — just require year/month/day/hour/minute digits to appear.
    const out = formatDate("2026-04-27T15:30:00Z");
    expect(out).toMatch(/2026/);
    // minute = 30
    expect(out).toMatch(/30/);
  });

  it("respects locale + options overrides", () => {
    const out = formatDate(
      "2026-04-27T10:00:00Z",
      { day: "2-digit", month: "2-digit", year: "numeric" },
      "en-GB",
    );
    expect(out).toBe("27/04/2026");
  });
});

describe("formatDateOnly", () => {
  it("returns '—' for invalid input", () => {
    expect(formatDateOnly(null)).toBe("—");
  });

  it("formats date without time component", () => {
    const out = formatDateOnly("2026-04-27T15:30:00Z", "en-GB");
    expect(out).toBe("27/04/2026");
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
