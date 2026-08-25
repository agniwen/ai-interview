import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("resume pool list", () => {
  it("loads without the previous masonry dependency", async () => {
    const listModule = await import("../resume-pool-list");

    expect(listModule.ResumePoolListContent).toBeTypeOf("function");
  });

  it("keeps date headers and resume cards inside one virtual list", async () => {
    const source = await readFile(new URL("../resume-pool-list.tsx", import.meta.url), "utf-8");

    expect(source).toContain("useVirtualizer");
    expect(source).toContain("defaultRangeExtractor");
    expect(source).toContain("useResumePoolCardHeight");
    expect(source).toContain("buildResumePoolVirtualRows");
    expect(source).toContain("ResumePoolStickyDateGroupHeader");
    expect(source).toContain("RESUME_POOL_DATE_HEADER_GAP = 12");
    expect(source).toMatch(
      /type === "date-header"\s*\? RESUME_POOL_DATE_HEADER_ROW_HEIGHT\s*: cardHeight/u,
    );
    expect(source).toContain("height: RESUME_POOL_DATE_HEADER_HEIGHT");
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
