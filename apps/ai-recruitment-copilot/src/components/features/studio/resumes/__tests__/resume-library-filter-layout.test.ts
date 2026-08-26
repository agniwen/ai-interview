import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../resume-library-page-list.tsx", import.meta.url), "utf-8");

describe("recruitment filter layout", () => {
  it("does not force standalone input corners onto fused filter segments", () => {
    expect(source).not.toContain("[&_[data-slot=input-control]]:!rounded-lg");
    expect(source).toContain(
      "[&_[data-slot=input-control]:not([data-slot=filter-chip]_*)]:!rounded-lg",
    );
  });
});
