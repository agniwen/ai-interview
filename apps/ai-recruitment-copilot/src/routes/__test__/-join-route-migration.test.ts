import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start join route migration", () => {
  it("registers the public join route in the generated route tree", () => {
    expect(readSource("routeTree.gen.ts")).toContain("'/join/$code'");
  });

  it("keeps migrated join UI free of Next navigation primitives", () => {
    const sources = [
      readSource("components/join/join-client.tsx"),
      readSource("components/join/invalid-join-link.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:link|navigation)/u);
  });
});
