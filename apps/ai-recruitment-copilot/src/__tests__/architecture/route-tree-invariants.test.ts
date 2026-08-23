import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = path.resolve(import.meta.dirname, "../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(appRoot, relativePath), "utf-8");
}

/** Critical product routes that must remain registered after refactors. */
const REQUIRED_ROUTES = [
  "'/'",
  "'/w/$slug'",
  "'/w/$slug/studio'",
  "'/w/$slug/studio/resumes'",
  "'/w/$slug/studio/resumes/$recordId'",
  "'/w/$slug/studio/resumes/overlay/$recordId'",
  "'/w/$slug/studio/interviews'",
  "'/w/$slug/studio/job-descriptions'",
  "'/w/$slug/studio/resume-pool'",
  "'/w/$slug/chat'",
  "'/w/$slug/agent'",
  "'/interview/$id'",
  "'/resume-review/$slug/$recordId'",
  "'/join/$code'",
  "'/login'",
] as const;

describe("route tree invariants", () => {
  it("registers the critical workspace and public routes", () => {
    const routeTree = readSource("src/routeTree.gen.ts");

    for (const route of REQUIRED_ROUTES) {
      expect(routeTree, `missing route ${route}`).toContain(route);
    }
  });

  it("keeps recruiter detail and member review routes distinct", () => {
    const routeTree = readSource("src/routeTree.gen.ts");

    expect(routeTree).toContain("'/w/$slug/studio/resumes/$recordId'");
    expect(routeTree).toContain("'/resume-review/$slug/$recordId'");
  });
});
