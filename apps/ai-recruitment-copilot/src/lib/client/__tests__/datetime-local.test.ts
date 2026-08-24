import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dateTimeLocalInputToISOString, isoStringToDateTimeLocalInput } from "../datetime-local";

const originalTimeZone = process.env.TZ;

beforeEach(() => {
  process.env.TZ = "Asia/Shanghai";
});

afterEach(() => {
  if (originalTimeZone === undefined) {
    delete process.env.TZ;
  } else {
    process.env.TZ = originalTimeZone;
  }
});

describe("dateTimeLocalInputToISOString", () => {
  it("serializes a datetime-local value as the user's local instant", () => {
    expect(dateTimeLocalInputToISOString("2026-06-02T17:30")).toBe("2026-06-02T09:30:00.000Z");
  });

  it("returns null for an empty datetime-local value", () => {
    expect(dateTimeLocalInputToISOString("")).toBeNull();
  });

  it("formats an ISO instant for a datetime-local input in the browser timezone", () => {
    expect(isoStringToDateTimeLocalInput("2026-06-02T09:30:00.000Z")).toBe("2026-06-02T17:30");
  });

  it("returns an empty datetime-local value for a missing ISO instant", () => {
    expect(isoStringToDateTimeLocalInput(null)).toBe("");
  });
});
