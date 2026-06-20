import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("studio-person-detail-skeletons.tsx", import.meta.url),
  "utf-8",
);

describe("Studio person detail skeleton visual density", () => {
  it("matches the breathable detail layout instead of old bordered cards", () => {
    expect(source).toContain('className="flex flex-col gap-8"');
    expect(source).toContain("rounded-2xl bg-muted/20 p-5");
    expect(source).toContain("border-t border-border/50 pt-6");
    expect(source).toContain("grid gap-x-8 gap-y-4");
    expect(source).toContain("rounded-xl bg-muted/30 px-4 py-3");
    expect(source).not.toContain("SoftPanel");
    expect(source).not.toContain("rounded-2xl border border-border bg-background p-5");
    expect(source).not.toContain("rounded-2xl border border-border bg-muted/30 p-5");
  });
});
