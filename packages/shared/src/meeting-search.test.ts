import { describe, expect, it } from "vitest";
import { meetingLibrarySearchQuerySchema } from "./meeting-search";

describe("meeting library search contracts", () => {
  it("normalizes a bounded search query", () => {
    expect(meetingLibrarySearchQuerySchema.parse({ limit: "20", q: "  客户预算  " })).toEqual({
      limit: 20,
      q: "客户预算",
      timeZone: "UTC",
    });
    expect(
      meetingLibrarySearchQuerySchema.parse({ q: "客户预算", timeZone: "Asia/Shanghai" }),
    ).toMatchObject({ timeZone: "Asia/Shanghai" });
  });

  it("rejects empty, oversized, and excessive result requests", () => {
    expect(meetingLibrarySearchQuerySchema.safeParse({ q: "   " }).success).toBe(false);
    expect(meetingLibrarySearchQuerySchema.safeParse({ q: "x" }).success).toBe(false);
    expect(meetingLibrarySearchQuerySchema.safeParse({ q: "x".repeat(121) }).success).toBe(false);
    expect(meetingLibrarySearchQuerySchema.safeParse({ limit: "51", q: "预算" }).success).toBe(
      false,
    );
    expect(
      meetingLibrarySearchQuerySchema.safeParse({ q: "预算", timeZone: "Invalid/Timezone" })
        .success,
    ).toBe(false);
  });
});
