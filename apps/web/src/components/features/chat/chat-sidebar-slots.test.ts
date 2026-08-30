import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("chat-sidebar-slots.tsx", import.meta.url), "utf-8");

describe("Chat sidebar session items", () => {
  it("provides subtle press feedback in expanded and collapsed modes", () => {
    expect(source).toContain("has-[a:active]:scale-[0.98]");
    expect(source).toContain("active:scale-[0.98]");
    expect(source).toContain("motion-reduce:has-[a:active]:scale-100");
    expect(source).toContain("motion-reduce:active:scale-100");
  });
});
