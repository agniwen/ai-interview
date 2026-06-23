import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start studio CRUD route migration", () => {
  const routes = [
    "/w/$slug/studio/job-descriptions",
    "/w/$slug/studio/interviewers",
    "/w/$slug/studio/departments",
    "/w/$slug/studio/forms",
  ];

  it("registers migrated studio CRUD routes in the generated route tree", () => {
    const routeTree = readSource("routeTree.gen.ts");

    for (const route of routes) {
      expect(routeTree).toContain(`'${route}'`);
    }
  });

  it("keeps migrated studio CRUD routes and reused page components free of Next runtime imports", () => {
    const sources = [
      readSource("routes/w.$slug.studio.job-descriptions.tsx"),
      readSource("routes/w.$slug.studio.interviewers.tsx"),
      readSource("routes/w.$slug.studio.departments.tsx"),
      readSource("routes/w.$slug.studio.forms.tsx"),
      readSource("components/features/studio/job-descriptions/job-description-form-dialog.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });

  it("tracks concurrent referral link copy requests by job description id", () => {
    const source = readSource("routes/w.$slug.studio.job-descriptions.tsx");

    expect(source).toContain("copyingReferralIds");
    expect(source).toContain("new Set(current).add(record.id)");
    expect(source).toContain("next.delete(record.id)");
    expect(source).toContain("copyingReferralIds.has(r.id)");
    expect(source).not.toContain("copyingReferralId === r.id");
  });
});
