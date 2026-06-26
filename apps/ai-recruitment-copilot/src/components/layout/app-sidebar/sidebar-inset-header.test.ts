import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(pathname: string) {
  return readFileSync(new URL(pathname, import.meta.url), "utf-8");
}

function requiredIndex(source: string, token: string) {
  const index = source.indexOf(token);
  expect(index, `Expected source to contain ${token}`).toBeGreaterThanOrEqual(0);
  return index;
}

const headerSource = readSource("sidebar-inset-header.tsx");
const platformRouteSource = readSource("../../../routes/platform.tsx");
const studioRouteSource = readSource("../../../routes/w.$slug.studio.tsx");

function expectHeaderInsideScrollArea(source: string, header: string) {
  const scrollAreaIndex = requiredIndex(source, "<ScrollArea");
  const headerIndex = requiredIndex(source, header);
  const contentIndex = requiredIndex(source, "<PendingOutlet");

  expect(scrollAreaIndex).toBeLessThan(headerIndex);
  expect(headerIndex).toBeLessThan(contentIndex);
  expect(source).toContain('className="@container/main min-h-0 flex-1 bg-background"');
}

describe("SidebarInsetHeader translucent sticky layout", () => {
  it("uses a translucent blurred sticky background by default", () => {
    expect(headerSource).toContain("sticky top-0 z-10");
    expect(headerSource).toContain("bg-background/60");
    expect(headerSource).toContain("backdrop-blur-md");
  });

  it("keeps platform and studio headers inside the scroll area", () => {
    expectHeaderInsideScrollArea(platformRouteSource, "<PlatformHeader />");
    expectHeaderInsideScrollArea(studioRouteSource, "<SiteHeader />");
  });
});
