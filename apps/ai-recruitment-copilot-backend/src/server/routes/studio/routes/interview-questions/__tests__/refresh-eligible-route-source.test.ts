import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("interview question template bulk refresh route", () => {
  it("exposes refresh-eligible-candidates for never-started candidates", () => {
    const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
    expect(routeSource).toContain('"/:id/refresh-eligible-candidates"');
    expect(routeSource).toContain("refreshEligibleCandidatesForInterviewQuestionTemplate");
  });
});
