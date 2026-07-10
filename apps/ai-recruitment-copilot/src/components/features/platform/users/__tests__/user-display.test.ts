import { describe, expect, it } from "vitest";
import { formatUserNameWithRemark } from "../user-display";

describe("formatUserNameWithRemark", () => {
  it("appends remark in parentheses after the display name", () => {
    expect(formatUserNameWithRemark("张三", "重点客户")).toBe("张三（重点客户）");
  });

  it("falls back to email and trims blank remarks", () => {
    expect(formatUserNameWithRemark("", "  ", "user@example.com")).toBe("user@example.com");
  });
});
