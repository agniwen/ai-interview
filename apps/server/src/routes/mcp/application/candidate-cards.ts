import { candidateOutcomeMeta, pipelineStageMeta } from "@app/db-schema/studio-interviews";
import type { McpCandidateCard, McpCandidateDetailCard } from "@app/shared/recruiting-mcp-cards";
import { recruitingLedgerRecommendationOptions } from "@app/shared/studio-recruiting-ledger";
import type { ResumeLibraryDetail, ResumeLibraryListRecord } from "@app/shared/studio-resumes";

const MAX_CARD_SKILLS = 8;
const MAX_EXPERIENCE_LINES = 3;
const MAX_EDUCATION_LINES = 2;

const recommendationLabels: Record<string, string> = Object.fromEntries(
  recruitingLedgerRecommendationOptions.map((option) => [option.value, option.label]),
);

/** 生成工作台中候选人详情页的绝对地址；MCP Apps 视图通过宿主的 open-link 打开。 */
export type CandidateUrlBuilder = (candidateId: string) => string;

/** 卡片投影实际读取的列表字段。 */
export type CandidateCardSource = Pick<
  ResumeLibraryListRecord,
  | "candidateName"
  | "id"
  | "jobDescriptionName"
  | "outcome"
  | "pipelineStage"
  | "qualitativeRecommendationLevel"
  | "qualitativeResumeSummary"
  | "resumeProfileSnapshot"
  | "resumeSkills"
  | "resumeSummary"
  | "targetRole"
  | "updatedAt"
>;

/** 详情卡片额外读取的字段。 */
export type CandidateDetailCardSource = CandidateCardSource &
  Pick<
    ResumeLibraryDetail,
    "candidateEmail" | "candidatePhone" | "hrResumeAssessment" | "resumeProfile"
  >;

function cleanText(value: string | null | undefined) {
  return value?.trim() || null;
}

export function toMcpCandidateCard(
  row: CandidateCardSource,
  candidateUrl?: CandidateUrlBuilder,
): McpCandidateCard {
  const level = row.qualitativeRecommendationLevel;
  return {
    education: row.resumeProfileSnapshot.education.slice(0, MAX_EDUCATION_LINES),
    experience: row.resumeProfileSnapshot.work.slice(0, MAX_EXPERIENCE_LINES),
    id: row.id,
    jobName: cleanText(row.jobDescriptionName),
    name: row.candidateName,
    outcome:
      row.outcome === "in_pipeline"
        ? null
        : { label: candidateOutcomeMeta[row.outcome].label, value: row.outcome },
    recommendation:
      level && recommendationLabels[level]
        ? { label: recommendationLabels[level], value: level }
        : null,
    skills: row.resumeSkills.slice(0, MAX_CARD_SKILLS),
    stage: { label: pipelineStageMeta[row.pipelineStage].label, value: row.pipelineStage },
    summary: cleanText(row.qualitativeResumeSummary) ?? cleanText(row.resumeSummary),
    targetRole: cleanText(row.targetRole),
    updatedAt: row.updatedAt,
    url: candidateUrl?.(row.id) ?? null,
  };
}

export function toMcpCandidateDetailCard(
  row: CandidateDetailCardSource,
  candidateUrl?: CandidateUrlBuilder,
): McpCandidateDetailCard {
  return {
    candidate: {
      ...toMcpCandidateCard(row, candidateUrl),
      email: cleanText(row.candidateEmail),
      phone: cleanText(row.candidatePhone),
      recruiterAssessment: cleanText(row.hrResumeAssessment),
      workYears: row.resumeProfile?.workYears ?? null,
    },
    kind: "candidate_detail",
  };
}
