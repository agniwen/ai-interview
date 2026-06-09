import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");
const routeRoot = path.join(srcRoot, "routes");

function listRouteFiles(dir = routeRoot): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return listRouteFiles(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".tsx") ? [fullPath] : [];
  });
}

describe("route page component colocation", () => {
  it("keeps route-owned pages in route files instead of components/page modules", () => {
    const offenders = listRouteFiles().flatMap((file) => {
      const source = readFileSync(file, "utf-8");
      const matches = source.matchAll(
        /from\s+"@\/components\/[^"]*(?:-page|management-page|dashboard-page|library-page)"/gu,
      );
      return [...matches].map((match) => `${path.relative(srcRoot, file)}: ${match[0]}`);
    });

    expect(offenders).toEqual([]);
  });
});
