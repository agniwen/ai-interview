import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("sidebar.tsx", import.meta.url), "utf-8");

describe("SidebarMenuButton", () => {
  it("centers icons when the sidebar is collapsed to icon mode", () => {
    expect(source).toContain("group-data-[collapsible=icon]:justify-center!");
    expect(source).toContain("group-data-[collapsible=icon]:gap-0!");
    expect(source).toContain("group-data-[collapsible=icon]:[&>span:last-child]:hidden");
  });
});
