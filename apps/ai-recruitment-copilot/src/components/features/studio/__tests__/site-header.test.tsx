import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { resolveSiteHeaderTitle } from "../site-header";

describe("SiteHeader", () => {
  it.each([
    ["/w/demo/studio/calendar", "日程管理"],
    ["/w/demo/studio/dashboard", "数据看板"],
  ])("shows the matching title for %s", (routePath, expectedTitle) => {
    expect(resolveSiteHeaderTitle(routePath)).toBe(expectedTitle);
  });

  it("hides the menu icon when route content overrides the header", async () => {
    const source = await readFile(new URL("../site-header.tsx", import.meta.url), "utf-8");

    expect(source).toContain("headerOverride === null && ActiveMenuIcon");
  });
});
