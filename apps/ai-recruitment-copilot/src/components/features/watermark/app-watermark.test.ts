import { describe, expect, it } from "vitest";
import { buildWatermarkContent, maskWatermarkUserId } from "./app-watermark";

describe("app watermark content", () => {
  it("masks the middle of a long user id after limiting it to 16 characters", () => {
    expect(maskWatermarkUserId("1234567890abcdef-extra")).toBe("1234****cdef");
  });

  it("keeps short user ids readable", () => {
    expect(maskWatermarkUserId("u1234567")).toBe("u1234567");
  });

  it("uses nickname as the first line and masked user id as the second line", () => {
    expect(
      buildWatermarkContent({
        email: "fallback@example.com",
        id: "1234567890abcdef-extra",
        name: "王小明",
      }),
    ).toEqual(["王小明", "ID: 1234****cdef"]);
  });

  it("falls back to email when nickname is blank", () => {
    expect(
      buildWatermarkContent({
        email: "fallback@example.com",
        id: "u1234567",
        name: " ",
      }),
    ).toEqual(["fallback@example.com", "ID: u1234567"]);
  });
});
