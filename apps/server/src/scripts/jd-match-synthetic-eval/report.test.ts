import { describe, expect, it } from "vitest";
import { formatJdMatchSyntheticReport } from "./report";

describe("formatJdMatchSyntheticReport", () => {
  it("renders JD match accuracy and stability metrics", () => {
    const report = formatJdMatchSyntheticReport({
      endedAt: "2026-07-19T01:01:00.000Z",
      gitSha: "abcdef12",
      metrics: {
        candidateIdValidityRate: 1,
        expectedTop1Rate: 0.95,
        perCase: [],
        reasonTermCoverage: 0.9,
        selectionAgreementRate: 0.9,
        successRate: 1,
        totalRuns: 24,
      },
      runsPerCase: 3,
      startedAt: "2026-07-19T01:00:00.000Z",
    });

    expect(report).toContain("结构成功率: 100.0%");
    expect(report).toContain("候选 ID 合法率: 100.0%");
    expect(report).toContain("预期 Top-1 命中率: 95.0%");
    expect(report).toContain("仅用于 JD 匹配 Agent");
  });
});
