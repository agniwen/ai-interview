import { describe, expect, it } from "vitest";
import {
  getCandidateStageBadgeVariant,
  getPipelineStageBadgeVariant,
} from "./candidate-stage-badge";

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

describe("getPipelineStageBadgeVariant", () => {
  it("uses the recruiting desk colors when only the stage is known", () => {
    expect(getPipelineStageBadgeVariant("second_interview")).toBe("info");
    expect(getPipelineStageBadgeVariant("onboarding")).toBe("pink");
    expect(getPipelineStageBadgeVariant("ai_interview")).toBe("warning");
    expect(getPipelineStageBadgeVariant("screening")).toBe("outline");
  });
});
