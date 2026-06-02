import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../data-grid.tsx", import.meta.url), "utf-8");

describe("DataGrid header cells", () => {
  it("renders vertical dividers between header cells", () => {
    expect(source).toContain('<TableRow className="h-7"');
    expect(source).toContain("relative py-1");
    expect(source).toContain("after:absolute after:inset-y-1.5 after:right-0 after:w-px");
    expect(source).toContain("after:bg-border");
    expect(source).not.toContain("[&:not(:last-child)]:border-border/");
    expect(source).not.toContain("[&:not(:last-child)]:border-r");
  });
});
