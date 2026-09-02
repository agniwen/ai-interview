import { describe, expect, it } from "vitest";
import {
  createDefaultJobDescriptionStructuredConfig,
  jobDescriptionStructuredConfigSchema,
} from "@app/db-schema/job-description-structured-config";
import {
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
} from "@app/db-schema/job-description-evaluation";
import { structuredResumeEvaluationV1Schema } from "@app/db-schema/structured-resume-evaluation";
import {
  STRUCTURED_RESUME_DIMENSIONS,
  applyGateCorrection,
  computeRelevantExperience,
  computeStructuredResumeEvaluation,
  deriveTimelineFacts,
  deriveStructuredResumeSummaries,
} from "../structured-resume-scoring";
import type { StructuredResumeCalculationInput } from "../structured-resume-scoring";

const evidence = [{ quote: "简历证据", source: "resume_profile" as const }];

function baseInput(): StructuredResumeCalculationInput {
  return {
    adjustments: [],
    deductionRules: createDefaultJobDescriptionStructuredConfig().deductionRules,
    dimensionRuleJudgments: {
      educationBackground: [],
      experienceRelevance: [],
      potential: [],
      projectMatch: [],
      skillMatch: [],
      stability: [],
    },
    gateJudgments: [],
    weights: createDefaultJobDescriptionStructuredConfig().weights,
  };
}

describe("structured job configuration", () => {
  it("preserves the accepted default integer weights", () => {
    expect(createDefaultJobDescriptionStructuredConfig().weights).toEqual({
      educationBackground: 10,
      experienceRelevance: 25,
      potential: 8,
      projectMatch: 15,
      skillMatch: 35,
      stability: 7,
    });
  });

  it("rejects duplicate condition identities and normalized text across both lists", () => {
    const config = createDefaultJobDescriptionStructuredConfig();
    const duplicateId = jobDescriptionStructuredConfigSchema.safeParse({
      ...config,
      exclusionConditions: [{ condition: "频繁跨行", id: "same", points: 5 }],
      priorityConditions: [{ condition: "核心项目", id: "same", points: 5 }],
    });
    const duplicateText = jobDescriptionStructuredConfigSchema.safeParse({
      ...config,
      exclusionConditions: [{ condition: " 熟练  TypeScript ", id: "exclude", points: 5 }],
      priorityConditions: [{ condition: "熟练 typescript", id: "priority", points: 5 }],
    });

    expect(duplicateId.success).toBe(false);
    expect(duplicateText.success).toBe(false);
  });

  it("requires integer weights totaling 100 and non-zero integer adjustment points", () => {
    const config = createDefaultJobDescriptionStructuredConfig();

    expect(
      jobDescriptionStructuredConfigSchema.safeParse({
        ...config,
        weights: { ...config.weights, stability: 6 },
      }).success,
    ).toBe(false);
    expect(
      jobDescriptionStructuredConfigSchema.safeParse({
        ...config,
        priorityConditions: [{ condition: "加分", id: "p1", points: 0 }],
      }).success,
    ).toBe(false);
    expect(
      jobDescriptionStructuredConfigSchema.safeParse({
        ...config,
        priorityConditions: [{ condition: "加分", id: "p1", points: 1.5 }],
      }).success,
    ).toBe(false);
  });

  it("keeps direct-zero rule points fixed at zero", () => {
    const config = createDefaultJobDescriptionStructuredConfig();
    config.deductionRules["skill.no_related_skill"].points = 10;

    expect(jobDescriptionStructuredConfigSchema.safeParse(config).success).toBe(false);
  });
});

describe("computeStructuredResumeEvaluation", () => {
  it("records a direct-zero rule as a full deduction from the 100-point baseline", () => {
    const input = baseInput();
    input.dimensionRuleJudgments.projectMatch = [
      {
        evidence: [],
        reason: "没有相关项目",
        ruleId: "project.no_relevant_project",
        status: "matched",
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    expect(result.dimensions.projectMatch).toMatchObject({
      appliedDeductions: [
        expect.objectContaining({
          appliedPoints: 100,
          ruleId: "project.no_relevant_project",
        }),
      ],
      deductionTotal: 100,
      rawScore: 0,
    });
  });

  it("keeps every dimension as an evidence-backed deduction from a 100-point baseline", () => {
    const input = baseInput();
    input.deductionRules["stability.short_tenure"].points = 80;
    input.deductionRules["stability.frequent_unrelated_industries"].points = 80;
    input.dimensionRuleJudgments.educationBackground = [
      {
        evidence: [],
        reason: "学历专业信息不足",
        ruleId: "education.major_unrelated",
        status: "insufficient_evidence",
      },
    ];
    input.dimensionRuleJudgments.stability = [
      {
        evidence,
        reason: "存在极短任职",
        ruleId: "stability.short_tenure",
        status: "matched",
      },
      {
        evidence,
        reason: "频繁切换无关行业",
        ruleId: "stability.frequent_unrelated_industries",
        status: "matched",
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    for (const dimension of STRUCTURED_RESUME_DIMENSIONS) {
      const calculation = result.dimensions[dimension];
      expect(calculation.rawScore + calculation.deductionTotal).toBe(100);
      expect(
        calculation.appliedDeductions.reduce(
          (total, deduction) => total + deduction.appliedPoints,
          0,
        ),
      ).toBe(calculation.deductionTotal);
    }
    expect(result.dimensions.educationBackground).toMatchObject({
      appliedDeductions: [
        expect.objectContaining({
          appliedPoints: 50,
          ruleId: "education.major_unrelated",
          status: "insufficient_evidence",
        }),
      ],
      deductionTotal: 50,
      rawScore: 50,
    });
    expect(result.dimensions.stability.appliedDeductions).toEqual([
      expect.objectContaining({ appliedPoints: 80, ruleId: "stability.short_tenure" }),
      expect.objectContaining({
        appliedPoints: 20,
        ruleId: "stability.frequent_unrelated_industries",
      }),
    ]);
  });

  it("keeps all six raw scores while a zero-weight dimension contributes zero", () => {
    const input = baseInput();
    input.weights = {
      educationBackground: 10,
      experienceRelevance: 25,
      potential: 8,
      projectMatch: 15,
      skillMatch: 0,
      stability: 42,
    };
    input.dimensionRuleJudgments.skillMatch = [
      {
        evidence,
        reason: "缺失一项核心技能",
        ruleId: "skill.missing_core",
        status: "matched",
        units: 1,
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    expect(result.dimensions.skillMatch.rawScore).toBe(86);
    expect(result.dimensions.skillMatch.weight).toBe(0);
    expect(result.dimensions.skillMatch.weightedContributionHundredths).toBe(0);
    expect(Object.keys(result.dimensions)).toHaveLength(6);
  });

  it("uses catalog deductions, threshold-family exclusivity, direct zero, and evidence caps", () => {
    const input = baseInput();
    input.dimensionRuleJudgments.stability = [
      {
        evidence,
        reason: "两年内跳槽两次",
        ruleId: "stability.two_changes_two_years",
        status: "matched",
      },
      {
        evidence,
        reason: "一年内跳槽三次",
        ruleId: "stability.three_changes_one_year",
        status: "matched",
      },
      {
        evidence,
        reason: "一段经历不足三个月",
        ruleId: "stability.short_tenure",
        status: "matched",
        units: 2,
      },
    ];
    input.dimensionRuleJudgments.educationBackground = [
      {
        evidence: [],
        reason: "没有足够学历信息",
        ruleId: "education.major_unrelated",
        status: "insufficient_evidence",
      },
    ];
    input.dimensionRuleJudgments.projectMatch = [
      {
        evidence: [],
        reason: "无相关项目",
        ruleId: "project.no_relevant_project",
        status: "matched",
      },
      {
        evidence,
        reason: "仅边缘参与",
        ruleId: "project.edge_participation",
        status: "matched",
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    expect(result.dimensions.stability.deductionTotal).toBe(64);
    expect(result.dimensions.stability.rawScore).toBe(36);
    expect(result.dimensions.educationBackground.rawScore).toBe(50);
    expect(result.dimensions.projectMatch.rawScore).toBe(0);
    expect(result.dimensions.projectMatch.deductionTotal).toBe(100);
    expect(result.dimensions.projectMatch.appliedDeductions).toEqual([
      expect.objectContaining({
        appliedPoints: 100,
        ruleId: "project.no_relevant_project",
      }),
    ]);
  });

  it("uses the job-owned enabled state and deduction points", () => {
    const input = baseInput();
    input.deductionRules["skill.missing_core"] = { enabled: true, points: 21 };
    input.deductionRules["skill.missing_auxiliary"] = { enabled: false, points: 4 };
    input.dimensionRuleJudgments.skillMatch = [
      {
        evidence,
        reason: "缺失一项核心技能",
        ruleId: "skill.missing_core",
        status: "matched",
      },
      {
        evidence,
        reason: "缺失一项辅助技能",
        ruleId: "skill.missing_auxiliary",
        status: "matched",
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    expect(result.dimensions.skillMatch.deductionTotal).toBe(21);
    expect(result.dimensions.skillMatch.rawScore).toBe(79);
    expect(result.dimensions.skillMatch.appliedDeductions.map((item) => item.ruleId)).toEqual([
      "skill.missing_core",
    ]);
  });

  it("selects the most severe threshold tier even when its configured points are lower", () => {
    const input = baseInput();
    input.deductionRules["stability.two_changes_two_years"].points = 50;
    input.deductionRules["stability.three_changes_one_year"].points = 5;
    input.dimensionRuleJudgments.stability = [
      {
        evidence,
        reason: "两年内跳槽两次",
        ruleId: "stability.two_changes_two_years",
        status: "matched",
      },
      {
        evidence,
        reason: "一年内跳槽三次",
        ruleId: "stability.three_changes_one_year",
        status: "matched",
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    expect(result.dimensions.stability.deductionTotal).toBe(5);
    expect(result.dimensions.stability.appliedDeductions).toEqual([
      expect.objectContaining({ ruleId: "stability.three_changes_one_year" }),
    ]);
  });

  it("uses exact hundredths, adjustments, clamping, and half-up integer rounding", () => {
    const input = baseInput();
    input.weights = {
      educationBackground: 0,
      experienceRelevance: 50,
      potential: 0,
      projectMatch: 0,
      skillMatch: 50,
      stability: 0,
    };
    input.dimensionRuleJudgments.skillMatch = [
      {
        evidence,
        reason: "缺失辅助技能",
        ruleId: "skill.missing_auxiliary",
        status: "matched",
        units: 1,
      },
    ];
    input.dimensionRuleJudgments.experienceRelevance = [
      {
        evidence,
        reason: "少一年",
        ruleId: "experience.missing_year",
        status: "matched",
        units: 1,
      },
    ];
    input.adjustments = [
      {
        conditionId: "priority",
        evidence,
        kind: "priority",
        matched: true,
        points: 2,
        reason: "命中优先条件",
        sourceText: "核心业务经验",
      },
    ];

    const result = computeStructuredResumeEvaluation(input);

    expect(result.weightedBaseHundredths).toBe(9350);
    expect(result.adjustedHundredths).toBe(9550);
    expect(result.compositeScore).toBe(96);
    expect(result.grade).toBe("recommended");
  });

  it("aggregates raw and corrected gates independently without changing scores", () => {
    const input = baseInput();
    input.gateJudgments = [
      {
        aiStatus: "failed",
        category: "required_skills",
        evidence,
        reason: "缺失必备技能",
        requirementId: "gate-1",
      },
    ];
    const evaluation = computeStructuredResumeEvaluation(input);
    const corrected = applyGateCorrection(evaluation, {
      correctedAt: "2026-07-29T10:00:00.000Z",
      correctedBy: "recruiter-1",
      correctedStatus: "passed",
      requirementId: "gate-1",
    });

    expect(evaluation.gates.rawStatus).toBe("failed");
    expect(corrected.gates.rawStatus).toBe("failed");
    expect(corrected.gates.effectiveStatus).toBe("passed");
    expect(corrected.compositeScore).toBe(evaluation.compositeScore);
    expect(deriveStructuredResumeSummaries(corrected)).toEqual({
      compositeScore: corrected.compositeScore,
      gateSortRank: 0,
      gateStatus: "passed",
      grade: corrected.grade,
    });
  });
});

describe("computeRelevantExperience", () => {
  it("merges overlapping relevant months and ignores unrelated episodes", () => {
    const result = computeRelevantExperience({
      episodes: [
        {
          endMonth: "2024-06",
          relevance: "relevant",
          startMonth: "2023-01",
        },
        {
          endMonth: "2024-12",
          relevance: "relevant",
          startMonth: "2024-01",
        },
        {
          endMonth: "2025-12",
          relevance: "not_relevant",
          startMonth: "2025-01",
        },
      ],
      relevanceScope: "role",
      requiredYears: 3,
    });

    expect(result.relevantMonths).toBe(24);
    expect(result.relevantYears).toBe(2);
    expect(result.missingYearUnits).toBe(1);
    expect(result.status).toBe("matched");
  });

  it("uses work-years fallback only for total employment", () => {
    expect(
      computeRelevantExperience({
        episodes: [],
        profileWorkYears: 4,
        relevanceScope: "total_employment",
        requiredYears: 3,
      }).status,
    ).toBe("not_matched");
    expect(
      computeRelevantExperience({
        episodes: [],
        profileWorkYears: 4,
        relevanceScope: "industry",
        requiredYears: 3,
      }).status,
    ).toBe("insufficient_evidence");
  });

  it("treats resolved episodes as relevant for total employment and lets known sufficiency win", () => {
    expect(
      computeRelevantExperience({
        episodes: [
          {
            endMonth: "2026-06",
            relevance: "not_relevant",
            startMonth: "2023-07",
          },
          {
            endMonth: "2023-06",
            relevance: "insufficient_evidence",
            startMonth: "2023-01",
          },
        ],
        relevanceScope: "total_employment",
        requiredYears: 2,
      }),
    ).toMatchObject({
      missingYearUnits: 0,
      relevantMonths: 42,
      source: "timeline",
      status: "not_matched",
    });
  });

  it("does not treat Agent relevance uncertainty as missing evidence for total employment", () => {
    expect(
      computeRelevantExperience({
        episodes: [
          {
            endMonth: "2026-06",
            relevance: "insufficient_evidence",
            startMonth: "2023-01",
          },
        ],
        relevanceScope: "total_employment",
        requiredYears: 4,
      }),
    ).toMatchObject({
      missingYearUnits: 1,
      relevantMonths: 42,
      status: "matched",
    });
  });

  it("does not use total-work fallback for a narrower relevance scope", () => {
    expect(
      computeRelevantExperience({
        episodes: [],
        profileWorkYears: 8,
        relevanceScope: "role",
        requiredYears: 3,
      }),
    ).toMatchObject({
      relevantYears: null,
      source: null,
      status: "insufficient_evidence",
    });
  });

  it("keeps an undated relevant episode outcome unresolved when known months are insufficient", () => {
    expect(
      computeRelevantExperience({
        episodes: [
          {
            endMonth: "2024-12",
            relevance: "relevant",
            startMonth: "2024-01",
          },
          {
            endMonth: null,
            relevance: "insufficient_evidence",
            startMonth: null,
          },
        ],
        relevanceScope: "role",
        requiredYears: 2,
      }),
    ).toMatchObject({
      missingYearUnits: 1,
      relevantMonths: 12,
      status: "insufficient_evidence",
    });
  });
});

describe("deriveTimelineFacts", () => {
  it("counts a same-month employer transition as a job change", () => {
    const result = deriveTimelineFacts({
      employmentEpisodes: [
        {
          current: false,
          endMonth: "2026-01",
          id: "first",
          primaryStatus: "primary",
          startMonth: "2025-01",
        },
        {
          current: true,
          endMonth: null,
          id: "second",
          primaryStatus: "primary",
          startMonth: "2026-01",
        },
      ],
      evaluationAsOf: "2026-07-29",
      projects: [],
    });

    expect(result.jobChangesWithinOneYear).toBe(1);
    expect(result.unexplainedGapMonths).toEqual([]);
  });

  it("uses the UTC evaluation date, excludes the first job, and ignores concurrent overlap", () => {
    const result = deriveTimelineFacts({
      employmentEpisodes: [
        {
          current: false,
          endMonth: "2025-01",
          id: "first",
          primaryStatus: "primary",
          startMonth: "2024-01",
        },
        {
          current: true,
          endMonth: null,
          id: "second",
          primaryStatus: "primary",
          startMonth: "2025-03",
        },
        {
          current: false,
          endMonth: "2025-12",
          id: "side",
          primaryStatus: "concurrent",
          startMonth: "2025-06",
        },
      ],
      evaluationAsOf: "2026-07-29",
      projects: [{ current: false, endMonth: "2023-06", id: "old-project", relevant: true }],
    });

    expect(result.jobChangesWithinOneYear).toBe(0);
    expect(result.jobChangesWithinTwoYears).toBe(1);
    expect(result.shortTenureCount).toBe(0);
    expect(result.unexplainedGapMonths).toEqual([1]);
    expect(result.oldProjectIds).toEqual(["old-project"]);
    expect(result.hasUnresolvedPrimaryConcurrency).toBe(false);
  });

  it("marks primary-versus-concurrent ambiguity as unresolved", () => {
    expect(
      deriveTimelineFacts({
        employmentEpisodes: [
          {
            current: false,
            endMonth: "2026-06",
            id: "unknown",
            primaryStatus: "unresolved",
            startMonth: "2026-01",
          },
        ],
        evaluationAsOf: "2026-07-29",
        projects: [],
      }).hasUnresolvedPrimaryConcurrency,
    ).toBe(true);
  });

  it("marks a missing primary timeline as unresolved instead of reporting zero changes", () => {
    const result = deriveTimelineFacts({
      employmentEpisodes: [],
      evaluationAsOf: "2026-07-29",
      projects: [],
    });

    expect(result.hasUnresolvedPrimaryTimeline).toBe(true);
    expect(result.jobChangesWithinOneYear).toBeNull();
    expect(result.shortTenureCount).toBeNull();
  });

  it("uses only the most recent relevant project for freshness", () => {
    expect(
      deriveTimelineFacts({
        employmentEpisodes: [],
        evaluationAsOf: "2026-07-29",
        projects: [
          { current: false, endMonth: "2022-01", id: "old-unrelated", relevant: false },
          { current: true, endMonth: null, id: "current-relevant", relevant: true },
        ],
      }).oldProjectIds,
    ).toEqual([]);

    expect(
      deriveTimelineFacts({
        employmentEpisodes: [],
        evaluationAsOf: "2026-07-29",
        projects: [
          { current: false, endMonth: "2022-01", id: "old-relevant", relevant: true },
          { current: false, endMonth: "2026-01", id: "recent-relevant", relevant: true },
        ],
      }).oldProjectIds,
    ).toEqual([]);
  });

  it("keeps project freshness unresolved when no dated relevant project settles the outcome", () => {
    const unresolved = deriveTimelineFacts({
      employmentEpisodes: [],
      evaluationAsOf: "2026-07-29",
      projects: [{ current: false, endMonth: null, id: "undated-relevant", relevant: true }],
    });
    const settledByRecent = deriveTimelineFacts({
      employmentEpisodes: [],
      evaluationAsOf: "2026-07-29",
      projects: [
        { current: false, endMonth: null, id: "undated-relevant", relevant: true },
        { current: false, endMonth: "2026-01", id: "recent-relevant", relevant: true },
      ],
    });

    expect(unresolved.hasUnresolvedRelevantProjectDate).toBe(true);
    expect(unresolved.oldProjectIds).toEqual([]);
    expect(settledByRecent.hasUnresolvedRelevantProjectDate).toBe(false);
    expect(settledByRecent.oldProjectIds).toEqual([]);
  });
});

describe("structured evaluation schemas", () => {
  it("validates a source-backed blueprint and rejects invented source locations", () => {
    const blueprint = {
      auxiliarySkills: [],
      compiler: {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "model",
        promptVersion: "blueprint-v1",
      },
      coreSkills: [
        {
          normalizedSkill: "TypeScript",
          requirementGroupId: "skill-group-typescript",
          satisfactionMode: "all",
          sourceRef: { kind: "job_description", path: "description" },
          sourceText: "熟练掌握 TypeScript",
        },
      ],
      dimensionExpectations: {
        educationBackground: [],
        experienceRelevance: [],
        potential: [],
        projectMatch: [],
        skillMatch: [],
        stability: [],
      },
      educationExpectation: null,
      exclusionConditions: [],
      hardGateRequirements: [],
      priorityConditions: [],
      requiredRelevantExperience: null,
      schemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
    };

    expect(jobEvaluationBlueprintSchema.safeParse(blueprint).success).toBe(true);
    expect(
      jobEvaluationBlueprintSchema.safeParse({
        ...blueprint,
        coreSkills: [{ ...blueprint.coreSkills[0], satisfactionMode: "any" }],
      }).success,
    ).toBe(false);
    expect(
      jobEvaluationBlueprintSchema.safeParse({
        ...blueprint,
        coreSkills: [
          {
            ...blueprint.coreSkills[0],
            sourceRef: { kind: "job_prompt", path: "prompt" },
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an incomplete structured artifact", () => {
    expect(
      structuredResumeEvaluationV1Schema.safeParse({
        evaluationMode: "structured",
        schemaVersion: 1,
      }).success,
    ).toBe(false);
  });
});
