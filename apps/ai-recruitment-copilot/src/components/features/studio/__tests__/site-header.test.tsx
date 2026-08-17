import { describe, expect, it } from "vitest";
import { resolveSiteHeaderTitle } from "../site-header";

describe("SiteHeader", () => {
  it.each([
    ["/w/demo/studio/calendar", "日程管理"],
    ["/w/demo/studio/dashboard", "数据看板"],
  ])("shows the matching title for %s", (routePath, expectedTitle) => {
    expect(resolveSiteHeaderTitle(routePath)).toBe(expectedTitle);
  });
});
