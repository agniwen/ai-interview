import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start platform route migration", () => {
  const routes = ["/platform", "/platform/organizations", "/platform/users", "/platform/analytics"];

  it("registers migrated platform routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    for (const route of routes) {
      expect(routeTree).toContain(`'${route}'`);
    }
  });

  it("keeps migrated platform routes and reused components free of Next runtime imports", () => {
    const sources = [
      readSource("routes/platform.tsx"),
      readSource("routes/platform.organizations.tsx"),
      readSource("routes/platform.users.tsx"),
      readSource("routes/platform.analytics.tsx"),
      readSource("components/platform/platform-sidebar-slots.tsx"),
      readSource("components/platform/platform-header.tsx"),
      readSource("components/platform/organizations/organizations-grid.tsx"),
      readSource("components/platform/users/users-grid.tsx"),
      readSource("components/layout/platform-sidebar/platform-logo.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });
});
