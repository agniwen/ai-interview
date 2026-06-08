import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start studio interviews migration", () => {
  it("registers the studio interviews route in the generated route tree", () => {
    expect(readSource("routeTree.gen.ts")).toContain("'/w/$slug/studio/interviews'");
  });

  it("keeps the migrated interviews route and page free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.studio.interviews.tsx"),
      readSource("components/studio/interviews/interview-management-page.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:dynamic|navigation|headers|server|cache)/u);
  });
});
