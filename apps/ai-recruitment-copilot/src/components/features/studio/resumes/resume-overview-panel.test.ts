import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("resume-overview-panel.tsx", import.meta.url), "utf-8");

describe("ResumeOverviewPanel visual density", () => {
  it("matches the airy resume detail pattern without nested bordered cards", () => {
    expect(source).toContain("function SummaryItem");
    expect(source).toContain("<dt");
    expect(source).toContain("<dd");
    expect(source).toContain('className="space-y-8"');
    expect(source).toContain("rounded-2xl bg-muted/20 p-5");
    expect(source).toContain("border-t border-border/50 pt-6");
    expect(source).toContain("rounded-full bg-background px-2.5 py-1 text-xs");
    expect(source).not.toContain("SoftPanel");
    expect(source).not.toContain("rounded-2xl border border-border bg-background p-5");
  });
});
