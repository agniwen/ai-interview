import { describe, expect, it } from "vitest";
import { formatSyntheticEvalReport } from "./report";

describe("formatSyntheticEvalReport", () => {
  it("renders coverage and stability guardrails", () => {
    const report = formatSyntheticEvalReport({
      endedAt: "2026-07-19T01:01:00.000Z",
      gitSha: "abcdef12",
      metrics: {
        actionAgreementRate: 0.9,
        allowedActionRate: 1,
        baseScoreSpreadMax: 7,
        dimensionBandPassRate: 0.95,
        maxDimensionScoreSpread: 11,
        perCase: [],
        rationaleTermCoverage: 0.9,
        successRate: 1,
        totalRuns: 18,
      },
      runsPerCase: 3,
      startedAt: "2026-07-19T01:00:00.000Z",
    });

    expect(report).toContain("结构成功率: 100.0%");
    expect(report).toContain("允许行动命中率: 100.0%");
    expect(report).toContain("总分最大波动: 7");
    expect(report).toContain("仅用于 Prompt 稳定性");
  });

  it("renders unavailable expectation metrics as N/A", () => {
    const report = formatSyntheticEvalReport({
      endedAt: "2026-07-19T01:01:00.000Z",
      gitSha: "abcdef12",
      metrics: {
        actionAgreementRate: 1,
        allowedActionRate: 1,
        baseScoreSpreadMax: 0,
        dimensionBandPassRate: null,
        maxDimensionScoreSpread: 0,
        perCase: [],
        rationaleTermCoverage: null,
        successRate: 1,
        totalRuns: 3,
      },
      runsPerCase: 3,
      startedAt: "2026-07-19T01:00:00.000Z",
    });

    expect(report).toContain("维度区间命中率: N/A");
    expect(report).toContain("理由证据覆盖率: N/A");
  });
});
