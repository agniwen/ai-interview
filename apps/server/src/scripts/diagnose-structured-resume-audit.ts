import { isDeepStrictEqual } from "node:util";
import { structuredResumeRuleIdSchema } from "@arc/db-schema/job-description-structured-config";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import {
  areStructuredResumeEvidenceSourcesValid,
  computeStructuredResumeEvaluation,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import { z } from "zod";
import { computeJobEvaluationPayloadHash } from "../lib/server/job-evaluation-hash";

interface AuditCheck {
  detail: string;
  id: string;
  status: "flagged" | "passed";
}

export interface ArtifactAudit {
  checks: AuditCheck[];
  flaggedCheckIds: string[];
  status: "flagged" | "passed";
}

type StructuredArtifact = z.infer<typeof structuredResumeEvaluationV1Schema>;
type ArtifactRuleJudgment = StructuredArtifact["dimensions"]["skillMatch"]["ruleJudgments"][number];

function auditCheck(id: string, passed: boolean, detail: string): AuditCheck {
  return { detail, id, status: passed ? "passed" : "flagged" };
}

function parseRuleJudgments(judgments: ArtifactRuleJudgment[]) {
  return judgments.map((judgment) => ({
    ...judgment,
    ruleId: structuredResumeRuleIdSchema.parse(judgment.ruleId),
  }));
}

function collectArtifactEvidence(artifact: StructuredArtifact) {
  return [
    ...artifact.gates.judgments.flatMap((judgment) => judgment.evidence),
    ...STRUCTURED_RESUME_DIMENSIONS.flatMap((dimension) => [
      ...artifact.dimensions[dimension].ruleJudgments.flatMap((judgment) => judgment.evidence),
      ...artifact.dimensions[dimension].appliedDeductions.flatMap((judgment) => judgment.evidence),
    ]),
    ...artifact.adjustments.matches.flatMap((match) => match.evidence),
    ...artifact.skillAssessments.flatMap((assessment) => assessment.evidence),
    ...artifact.timeline.employmentEpisodes.flatMap((episode) => episode.evidence),
  ];
}

export function auditStructuredArtifact(
  value: StructuredArtifact,
  input: {
    expectedBlueprintHash: string;
    expectedInputHash: string;
    resumeProfile: ResumeProfile;
    resumeText: string;
  },
): ArtifactAudit {
  const schemaResult = structuredResumeEvaluationV1Schema.safeParse(value);
  if (!schemaResult.success) {
    const checks = [auditCheck("artifact-schema", false, z.prettifyError(schemaResult.error))];
    return { checks, flaggedCheckIds: ["artifact-schema"], status: "flagged" };
  }
  const artifact = schemaResult.data;
  const dimensionRuleJudgments = {
    educationBackground: parseRuleJudgments(artifact.dimensions.educationBackground.ruleJudgments),
    experienceRelevance: parseRuleJudgments(artifact.dimensions.experienceRelevance.ruleJudgments),
    potential: parseRuleJudgments(artifact.dimensions.potential.ruleJudgments),
    projectMatch: parseRuleJudgments(artifact.dimensions.projectMatch.ruleJudgments),
    skillMatch: parseRuleJudgments(artifact.dimensions.skillMatch.ruleJudgments),
    stability: parseRuleJudgments(artifact.dimensions.stability.ruleJudgments),
  };
  const recomputed = computeStructuredResumeEvaluation({
    adjustments: artifact.adjustments.matches,
    deductionRules: artifact.jobConfig.deductionRules,
    dimensionRuleJudgments,
    gateJudgments: artifact.gates.judgments,
    weights: artifact.weights,
  });
  const storedCalculation = {
    adjustedHundredths: artifact.calculations.adjustedHundredths,
    adjustments: artifact.adjustments.matches,
    clampedHundredths: artifact.calculations.clampedHundredths,
    compositeScore: artifact.calculations.compositeScore,
    dimensions: Object.fromEntries(
      STRUCTURED_RESUME_DIMENSIONS.map((dimension) => [
        dimension,
        {
          appliedDeductions: artifact.dimensions[dimension].appliedDeductions,
          deductionTotal: artifact.dimensions[dimension].deductionTotal,
          insufficientEvidenceRuleIds: artifact.dimensions[dimension].insufficientEvidenceRuleIds,
          rawScore: artifact.dimensions[dimension].rawScore,
          weight: artifact.dimensions[dimension].weight,
          weightedContributionHundredths:
            artifact.dimensions[dimension].weightedContributionHundredths,
        },
      ]),
    ),
    exclusionPointTotal: artifact.adjustments.exclusionPointTotal,
    gates: artifact.gates,
    grade: artifact.grade,
    priorityPointTotal: artifact.adjustments.priorityPointTotal,
    weightedBaseHundredths: artifact.calculations.weightedBaseHundredths,
  };
  const expectedGateIds = artifact.blueprint.hardGateRequirements
    .map((requirement) => requirement.requirementId)
    .toSorted();
  const actualGateIds = artifact.gates.judgments
    .map((judgment) => judgment.requirementId)
    .toSorted();
  const evidence = collectArtifactEvidence(artifact);
  const expectedTimeline = input.resumeProfile.scoringFacts?.employmentEpisodes ?? [];
  const actualTimelineById = new Map(
    artifact.timeline.employmentEpisodes.map((episode) => [episode.id, episode]),
  );
  const timelinePreserved = expectedTimeline.every((episode) => {
    const actual = actualTimelineById.get(`work-${episode.sourceIndex}`);
    return (
      actual?.startMonth === episode.startMonth &&
      actual.endMonth === episode.endMonth &&
      actual.current === (episode.currentStatus === "current") &&
      actual.primaryStatus === episode.primaryStatus
    );
  });
  const checks = [
    auditCheck("artifact-schema", true, "产物通过 StructuredResumeEvaluationV1 schema。"),
    auditCheck(
      "deterministic-recompute",
      isDeepStrictEqual(storedCalculation, recomputed),
      "使用冻结配置、事实判断和门槛重新执行确定性算分，并与产物逐字段比较。",
    ),
    auditCheck(
      "blueprint-hash",
      artifact.blueprintHash === input.expectedBlueprintHash &&
        computeJobEvaluationPayloadHash(artifact.blueprint) === artifact.blueprintHash,
      "产物蓝图哈希应同时匹配已发布快照和产物内蓝图。",
    ),
    auditCheck(
      "job-config-hash",
      computeJobEvaluationPayloadHash(artifact.jobConfig) === artifact.jobConfigHash,
      "产物岗位评分配置哈希应可由冻结配置重算。",
    ),
    auditCheck(
      "input-hash",
      artifact.inputHash === input.expectedInputHash,
      "产物输入哈希应匹配本次重新解析后的简历输入。",
    ),
    auditCheck(
      "gate-completeness",
      isDeepStrictEqual(expectedGateIds, actualGateIds) &&
        new Set(actualGateIds).size === actualGateIds.length,
      `岗位蓝图门槛 ${expectedGateIds.length} 项，产物判断 ${actualGateIds.length} 项。`,
    ),
    auditCheck(
      "timeline-preservation",
      timelinePreserved,
      `解析输入包含 ${expectedTimeline.length} 段评分时间线，评分产物必须保留日期、在职和主职状态。`,
    ),
    auditCheck(
      "evidence-source",
      areStructuredResumeEvidenceSourcesValid({
        evidence,
        resumeProfile: input.resumeProfile,
        resumeText: input.resumeText,
      }),
      `校验 ${evidence.length} 条证据都能在本次简历输入中逐字找到。`,
    ),
    auditCheck(
      "profile-only-evidence",
      evidence.every((item) => item.source === "resume_profile"),
      "当前新规则提示词要求所有 Agent 证据只来自结构化 resumeProfile。",
    ),
  ];
  const flaggedCheckIds = checks
    .filter((check) => check.status === "flagged")
    .map((check) => check.id);
  return {
    checks,
    flaggedCheckIds,
    status: flaggedCheckIds.length === 0 ? "passed" : "flagged",
  };
}
