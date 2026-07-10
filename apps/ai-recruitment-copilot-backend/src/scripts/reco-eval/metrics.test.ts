import { describe, expect, it } from "vitest";
import { computeMetrics } from "./metrics";
import type { PositiveVerdict } from "./types";

const v = (o: Partial<PositiveVerdict>): PositiveVerdict => ({
  candidateId: "c",
  jobDescriptionId: "j",
  klass: "hit",
  rawRank: 1,
  score: 80,
  shownRank: 1,
  ...o,
});

describe("computeMetrics", () => {
  it("微平均 + MRR", () => {
    const m = computeMetrics([
      v({ klass: "hit", rawRank: 1 }),
      v({ klass: "recall_capped", rawRank: null }),
    ]);
    expect(m.recallAt20Shown).toBeCloseTo(0.5);
    expect(m.mrr).toBeCloseTo(0.5);
    expect(m.failureCounts.recall_capped).toBe(1);
    expect(m.evaluated).toBe(2);
  });
  it("宏平均按岗位 + perJd", () => {
    const m = computeMetrics([
      v({ jobDescriptionId: "j1", klass: "hit" }),
      v({ jobDescriptionId: "j2", klass: "hit" }),
      v({ jobDescriptionId: "j2", klass: "recall_capped", rawRank: null }),
    ]);
    expect(m.macroRecallAt20Shown).toBeCloseTo(0.75);
    expect(m.jds).toBe(2);
    expect(m.perJd.find((r) => r.jobDescriptionId === "j2")?.hits).toBe(1);
  });
});
