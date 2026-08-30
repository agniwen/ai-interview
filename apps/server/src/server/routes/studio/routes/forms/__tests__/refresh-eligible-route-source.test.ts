import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("form template bulk refresh route", () => {
  it("exposes refresh-eligible-candidates for unsubmitted never-started candidates", () => {
    const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
    expect(routeSource).toContain('"/:id/refresh-eligible-candidates"');
    expect(routeSource).toContain("refreshEligibleCandidatesForFormTemplate");
  });
});
