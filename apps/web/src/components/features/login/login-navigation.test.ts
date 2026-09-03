import { describe, expect, it } from "vitest";
import { readLoginGoto, resolveLoginCallbackURL } from "./login-navigation";

describe("login navigation", () => {
  it("preserves the candidate, workspace and exact review round after login", () => {
    const target = "/w/team/studio/resumes/candidate?tab=human-interview&reviewRoundId=round-2";
    expect(resolveLoginCallbackURL({ callbackURL: target })).toBe(target);
  });
  it.each(["agent", "studio"] as const)("preserves the %s homepage intent", (goto) => {
    expect(resolveLoginCallbackURL({ goto })).toBe(`/?goto=${goto}`);
  });

  it("keeps existing safe callback URLs", () => {
    expect(resolveLoginCallbackURL({ callbackURL: "/select-workspace" })).toBe("/select-workspace");
    expect(resolveLoginCallbackURL({ returnTo: "/wait" })).toBe("/wait");
  });

  it("rejects external and protocol-relative callback URLs", () => {
    expect(resolveLoginCallbackURL({ callbackURL: "https://example.com" })).toBe("/");
    expect(resolveLoginCallbackURL({ callbackURL: "//example.com" })).toBe("/");
    expect(resolveLoginCallbackURL({ callbackURL: "/\\example.com" })).toBe("/");
  });

  it("only accepts supported homepage intents", () => {
    expect(readLoginGoto("agent")).toBe("agent");
    expect(readLoginGoto("studio")).toBe("studio");
    expect(readLoginGoto("chat")).toBeUndefined();
  });
});
