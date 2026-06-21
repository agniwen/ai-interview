import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("candidate-basic-info-view.tsx", import.meta.url), "utf-8");

describe("CandidateBasicInfoView visual density", () => {
  it("renders details as airy facts with a lightweight resume attachment row", () => {
    expect(source).toContain("function Row");
    expect(source).toContain("text-muted-foreground text-xs");
    expect(source).toContain("mt-1 min-w-0 break-words text-sm leading-6");
    expect(source).toContain("grid gap-x-8 gap-y-4 md:grid-cols-2");
    expect(source).toContain("rounded-xl bg-muted/30 px-3 py-2");
    expect(source).not.toContain("flex items-baseline gap-3 text-sm");
    expect(source).not.toContain("rounded-md border border-border/70");
  });
});
