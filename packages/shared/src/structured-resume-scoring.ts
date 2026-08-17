import type {
  JobDescriptionDeductionRules,
  JobDescriptionDimensionWeights,
  StructuredResumeRuleId,
} from "@arc/db-schema/job-description-structured-config";
import { DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES } from "@arc/db-schema/job-description-structured-config";
import type { JsonValue } from "@arc/db-schema/json";
import type { StructuredResumeEvaluationV1 } from "@arc/db-schema/structured-resume-evaluation";
import { z } from "zod";

export const STRUCTURED_RESUME_DIMENSIONS = [
  "skillMatch",
  "experienceRelevance",
  "projectMatch",
  "educationBackground",
  "potential",
  "stability",
] as const;

export type StructuredResumeDimension = (typeof STRUCTURED_RESUME_DIMENSIONS)[number];
export type StructuredResumeRuleStatus =
  | "insufficient_evidence"
  | "matched"
  | "not_applicable"
  | "not_matched";
export type StructuredResumeGateStatus = "failed" | "needs_verification" | "passed";
export type StructuredResumeGrade = "matched" | "recommended" | "unmatched";

export interface StructuredResumeEvidence {
  quote: string;
  source: "resume_profile" | "resume_text";
}

function normalizedEvidenceText(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

const evidenceScalarSchema = z.union([z.string(), z.number(), z.boolean()]);

function collectEvidenceLeafValues(value: JsonValue | undefined, output: string[]): void {
  const scalar = evidenceScalarSchema.safeParse(value);
  if (scalar.success) {
    const normalized = normalizedEvidenceText(String(scalar.data));
    if (normalized) {
      output.push(normalized);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEvidenceLeafValues(item, output);
    }
    return;
  }
  if (value === null || value === undefined) {
    return;
  }
  for (const item of Object.values(value)) {
    collectEvidenceLeafValues(item, output);
  }
}

export function areStructuredResumeEvidenceSourcesValid(input: {
  evidence: StructuredResumeEvidence[];
  resumeProfile: JsonValue;
  resumeText: string | null;
}): boolean {
  const profileLeaves: string[] = [];
  collectEvidenceLeafValues(input.resumeProfile, profileLeaves);
  const resumeText = normalizedEvidenceText(input.resumeText ?? "");
  return input.evidence.every((item) => {
    const quote = normalizedEvidenceText(item.quote);
    if (!quote) {
      return false;
    }
    return item.source === "resume_text"
      ? resumeText.includes(quote)
      : profileLeaves.some((leaf) => leaf.includes(quote));
  });
}

export interface StructuredResumeRuleJudgment {
  evidence: StructuredResumeEvidence[];
  reason: string;
  ruleId: StructuredResumeRuleId;
  status: StructuredResumeRuleStatus;
  units?: number;
}

export interface StructuredResumeAdjustmentMatch {
  conditionId: string;
  evidence: StructuredResumeEvidence[];
  kind: "exclusion" | "priority";
  matched: boolean;
  points: number;
  reason: string;
  sourceText: string;
}

export interface StructuredResumeGateJudgment {
  aiStatus: StructuredResumeGateStatus;
  category: string;
  correction?: {
    correctedAt: string;
    correctedBy: string;
    correctedStatus: StructuredResumeGateStatus;
  };
  evidence: StructuredResumeEvidence[];
  reason: string;
  requirementId: string;
}

export interface StructuredResumeCalculationInput {
  adjustments: StructuredResumeAdjustmentMatch[];
  deductionRules: JobDescriptionDeductionRules;
  dimensionRuleJudgments: Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]>;
  gateJudgments: StructuredResumeGateJudgment[];
  weights: JobDescriptionDimensionWeights;
}

interface AppliedDeduction extends StructuredResumeRuleJudgment {
  appliedPoints: number;
}

export interface StructuredResumeDimensionCalculation {
  appliedDeductions: AppliedDeduction[];
  deductionTotal: number;
  insufficientEvidenceRuleIds: StructuredResumeRuleId[];
  rawScore: number;
  weight: number;
  weightedContributionHundredths: number;
}

export interface StructuredResumeCalculation {
  adjustedHundredths: number;
  adjustments: (StructuredResumeAdjustmentMatch & { appliedPoints: number })[];
  clampedHundredths: number;
  compositeScore: number;
  dimensions: Record<StructuredResumeDimension, StructuredResumeDimensionCalculation>;
  exclusionPointTotal: number;
  gates: {
    effectiveStatus: StructuredResumeGateStatus;
    judgments: StructuredResumeGateJudgment[];
    rawStatus: StructuredResumeGateStatus;
  };
  grade: StructuredResumeGrade;
  priorityPointTotal: number;
  weightedBaseHundredths: number;
}

export interface RecruiterGateCorrectionInput {
  correctedAt: string;
  correctedBy: string;
  correctedStatus: StructuredResumeGateStatus | null;
  requirementId: string;
}

export interface StructuredResumeSummaryFields {
  compositeScore: number;
  gateSortRank: 0 | 1 | 2;
  gateStatus: StructuredResumeGateStatus;
  grade: StructuredResumeGrade;
}

interface DeductionRule {
  dimension: StructuredResumeDimension;
  directZero?: boolean;
  points: number;
  thresholdFamily?: string;
  thresholdRank?: number;
}

export type { StructuredResumeRuleId } from "@arc/db-schema/job-description-structured-config";

export const STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION = 1;

function defineDeductionCatalog(
  catalog: Record<StructuredResumeRuleId, DeductionRule>,
): Record<StructuredResumeRuleId, DeductionRule> {
  return catalog;
}

export const STRUCTURED_RESUME_DEDUCTION_CATALOG = defineDeductionCatalog({
  "education.below_tier": {
    dimension: "educationBackground",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["education.below_tier"].points,
  },
  "education.major_unrelated": {
    dimension: "educationBackground",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["education.major_unrelated"].points,
  },
  "experience.fragmented": {
    dimension: "experienceRelevance",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["experience.fragmented"].points,
  },
  "experience.industry_unrelated": {
    dimension: "experienceRelevance",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["experience.industry_unrelated"].points,
  },
  "experience.missing_year": {
    dimension: "experienceRelevance",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["experience.missing_year"].points,
  },
  "potential.illogical_switches": {
    dimension: "potential",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["potential.illogical_switches"].points,
  },
  "potential.no_growth_two_years": {
    dimension: "potential",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["potential.no_growth_two_years"].points,
  },
  "potential.unexplained_gap_over_six_months": {
    dimension: "potential",
    points:
      DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["potential.unexplained_gap_over_six_months"].points,
  },
  "project.edge_participation": {
    dimension: "projectMatch",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["project.edge_participation"].points,
  },
  "project.no_relevant_project": {
    dimension: "projectMatch",
    directZero: true,
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["project.no_relevant_project"].points,
  },
  "project.old_relevant_project": {
    dimension: "projectMatch",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["project.old_relevant_project"].points,
  },
  "project.scale_low": {
    dimension: "projectMatch",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["project.scale_low"].points,
  },
  "skill.missing_auxiliary": {
    dimension: "skillMatch",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["skill.missing_auxiliary"].points,
  },
  "skill.missing_core": {
    dimension: "skillMatch",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["skill.missing_core"].points,
  },
  "skill.no_related_skill": {
    dimension: "skillMatch",
    directZero: true,
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["skill.no_related_skill"].points,
  },
  "skill.shallow": {
    dimension: "skillMatch",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["skill.shallow"].points,
  },
  "stability.frequent_unrelated_industries": {
    dimension: "stability",
    points:
      DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.frequent_unrelated_industries"].points,
  },
  "stability.gap_over_six_months": {
    dimension: "stability",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.gap_over_six_months"].points,
    thresholdFamily: "stability.gap_duration",
    thresholdRank: 2,
  },
  "stability.gap_three_to_six_months": {
    dimension: "stability",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.gap_three_to_six_months"].points,
    thresholdFamily: "stability.gap_duration",
    thresholdRank: 1,
  },
  "stability.short_tenure": {
    dimension: "stability",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.short_tenure"].points,
  },
  "stability.three_changes_one_year": {
    dimension: "stability",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.three_changes_one_year"].points,
    thresholdFamily: "stability.job_change_frequency",
    thresholdRank: 3,
  },
  "stability.two_changes_one_year": {
    dimension: "stability",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.two_changes_one_year"].points,
    thresholdFamily: "stability.job_change_frequency",
    thresholdRank: 2,
  },
  "stability.two_changes_two_years": {
    dimension: "stability",
    points: DEFAULT_JOB_DESCRIPTION_DEDUCTION_RULES["stability.two_changes_two_years"].points,
    thresholdFamily: "stability.job_change_frequency",
    thresholdRank: 1,
  },
});

const EVIDENCE_CAPPED_DIMENSIONS = new Set<StructuredResumeDimension>([
  "educationBackground",
  "experienceRelevance",
  "potential",
  "stability",
]);

function aggregateGateStatus(statuses: StructuredResumeGateStatus[]): StructuredResumeGateStatus {
  if (statuses.includes("failed")) {
    return "failed";
  }
  if (statuses.includes("needs_verification")) {
    return "needs_verification";
  }
  return "passed";
}

function selectedMatchedJudgments(
  judgments: StructuredResumeRuleJudgment[],
  deductionRules: JobDescriptionDeductionRules,
): StructuredResumeRuleJudgment[] {
  const ordinary: StructuredResumeRuleJudgment[] = [];
  const thresholdFamilies = new Map<string, StructuredResumeRuleJudgment>();
  for (const judgment of judgments) {
    if (judgment.status !== "matched") {
      continue;
    }
    if (!deductionRules[judgment.ruleId].enabled) {
      continue;
    }
    const rule = STRUCTURED_RESUME_DEDUCTION_CATALOG[judgment.ruleId];
    if (!rule.thresholdFamily) {
      ordinary.push(judgment);
      continue;
    }
    const selected = thresholdFamilies.get(rule.thresholdFamily);
    const selectedRank = selected
      ? (STRUCTURED_RESUME_DEDUCTION_CATALOG[selected.ruleId].thresholdRank ?? 0)
      : -1;
    if ((rule.thresholdRank ?? 0) > selectedRank) {
      thresholdFamilies.set(rule.thresholdFamily, judgment);
    }
  }
  return [...ordinary, ...thresholdFamilies.values()];
}

function calculateDimension(
  dimension: StructuredResumeDimension,
  deductionRules: JobDescriptionDeductionRules,
  judgments: StructuredResumeRuleJudgment[],
  weight: number,
): StructuredResumeDimensionCalculation {
  for (const judgment of judgments) {
    const rule = STRUCTURED_RESUME_DEDUCTION_CATALOG[judgment.ruleId];
    if (rule.dimension !== dimension) {
      throw new Error(`Rule ${judgment.ruleId} does not belong to ${dimension}.`);
    }
    if (judgment.units !== undefined && (!Number.isInteger(judgment.units) || judgment.units < 1)) {
      throw new Error(`Rule ${judgment.ruleId} units must be a positive integer.`);
    }
  }
  const selected = selectedMatchedJudgments(judgments, deductionRules);
  const appliedDeductions = selected.map((judgment) => ({
    ...judgment,
    appliedPoints: deductionRules[judgment.ruleId].points * (judgment.units ?? 1),
  }));
  const deductionTotal = appliedDeductions.reduce(
    (total, deduction) => total + deduction.appliedPoints,
    0,
  );
  const hasDirectZero = selected.some(
    (judgment) => STRUCTURED_RESUME_DEDUCTION_CATALOG[judgment.ruleId].directZero,
  );
  const insufficientEvidenceRuleIds = judgments
    .filter(
      (judgment) =>
        judgment.status === "insufficient_evidence" && deductionRules[judgment.ruleId].enabled,
    )
    .map((judgment) => judgment.ruleId);
  let rawScore = Math.max(100 - deductionTotal, 0);
  if (insufficientEvidenceRuleIds.length > 0 && EVIDENCE_CAPPED_DIMENSIONS.has(dimension)) {
    rawScore = Math.min(rawScore, 50);
  }
  if (hasDirectZero) {
    rawScore = 0;
  }
  return {
    appliedDeductions,
    deductionTotal,
    insufficientEvidenceRuleIds,
    rawScore,
    weight,
    weightedContributionHundredths: rawScore * weight,
  };
}

export function computeStructuredResumeEvaluation(
  input: StructuredResumeCalculationInput,
): StructuredResumeCalculation {
  const weightTotal = STRUCTURED_RESUME_DIMENSIONS.reduce(
    (total, dimension) => total + input.weights[dimension],
    0,
  );
  if (weightTotal !== 100) {
    throw new Error("Structured resume dimension weights must total 100.");
  }
  const dimensionEntries = STRUCTURED_RESUME_DIMENSIONS.map(
    (dimension): [StructuredResumeDimension, StructuredResumeDimensionCalculation] => [
      dimension,
      calculateDimension(
        dimension,
        input.deductionRules,
        input.dimensionRuleJudgments[dimension],
        input.weights[dimension],
      ),
    ],
  );
  // SAFETY: dimensionEntries is generated from every member of STRUCTURED_RESUME_DIMENSIONS exactly once.
  const dimensions = Object.fromEntries(dimensionEntries) as Record<
    StructuredResumeDimension,
    StructuredResumeDimensionCalculation
  >;
  const weightedBaseHundredths = STRUCTURED_RESUME_DIMENSIONS.reduce(
    (total, dimension) => total + dimensions[dimension].weightedContributionHundredths,
    0,
  );
  const adjustments = input.adjustments.map((adjustment) => {
    let appliedPoints = 0;
    if (adjustment.matched) {
      appliedPoints = adjustment.kind === "priority" ? adjustment.points : -adjustment.points;
    }
    return { ...adjustment, appliedPoints };
  });
  const priorityPointTotal = adjustments
    .filter((adjustment) => adjustment.kind === "priority")
    .reduce((total, adjustment) => total + Math.max(adjustment.appliedPoints, 0), 0);
  const exclusionPointTotal = adjustments
    .filter((adjustment) => adjustment.kind === "exclusion")
    .reduce((total, adjustment) => total + Math.max(-adjustment.appliedPoints, 0), 0);
  const adjustedHundredths =
    weightedBaseHundredths + priorityPointTotal * 100 - exclusionPointTotal * 100;
  const clampedHundredths = Math.min(Math.max(adjustedHundredths, 0), 10_000);
  const compositeScore = Math.floor((clampedHundredths + 50) / 100);
  let grade: StructuredResumeGrade = "unmatched";
  if (compositeScore >= 85) {
    grade = "recommended";
  } else if (compositeScore >= 75) {
    grade = "matched";
  }
  const rawStatus = aggregateGateStatus(input.gateJudgments.map((judgment) => judgment.aiStatus));
  const effectiveStatus = aggregateGateStatus(
    input.gateJudgments.map(
      (judgment) => judgment.correction?.correctedStatus ?? judgment.aiStatus,
    ),
  );
  return {
    adjustedHundredths,
    adjustments,
    clampedHundredths,
    compositeScore,
    dimensions,
    exclusionPointTotal,
    gates: {
      effectiveStatus,
      judgments: input.gateJudgments,
      rawStatus,
    },
    grade,
    priorityPointTotal,
    weightedBaseHundredths,
  };
}

export function applyGateCorrection(
  evaluation: StructuredResumeEvaluationV1,
  correction: RecruiterGateCorrectionInput,
): StructuredResumeEvaluationV1;
export function applyGateCorrection(
  evaluation: StructuredResumeCalculation,
  correction: RecruiterGateCorrectionInput,
): StructuredResumeCalculation;
export function applyGateCorrection(
  evaluation: StructuredResumeCalculation | StructuredResumeEvaluationV1,
  correction: RecruiterGateCorrectionInput,
): StructuredResumeCalculation | StructuredResumeEvaluationV1 {
  let found = false;
  const judgments: StructuredResumeGateJudgment[] = evaluation.gates.judgments.map((judgment) => {
    if (judgment.requirementId !== correction.requirementId) {
      return judgment;
    }
    found = true;
    const { correction: _existingCorrection, ...raw } = judgment;
    return correction.correctedStatus
      ? {
          ...raw,
          correction: {
            correctedAt: correction.correctedAt,
            correctedBy: correction.correctedBy,
            correctedStatus: correction.correctedStatus,
          },
        }
      : raw;
  });
  if (!found) {
    throw new Error(`Unknown gate requirement ${correction.requirementId}.`);
  }
  return {
    ...evaluation,
    gates: {
      effectiveStatus: aggregateGateStatus(
        judgments.map((judgment) => judgment.correction?.correctedStatus ?? judgment.aiStatus),
      ),
      judgments,
      rawStatus: evaluation.gates.rawStatus,
    },
  };
}

export function deriveStructuredResumeSummaries(
  evaluation: StructuredResumeCalculation | StructuredResumeEvaluationV1,
): StructuredResumeSummaryFields {
  const gateSortRank = (
    {
      failed: 2,
      needs_verification: 1,
      passed: 0,
    } satisfies Record<StructuredResumeGateStatus, 0 | 1 | 2>
  )[evaluation.gates.effectiveStatus];
  const compositeScore =
    "compositeScore" in evaluation
      ? evaluation.compositeScore
      : evaluation.calculations.compositeScore;
  return {
    compositeScore,
    gateSortRank,
    gateStatus: evaluation.gates.effectiveStatus,
    grade: evaluation.grade,
  };
}

interface RelevantEpisode {
  endMonth: string | null;
  relevance: "insufficient_evidence" | "not_relevant" | "relevant";
  startMonth: string | null;
}

interface RelevantExperienceInput {
  episodes: RelevantEpisode[];
  profileWorkYears?: number;
  relevanceScope: string;
  requiredYears: number;
}

interface RelevantExperienceResult {
  missingYearUnits: number;
  relevantMonths: number | null;
  relevantYears: number | null;
  source: "profile_work_years" | "timeline" | null;
  status: Extract<StructuredResumeRuleStatus, "insufficient_evidence" | "matched" | "not_matched">;
}

function monthIndex(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) {
    return null;
  }
  return Number(match[1]) * 12 + Number(match[2]) - 1;
}

export function computeRelevantExperience(
  input: RelevantExperienceInput,
): RelevantExperienceResult {
  const inScopeEpisodes = input.episodes.filter(
    (episode) => input.relevanceScope === "total_employment" || episode.relevance === "relevant",
  );
  const intervals = inScopeEpisodes
    .map((episode) => ({
      end: monthIndex(episode.endMonth),
      start: monthIndex(episode.startMonth),
    }))
    .filter(
      (interval): interval is { end: number; start: number } =>
        interval.start !== null && interval.end !== null && interval.end >= interval.start,
    )
    .toSorted((left, right) => left.start - right.start);
  if (intervals.length > 0) {
    const merged: { end: number; start: number }[] = [];
    for (const interval of intervals) {
      const previous = merged.at(-1);
      if (!previous || interval.start > previous.end + 1) {
        merged.push({ ...interval });
      } else {
        previous.end = Math.max(previous.end, interval.end);
      }
    }
    const relevantMonths = merged.reduce(
      (total, interval) => total + interval.end - interval.start + 1,
      0,
    );
    const relevantYears = relevantMonths / 12;
    const missingYearUnits = Math.max(Math.ceil(input.requiredYears - relevantYears), 0);
    const hasOutcomeChangingUnknown =
      missingYearUnits > 0 &&
      (inScopeEpisodes.length > intervals.length ||
        (input.relevanceScope !== "total_employment" &&
          input.episodes.some((episode) => episode.relevance === "insufficient_evidence")));
    let status: RelevantExperienceResult["status"] = "not_matched";
    if (hasOutcomeChangingUnknown) {
      status = "insufficient_evidence";
    } else if (missingYearUnits > 0) {
      status = "matched";
    }
    return {
      missingYearUnits,
      relevantMonths,
      relevantYears,
      source: "timeline",
      status,
    };
  }
  if (
    input.relevanceScope === "total_employment" &&
    input.profileWorkYears !== undefined &&
    Number.isFinite(input.profileWorkYears)
  ) {
    const relevantYears = Math.max(input.profileWorkYears, 0);
    const missingYearUnits = Math.max(Math.ceil(input.requiredYears - relevantYears), 0);
    return {
      missingYearUnits,
      relevantMonths: Math.round(relevantYears * 12),
      relevantYears,
      source: "profile_work_years",
      status: missingYearUnits > 0 ? "matched" : "not_matched",
    };
  }
  return {
    missingYearUnits: 0,
    relevantMonths: null,
    relevantYears: null,
    source: null,
    status: "insufficient_evidence",
  };
}

export interface StructuredResumeTimelineEpisode {
  current: boolean;
  endMonth: string | null;
  gapExplanation?: string | null;
  id: string;
  primaryStatus: "concurrent" | "primary" | "unresolved";
  startMonth: string | null;
}

export interface StructuredResumeTimelineProject {
  current: boolean;
  endMonth: string | null;
  id: string;
  relevant: boolean;
}

interface DeriveTimelineFactsInput {
  employmentEpisodes: StructuredResumeTimelineEpisode[];
  evaluationAsOf: string;
  projects: StructuredResumeTimelineProject[];
}

export interface StructuredResumeTimelineFacts {
  hasUnresolvedRelevantProjectDate: boolean;
  hasUnresolvedPrimaryConcurrency: boolean;
  hasUnresolvedPrimaryTimeline: boolean;
  jobChangesWithinOneYear: number | null;
  jobChangesWithinTwoYears: number | null;
  oldProjectIds: string[];
  shortTenureCount: number | null;
  unexplainedGapMonths: number[];
}

function evaluationMonthIndex(evaluationAsOf: string): number {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(evaluationAsOf);
  if (!match) {
    throw new Error("evaluationAsOf must be a UTC calendar date.");
  }
  const index = monthIndex(`${match[1]}-${match[2]}`);
  if (index === null) {
    throw new Error("evaluationAsOf must be a valid UTC calendar date.");
  }
  return index;
}

function deriveProjectFreshness(
  projects: StructuredResumeTimelineProject[],
  asOfMonth: number,
): Pick<StructuredResumeTimelineFacts, "hasUnresolvedRelevantProjectDate" | "oldProjectIds"> {
  const boundary = asOfMonth - 36;
  const relevantProjects = projects.filter((project) => project.relevant);
  if (relevantProjects.some((project) => project.current)) {
    return { hasUnresolvedRelevantProjectDate: false, oldProjectIds: [] };
  }
  const ended = relevantProjects.flatMap((project) => {
    const end = monthIndex(project.endMonth);
    return end === null ? [] : [{ end, id: project.id }];
  });
  const latestEnd = Math.max(...ended.map((project) => project.end));
  if (Number.isFinite(latestEnd) && latestEnd >= boundary) {
    return { hasUnresolvedRelevantProjectDate: false, oldProjectIds: [] };
  }
  const hasUnresolvedRelevantProjectDate = relevantProjects.length > ended.length;
  return {
    hasUnresolvedRelevantProjectDate,
    oldProjectIds:
      hasUnresolvedRelevantProjectDate || !Number.isFinite(latestEnd)
        ? []
        : ended.filter((project) => project.end === latestEnd).map((project) => project.id),
  };
}

export function deriveTimelineFacts(
  input: DeriveTimelineFactsInput,
): StructuredResumeTimelineFacts {
  const asOfMonth = evaluationMonthIndex(input.evaluationAsOf);
  const hasUnresolvedPrimaryConcurrency = input.employmentEpisodes.some(
    (episode) => episode.primaryStatus === "unresolved",
  );
  const primaryCandidates = input.employmentEpisodes.filter(
    (episode) => episode.primaryStatus === "primary",
  );
  const primaryEpisodes = primaryCandidates
    .map((episode) => ({
      ...episode,
      end: episode.current ? asOfMonth : episode.endMonth && monthIndex(episode.endMonth),
      start: episode.startMonth && monthIndex(episode.startMonth),
    }))
    .filter(
      (
        episode,
      ): episode is typeof episode & {
        end: number;
        start: number;
      } => episode.start !== null && episode.end !== null && episode.end >= episode.start,
    )
    .toSorted((left, right) => left.start - right.start);
  const hasUnresolvedPrimaryTimeline =
    hasUnresolvedPrimaryConcurrency ||
    primaryCandidates.length === 0 ||
    primaryEpisodes.length !== primaryCandidates.length;
  const projectFreshness = deriveProjectFreshness(input.projects, asOfMonth);

  if (hasUnresolvedPrimaryTimeline) {
    return {
      ...projectFreshness,
      hasUnresolvedPrimaryConcurrency,
      hasUnresolvedPrimaryTimeline,
      jobChangesWithinOneYear: null,
      jobChangesWithinTwoYears: null,
      shortTenureCount: null,
      unexplainedGapMonths: [],
    };
  }

  const changeMonths: number[] = [];
  const unexplainedGapMonths: number[] = [];
  for (let index = 1; index < primaryEpisodes.length; index += 1) {
    const previous = primaryEpisodes[index - 1];
    const current = primaryEpisodes[index];
    changeMonths.push(current.start);
    if (current.start > previous.end) {
      const completeGapMonths = Math.max(current.start - previous.end - 1, 0);
      if (completeGapMonths > 0 && !previous.gapExplanation) {
        unexplainedGapMonths.push(completeGapMonths);
      }
    }
  }
  const last = primaryEpisodes.at(-1);
  if (last && !last.current && asOfMonth > last.end && !last.gapExplanation) {
    const completeGapMonths = Math.max(asOfMonth - last.end - 1, 0);
    if (completeGapMonths > 0) {
      unexplainedGapMonths.push(completeGapMonths);
    }
  }
  return {
    ...projectFreshness,
    hasUnresolvedPrimaryConcurrency,
    hasUnresolvedPrimaryTimeline,
    jobChangesWithinOneYear: changeMonths.filter((month) => month >= asOfMonth - 12).length,
    jobChangesWithinTwoYears: changeMonths.filter((month) => month >= asOfMonth - 24).length,
    shortTenureCount: primaryEpisodes.filter((episode) => episode.end - episode.start + 1 < 3)
      .length,
    unexplainedGapMonths,
  };
}
