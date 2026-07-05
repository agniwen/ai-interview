import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start legacy entry migration", () => {
  it("registers root and legacy redirect routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    expect(routeTree).toContain("'/'");
    expect(routeTree).toContain("'/agent'");
    expect(routeTree).toContain("'/chat'");
    expect(routeTree).toContain("'/interview'");
    expect(routeTree).toContain("'/studio/interviews'");
    expect(routeTree).toContain("'/studio/resumes'");
  });

  it("keeps migrated entry routes free of Next runtime imports", () => {
    const sources = [
      readSource("routes/index.tsx"),
      readSource("routes/agent.tsx"),
      readSource("routes/chat.tsx"),
      readSource("routes/interview.tsx"),
      readSource("routes/studio.interviews.tsx"),
      readSource("routes/studio.resumes.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(/next\/(?:navigation|headers|server)/u);
  });
});
