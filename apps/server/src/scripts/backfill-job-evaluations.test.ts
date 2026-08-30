import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  buildAnalysisPrompt,
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

  it("keeps soft qualities and ordinary responsibilities out of hard gates", () => {
    const prompt = buildAnalysisPrompt("负责架构设计，具备良好的抗压能力；Go 或 Java 均可");

    expect(prompt).toContain("客观、可由简历直接核验");
    expect(prompt).toContain("职责描述、软性能力、工作风格、抗压、协作、架构能力");
    expect(prompt).toContain("不得因为它出现在“任职要求”章节就默认视为硬性门槛");
    expect(prompt).toContain("保留 JD 原文中的“且 / 并 / 同时 / 或 / 任一”关系");
    expect(prompt).toContain("由模型根据语义判断是全部必须，还是同类能力掌握任意一种即可");
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
    expect(parseBackfillOptions([])).toEqual({ apply: false, concurrency: 10, refresh: false });
    expect(parseBackfillOptions(["--apply", "--concurrency=3", "--limit=2"])).toEqual({
      apply: true,
      concurrency: 3,
      limit: 2,
      refresh: false,
    });
    expect(parseBackfillOptions(["--apply", "--job-id=job-1", "--refresh"])).toEqual({
      apply: true,
      concurrency: 10,
      jobId: "job-1",
      refresh: true,
    });
    expect(() => parseBackfillOptions(["--refresh"])).toThrow("--job-id");
    expect(() => parseBackfillOptions(["--concurrency=11"])).toThrow("1 到 10");
  });

  it("reuses a persisted analysis after the draft has been updated", () => {
    expect(shouldReuseAnalyzedDraft(1)).toBe(false);
    expect(shouldReuseAnalyzedDraft(2)).toBe(true);
  });
});
