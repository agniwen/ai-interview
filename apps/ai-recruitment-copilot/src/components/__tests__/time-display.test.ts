import { afterEach, describe, expect, it } from "vitest";
import { formatTimeDisplayText, formatTimeDisplayTooltipRows } from "../time-display";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("formatTimeDisplayText", () => {
  it("uses the current runtime timezone instead of a fixed China timezone", () => {
    process.env.TZ = "America/Los_Angeles";

    expect(formatTimeDisplayText("2026-06-02T09:30:00.000Z", "YY/MM/DD HH:mm")).toBe(
      "26/06/02 02:30",
    );
  });

  it("returns null for invalid values", () => {
    expect(formatTimeDisplayText("not-a-date")).toBeNull();
  });
});

describe("formatTimeDisplayTooltipRows", () => {
  it("formats the fixed country timezones", () => {
    expect(formatTimeDisplayTooltipRows("2026-06-02T09:30:00.000Z")).toEqual([
      { label: "中国时区", text: "26/06/02 17:30" },
      { label: "英国时区", text: "26/06/02 10:30" },
      { label: "日韩时区", text: "26/06/02 18:30" },
      { label: "美国时区（纽约）", text: "26/06/02 05:30" },
    ]);
  });

  it("returns no tooltip rows for invalid values", () => {
    expect(formatTimeDisplayTooltipRows("not-a-date")).toEqual([]);
  });
});
