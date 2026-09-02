import {
  QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
  qualitativeResumeEvaluationV2Schema,
} from "@app/db-schema/qualitative-resume-evaluation";

export interface ReusableResumePoolEvaluation {
  contractVersion: typeof QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION;
  evaluation: ReturnType<typeof qualitativeResumeEvaluationV2Schema.parse>;
  generatedAt: Date;
  inputHash: string;
  jobDescriptionVersionId: string;
}

export function selectReusableResumePoolEvaluation(
  source: {
    jobDescriptionId: string | null;
    qualitativeJobDescriptionVersionId: string | null;
    qualitativeRecommendationLevel: string | null;
    qualitativeResumeEvaluation: unknown;
    qualitativeResumeSummary: string | null;
    resumeEvaluationContractVersion: string | null;
    resumeEvaluationGeneratedAt: Date | null;
    resumeEvaluationInputHash: string | null;
  },
  targetJobDescriptionId: string | null,
): ReusableResumePoolEvaluation | null {
  if (
    !targetJobDescriptionId ||
    source.jobDescriptionId !== targetJobDescriptionId ||
    source.resumeEvaluationContractVersion !== QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION ||
    !source.qualitativeJobDescriptionVersionId ||
    !source.resumeEvaluationGeneratedAt ||
    !source.resumeEvaluationInputHash
  ) {
    return null;
  }
  const parsed = qualitativeResumeEvaluationV2Schema.safeParse(source.qualitativeResumeEvaluation);
  if (
    !parsed.success ||
    parsed.data.recommendationLevel !== source.qualitativeRecommendationLevel ||
    parsed.data.conciseOverall !== source.qualitativeResumeSummary
  ) {
    return null;
  }
  return {
    contractVersion: QUALITATIVE_RESUME_EVALUATION_CONTRACT_VERSION,
    evaluation: parsed.data,
    generatedAt: source.resumeEvaluationGeneratedAt,
    inputHash: source.resumeEvaluationInputHash,
    jobDescriptionVersionId: source.qualitativeJobDescriptionVersionId,
  };
}
