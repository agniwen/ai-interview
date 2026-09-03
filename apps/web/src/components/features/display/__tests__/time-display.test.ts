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
  it("always formats in Asia/Shanghai, even when the runtime timezone differs", () => {
    process.env.TZ = "America/Los_Angeles";

    expect(formatTimeDisplayText("2026-06-02T09:30:00.000Z", "YY/MM/DD HH:mm")).toBe(
      "26/06/02 17:30",
    );
  });

  it("returns null for invalid values", () => {
    expect(formatTimeDisplayText("not-a-date")).toBeNull();
  });
});
