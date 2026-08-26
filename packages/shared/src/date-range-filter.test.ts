import { describe, expect, it } from "vitest";
import {
  createdAtDateQuerySchema,
  dateRangeFilterBounds,
  dateRangeFilterLabel,
  nextShanghaiCalendarDayStart,
  shanghaiCalendarDayStart,
} from "./date-range-filter";

describe("calendar date filters", () => {
  it("resolves shortcuts in Shanghai time and keeps custom ranges as dates", () => {
    const now = new Date("2026-08-25T16:00:00Z");
    expect(dateRangeFilterBounds("today", now)).toEqual({ from: "2026-08-26", to: "2026-08-26" });
    expect(dateRangeFilterBounds("yesterday", now)).toEqual({
      from: "2026-08-25",
      to: "2026-08-25",
    });
    expect(dateRangeFilterBounds("last_7_days", now)).toEqual({
      from: "2026-08-20",
      to: "2026-08-26",
    });
    expect(dateRangeFilterBounds("custom:2026-07-31:2026-08-01", now)).toEqual({
      from: "2026-07-31",
      to: "2026-08-01",
    });
    expect(dateRangeFilterBounds("")).toBeNull();
    expect(dateRangeFilterBounds("custom:2026-02-30:2026-03-01")).toBeNull();
    expect(dateRangeFilterBounds("custom:2026-08-26:2026-08-25")).toBeNull();
    expect(dateRangeFilterLabel("", "创建时间")).toBe("创建时间");
    expect(dateRangeFilterLabel("custom:2026-07-31:2026-08-01")).toBe("26年7月31日-8月1日");
  });

  it.each([
    ["custom:2026-07-04:2026-08-08", "26年7月4日-8月8日"],
    ["custom:2025-12-31:2026-01-02", "25年12月31日-26年1月2日"],
    ["custom:2026-08-26:2026-08-26", "26年8月26日-8月26日"],
  ])("formats years in the external filter label: %s", (value, label) => {
    expect(dateRangeFilterLabel(value)).toBe(label);
  });

  it.each([
    ["2026-08-26", "2026-08-25T16:00:00.000Z", "2026-08-26T16:00:00.000Z"],
    ["2026-08-31", "2026-08-30T16:00:00.000Z", "2026-08-31T16:00:00.000Z"],
    ["2026-12-31", "2026-12-30T16:00:00.000Z", "2026-12-31T16:00:00.000Z"],
    ["2024-02-29", "2024-02-28T16:00:00.000Z", "2024-02-29T16:00:00.000Z"],
  ])("uses midnight and exclusive next midnight for %s", (day, start, end) => {
    expect(shanghaiCalendarDayStart(day).toISOString()).toBe(start);
    expect(nextShanghaiCalendarDayStart(day).toISOString()).toBe(end);
  });

  it("includes both boundary dates and the last fractional second, but not the next day", () => {
    const from = shanghaiCalendarDayStart("2026-08-25").getTime();
    const before = nextShanghaiCalendarDayStart("2026-08-26").getTime();
    const matches = (value: string) =>
      new Date(value).getTime() >= from && new Date(value).getTime() < before;
    expect(matches("2026-08-24T23:59:59.999+08:00")).toBe(false);
    expect(matches("2026-08-25T00:00:00+08:00")).toBe(true);
    expect(matches("2026-08-26T23:59:59+08:00")).toBe(true);
    expect(matches("2026-08-26T23:59:59.999+08:00")).toBe(true);
    expect(matches("2026-08-27T00:00:00+08:00")).toBe(false);
  });

  it.each([
    { createdFrom: "2026-02-29" },
    { createdTo: "2026-04-31" },
    { createdFrom: "2026-08-26T00:00:00Z" },
    { createdFrom: "2026-8-1" },
    { createdFrom: "2026-08-26", createdTo: "2026-08-25" },
  ])("rejects invalid dates or inverted ranges: %j", (query) => {
    expect(createdAtDateQuerySchema.safeParse(query).success).toBe(false);
  });

  it.each([
    {},
    { createdFrom: "2026-08-26" },
    { createdTo: "2026-08-26" },
    { createdFrom: "2026-08-26", createdTo: "2026-08-26" },
  ])("allows empty, one-sided and same-day ranges: %j", (query) => {
    expect(createdAtDateQuerySchema.parse(query)).toEqual(query);
  });
});
