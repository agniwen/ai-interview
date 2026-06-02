import { afterEach, describe, expect, it } from "vitest";
import { formatTimeDisplayText } from "../time-display";

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
