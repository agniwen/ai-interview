import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("resume pool list", () => {
  it("loads without the previous masonry dependency", async () => {
    const listModule = await import("../resume-pool-list");

    expect(listModule.ResumePoolListContent).toBeTypeOf("function");
  });

  it("keeps date headers and resume cards inside one virtual list", async () => {
    const [source, sharedSource] = await Promise.all([
      readFile(new URL("../resume-pool-list.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../../studio-date-group-virtual-list.tsx", import.meta.url), "utf-8"),
    ]);

    expect(source).toContain("useVirtualizer");
    expect(sharedSource).toContain("defaultRangeExtractor");
    expect(source).toContain("useResumePoolCardHeight");
    expect(source).toContain("buildResumePoolVirtualRows");
    expect(source).toContain("StudioStickyDateGroupHeader");
    expect(source).toContain("StudioDateGroupHeaderSkeleton");
    expect(source).toContain("STUDIO_DATE_GROUP_ROW_HEIGHT");
    expect(sharedSource).toContain("STUDIO_DATE_GROUP_HEADER_GAP = 12");
    expect(sharedSource).toContain("height: STUDIO_DATE_GROUP_HEADER_HEIGHT");
    expect(sharedSource).toContain('active ? "sticky" : "absolute"');
    expect(sharedSource).not.toContain('active ? "sticky z-20" : "absolute"');
    expect(source).toContain("useElementScrollRestoration");
    expect(source).toContain("initialOffset: studioScrollEntry?.scrollY");
    expect(source).toContain("[overflow-anchor:none]");
    expect(source).toContain("virtualizer.getTotalSize()");
    expect(source).toContain('row.type === "date-header"');
    expect(source).toContain("rangeExtractor");
    expect(source).toMatch(/translateY\(\$\{virtualRow\.start\}px\)/u);
    expect(source).not.toContain("ResumePoolMasonry");
  });
});
