import { describe, expect, it } from "vitest";
import { getCandidateStageBadgeVariant } from "./candidate-stage-badge";

describe("getCandidateStageBadgeVariant", () => {
  it("maps the human interview and Offer stages to stable Badge variants", () => {
    expect(getCandidateStageBadgeVariant("second_interview")).toBe("info");
    expect(getCandidateStageBadgeVariant("offer")).toBe("pink");
  });

  it("leaves unrelated candidate stages to their existing status tone", () => {
    expect(getCandidateStageBadgeVariant("screening")).toBeNull();
    expect(getCandidateStageBadgeVariant("ai_interview")).toBeNull();
  });
});
