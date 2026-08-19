import { describe, expect, it } from "vitest";
import { serializeDate } from "./serialize";

describe("serializeDate", () => {
  it("preserves an ISO timestamp returned by a raw database expression", () => {
    const timestamp = "2026-08-19T06:30:00.000Z";

    expect(serializeDate(timestamp)).toBe(timestamp);
  });

  it("serializes Date values and preserves null", () => {
    const timestamp = new Date("2026-08-19T06:30:00.000Z");

    expect(serializeDate(timestamp)).toBe("2026-08-19T06:30:00.000Z");
    expect(serializeDate(null)).toBeNull();
  });
});
