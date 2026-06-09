import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start studio dashboard migration", () => {
  it("registers the studio dashboard route in the generated route tree", () => {
    expect(readSource("routeTree.gen.ts")).toContain("'/w/$slug/studio/dashboard'");
  });

  it("keeps the migrated dashboard route free of Next runtime imports", () => {
    expect(readSource("routes/w.$slug.studio.dashboard.tsx")).not.toMatch(
      /next\/(?:navigation|headers|server|cache)/u,
    );
  });
});
