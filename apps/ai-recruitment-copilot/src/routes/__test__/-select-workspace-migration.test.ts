import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start select workspace migration", () => {
  it("registers the select workspace route in the generated route tree", () => {
    expect(readSource("routeTree.gen.ts")).toContain("'/select-workspace'");
  });

  it("keeps migrated select workspace UI free of Next navigation primitives", () => {
    const sources = [
      readSource("routes/select-workspace.tsx"),
      readSource("components/features/select-workspace/user-menu.tsx"),
      readSource("components/features/workspace/create-workspace-dialog.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:link|navigation|headers|server)/u);
  });
});
