import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start workspace shell migration", () => {
  it("registers workspace shell routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    expect(routeTree).toContain("'/w/$slug'");
    expect(routeTree).toContain("'/w/$slug/chat'");
    expect(routeTree).toContain("'/w/$slug/chat/'");
    expect(routeTree).toContain("'/w/$slug/chat/$sessionId'");
    expect(routeTree).toContain("'/w/$slug/studio'");
  });

  it("keeps migrated workspace shell files free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.tsx"),
      readSource("routes/w.$slug.chat.tsx"),
      readSource("routes/w.$slug.studio.tsx"),
      readSource("lib/client/workspace-page-view-tracker.tsx"),
      readSource("components/chat/background-stream-toaster.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:link|navigation|headers|server|cache)/u);
  });
});
