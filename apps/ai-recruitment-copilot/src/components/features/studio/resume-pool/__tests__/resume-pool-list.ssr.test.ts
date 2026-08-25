import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("resume pool list", () => {
  it("loads without the previous masonry dependency", async () => {
    const listModule = await import("../resume-pool-list");

    expect(listModule.ResumePoolListContent).toBeTypeOf("function");
  });

  it("uses a single-column fixed-height virtual list", async () => {
    const source = await readFile(new URL("../resume-pool-list.tsx", import.meta.url), "utf-8");

    expect(source).toContain("useVirtualizer");
    expect(source).toContain("useResumePoolCardHeight");
    expect(source).toContain("useElementScrollRestoration");
    expect(source).toContain("initialOffset: studioScrollEntry?.scrollY");
    expect(source).toContain("[overflow-anchor:none]");
    expect(source).toContain("virtualizer.getTotalSize()");
    expect(source).toMatch(/translateY\(\$\{virtualRow\.start\}px\)/u);
    expect(source).not.toContain("ResumePoolMasonry");
    expect(source).not.toContain("groupResumePoolRecordsByCreatedAt");
    expect(source).not.toContain("ResumePoolStickyDateGroupHeader");
  });
});
