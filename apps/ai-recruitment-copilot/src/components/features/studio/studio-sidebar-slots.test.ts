import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("studio-sidebar-slots.tsx", import.meta.url), "utf-8");

describe("Studio sidebar menu items", () => {
  it("provides subtle press feedback and de-emphasizes inactive items", () => {
    expect(source).toContain("active:scale-[0.98]");
    expect(source).toContain("data-[active=false]:opacity-90");
    expect(source).toContain("data-[active=false]:hover:opacity-100");
    expect(source).toContain("motion-reduce:active:scale-100");
  });

  it("places schedule management immediately above the dashboard", () => {
    expect(source.indexOf('title: "日程管理"')).toBeGreaterThan(source.indexOf('title: "AI 面试"'));
    expect(source.indexOf('title: "日程管理"')).toBeLessThan(source.indexOf('title: "数据看板"'));
  });
});
