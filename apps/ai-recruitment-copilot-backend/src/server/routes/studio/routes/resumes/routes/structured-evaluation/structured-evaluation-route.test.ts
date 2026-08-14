import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const routeSource = readFileSync(new URL("route.ts", import.meta.url), "utf-8");

describe("structured resume evaluation correction boundary", () => {
  it("guards the correction by permission, organization, visibility, and run id", () => {
    expect(routeSource).toContain('requirePermission("resumeLibrary", "update")');
    expect(routeSource).toContain("activeOrg.id");
    expect(routeSource).toContain("visibilityCondition");
    expect(routeSource).toContain('for("update")');
    expect(routeSource).toContain("input.expectedRunId");
  });

  it("uses the shared correction engine and persists effective summaries only", () => {
    expect(routeSource).toContain("applyGateCorrection");
    expect(routeSource).toContain("deriveStructuredResumeSummaries");
    expect(routeSource).toContain("structuredGateSortRank");
    expect(routeSource).toContain("structuredGateStatus");
    expect(routeSource).not.toMatch(/correctionReason|correctedReason/);
  });
});
