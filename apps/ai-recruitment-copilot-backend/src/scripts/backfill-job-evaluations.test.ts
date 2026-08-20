import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  mergeAnalyzedConfig,
  needsJobEvaluationBackfill,
  parseBackfillOptions,
  shouldReuseAnalyzedDraft,
  validateAnalysisQuotes,
} from "./backfill-job-evaluations";
import type { JobEvaluationConfigAnalysis } from "./backfill-job-evaluations";

const analysis: JobEvaluationConfigAnalysis = {
  exclusionConditions: ["不接受夜班"],
  hardGates: {
    education: ["本科及以上"],
    languageAbility: [],
    other: [],
    requiredCertificates: [],
    requiredSkills: ["必须掌握 TypeScript"],
    workExperience: [],
    workLocation: [],
  },
  priorityConditions: ["有 PostgreSQL 经验优先"],
};

describe("job evaluation backfill", () => {
  it("preserves weights and deduction rules while mapping condition points to five", () => {
    const base = createDefaultJobDescriptionStructuredConfig();
    base.weights.skillMatch = 30;
    base.weights.projectMatch = 20;
    const result = mergeAnalyzedConfig(base, analysis);

    expect(result.weights).toEqual(base.weights);
    expect(result.deductionRules).toEqual(base.deductionRules);
    expect(result.priorityConditions[0]?.points).toBe(5);
    expect(result.exclusionConditions[0]?.points).toBe(5);
    expect(result.hardGates.requiredSkills).toBe("必须掌握 TypeScript");
  });

  it("rejects AI conditions that cannot be audited against the JD", () => {
    expect(() =>
      validateAnalysisQuotes(analysis, "本科及以上；必须掌握 TypeScript；有 PostgreSQL 经验优先"),
    ).toThrow("不接受夜班");
  });

  it("selects legacy jobs and invalid structured blueprints only", () => {
    const common = {
      createdBy: null,
      evaluationBlueprintHash: null,
      id: "job-1",
      lifecycleStatus: "published" as const,
      name: "岗位",
      prompt: "JD",
      structuredConfig: {},
    };
    expect(
      needsJobEvaluationBackfill({
        ...common,
        evaluationBlueprint: null,
        evaluationMode: "legacy",
      }),
    ).toBe(true);
    expect(
      needsJobEvaluationBackfill({
        ...common,
        evaluationBlueprint: {},
        evaluationMode: "structured",
      }),
    ).toBe(true);
  });

  it("defaults to dry-run with ten workers and caps concurrency", () => {
    expect(parseBackfillOptions([])).toEqual({ apply: false, concurrency: 10 });
    expect(parseBackfillOptions(["--apply", "--concurrency=3", "--limit=2"])).toEqual({
      apply: true,
      concurrency: 3,
      limit: 2,
    });
    expect(() => parseBackfillOptions(["--concurrency=11"])).toThrow("1 到 10");
  });

  it("reuses a persisted analysis after the draft has been updated", () => {
    expect(shouldReuseAnalyzedDraft(1)).toBe(false);
    expect(shouldReuseAnalyzedDraft(2)).toBe(true);
  });
});
