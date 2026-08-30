import { describe, expect, it } from "vitest";
import { isMinedPositive } from "./mine-labels";

const P = (outcome: string, pipelineStage: string, previousStage: string | null = null) => ({
  outcome,
  pipelineStage,
  previousStage,
});

describe("isMinedPositive", () => {
  it("ai_interview 正例", () =>
    expect(isMinedPositive(P("in_pipeline", "ai_interview"))).toBe(true));
  it("screening in_pipeline 非正例", () =>
    expect(isMinedPositive(P("in_pipeline", "screening"))).toBe(false));
  it("初筛拒非正例", () =>
    expect(isMinedPositive(P("rejected", "closed", "screening"))).toBe(false));
  it("后期拒(已知进阶阶段)正例", () =>
    expect(isMinedPositive(P("rejected", "closed", "ai_interview"))).toBe(true));
  it("后期拒但 previousStage=null 非正例", () =>
    expect(isMinedPositive(P("rejected", "closed", null))).toBe(false));
  it("hired 正例", () => expect(isMinedPositive(P("hired", "closed", "offer"))).toBe(true));
  it("withdrawn 非正例", () =>
    expect(isMinedPositive(P("withdrawn", "closed", "ai_interview"))).toBe(false));
  it("archived 非正例", () =>
    expect(isMinedPositive(P("archived", "closed", "offer"))).toBe(false));
});
