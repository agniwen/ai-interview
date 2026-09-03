import { describe, expect, it } from "vitest";
import { studioCalendarQuerySchema } from "./schema";

describe("studioCalendarQuerySchema", () => {
  it("accepts an explicit-timezone range", () => {
    expect(
      studioCalendarQuerySchema.safeParse({
        end: "2026-08-01T00:00:00.000Z",
        start: "2026-07-01T00:00:00.000Z",
      }).success,
    ).toBe(true);
  });

  it("rejects reversed and oversized ranges", () => {
    expect(
      studioCalendarQuerySchema.safeParse({
        end: "2026-07-01T00:00:00.000Z",
        start: "2026-08-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
    expect(
      studioCalendarQuerySchema.safeParse({
        end: "2027-08-01T00:00:00.000Z",
        start: "2026-07-01T00:00:00.000Z",
      }).success,
    ).toBe(false);
  });
});
