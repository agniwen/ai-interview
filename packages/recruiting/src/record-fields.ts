import type {
  candidate,
  candidateResume,
  recruitingFulfillment,
  recruitingInterviewPreparation,
  recruitingRecord,
  recruitingResumeEvaluation,
} from "@app/db-schema/schema";
import type { JsonObject } from "@app/db-schema/json";
import type {
  ClosedMeta,
  ResumeEvaluationStatus,
  ResumeReviewStatus,
  ResumeScreeningStatus,
} from "@app/db-schema/studio-interviews";
import type { ResumeReview } from "@app/db-schema/resume-review";
import type {
  QualitativeResumeEvaluation,
  QualitativeRecommendationLevel,
  ResumeEvaluationContractMode,
} from "@app/db-schema/qualitative-resume-evaluation";
import type {
  StructuredResumeEvaluationV1,
  StructuredResumeGateStatus,
  StructuredResumeGrade,
} from "@app/db-schema/structured-resume-evaluation";

type Person = typeof candidate.$inferSelect;
type Resume = typeof candidateResume.$inferSelect;
type RecordRow = typeof recruitingRecord.$inferSelect;
type Evaluation = typeof recruitingResumeEvaluation.$inferSelect;

/**
 * 招聘读写适配层的字段契约。沿用既有接口名称，但类型来自新实体和领域 DTO，
 * 不再依赖待退役表。阶段由读模型和写入命令分别定义，避免混用历史阶段与当前节点。
 */
export type RecruitingRecordFields = Pick<
  RecordRow,
  | "id"
  | "organizationId"
  | "createdAt"
  | "createdBy"
  | "updatedAt"
  | "closedAt"
  | "hrResumeAssessment"
  | "hrResumeAssessmentUpdatedAt"
  | "hrResumeAssessmentUpdatedBy"
  | "jobDescriptionId"
  | "notes"
  | "outcome"
  | "targetRole"
> & {
  candidateEmail: Person["email"];
  candidateName: Person["name"];
  candidatePhone: Person["phone"];
  candidateExpectationsMeta: typeof recruitingFulfillment.$inferSelect.candidateExpectations;
  closedMeta: ClosedMeta | null;
  closedReason: string | null;
  interviewQuestions: typeof recruitingInterviewPreparation.$inferSelect.questions;
  qualitativeAttemptJobDescriptionVersionId: Evaluation["jobDescriptionVersionId"];
  qualitativeJobDescriptionVersionId: Evaluation["jobDescriptionVersionId"];
  qualitativeRecommendationLevel: QualitativeRecommendationLevel | null;
  qualitativeResumeEvaluation: QualitativeResumeEvaluation | null;
  resumeContentHash: Resume["contentHash"];
  resumeEvaluationArtifactMode: ResumeEvaluationContractMode | null;
  resumeEvaluationAttemptMode: ResumeEvaluationContractMode | null;
  resumeEvaluationStatus: ResumeEvaluationStatus | null;
  resumeFileName: Resume["fileName"];
  resumeParseError: Resume["parseError"];
  resumeParseStatus: Resume["parseStatus"];
  resumeParsedAt: Resume["parsedAt"];
  resumeProfile: Resume["profile"];
  resumeReview: ResumeReview | null;
  resumeReviewError: Evaluation["errorMessage"];
  resumeReviewGeneratedAt: Evaluation["completedAt"];
  resumeReviewQueuedAt: Evaluation["startedAt"];
  resumeReviewRunId: Evaluation["runId"];
  resumeReviewStatus: ResumeReviewStatus;
  resumeScreeningError: Evaluation["errorMessage"];
  resumeScreeningEvaluatedAt: Evaluation["completedAt"];
  resumeScreeningResult: JsonObject | null;
  resumeScreeningStatus: ResumeScreeningStatus;
  resumeSourceImportedAt: RecordRow["sourceImportedAt"];
  resumeSourceImportedBy: RecordRow["sourceImportedBy"];
  resumeSourcePoolItemId: RecordRow["sourcePoolItemId"];
  resumeSourceType: RecordRow["sourceType"];
  resumeStorageKey: Resume["storageKey"];
  resumeText: Resume["text"];
  searchCjkBigrams: Resume["searchCjkBigrams"];
  searchText: Resume["searchText"];
  skillsNormalized: Resume["skillsNormalized"];
  structuredCompositeScore: Evaluation["numericScore"];
  structuredGateSortRank: number | null;
  structuredGateStatus: StructuredResumeGateStatus | null;
  structuredResumeEvaluation: StructuredResumeEvaluationV1 | null;
  structuredScoreGrade: StructuredResumeGrade | null;
  /** 仅保留旧接口可空字段；当前轮次和 Offer 数据由各自的新表提供。 */
  humanInterviewScheduledAt: Date | null;
  humanInterviewerId: string | null;
  offerAcceptedAt: Date | null;
  offerSentAt: Date | null;
  writtenTestScheduledAt: Date | null;
  writtenTestScore: string | null;
};
