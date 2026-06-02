import { afterEach, describe, expect, it } from "vitest";
import { dateTimeLocalInputToISOString } from "../datetime-local";

const originalTimeZone = process.env.TZ;

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("dateTimeLocalInputToISOString", () => {
  it("serializes a datetime-local value as the user's local instant", () => {
    process.env.TZ = "Asia/Shanghai";

    expect(dateTimeLocalInputToISOString("2026-06-02T17:30")).toBe("2026-06-02T09:30:00.000Z");
  });

  it("returns null for an empty datetime-local value", () => {
    expect(dateTimeLocalInputToISOString("")).toBeNull();
  });
});
