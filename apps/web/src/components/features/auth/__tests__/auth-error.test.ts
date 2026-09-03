import { describe, expect, it } from "vitest";
import { getBannedAuthMessage, isBannedAuthError } from "../auth-error";

describe("isBannedAuthError", () => {
  it("detects better-auth banned user errors", () => {
    expect(
      isBannedAuthError({ code: "BANNED_USER", message: "你的账号已被封禁，请联系管理员。" }),
    ).toBe(true);
  });

  it("does not treat generic auth failures as banned", () => {
    expect(isBannedAuthError({ code: "INVALID_PASSWORD", message: "Invalid password" })).toBe(
      false,
    );
  });

  it("maps the ascii OAuth redirect marker back to the Chinese banned message", () => {
    expect(getBannedAuthMessage("banned")).toBe("你的账号已被封禁，请联系管理员。");
  });
});
