import { db } from "../../../../../../lib/server/db/index";
import { studioInterview } from "@app/db-schema/schema";
import type { StudioInterviewResumeSourceType } from "@app/db-schema/schema";
import type { InterviewQuestion, ResumeProfile } from "@app/db-schema/interview/types";
import type { ResumeReview } from "@app/db-schema/resume-review";
import type {
  ResumeParseStatus,
  PipelineStage,
  ResumeReviewStatus,
  ResumeScreeningStatus,
} from "@app/db-schema/studio-interviews";
import type { ResumeScreeningResult } from "@app/shared/resume-screening";
import type { ReusableResumePoolEvaluation } from "../../resume-pool/utils/evaluation-reuse";
import { syncResumeSkills } from "../dao/skills";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CreateResumeRecordFromStorageInput {
  candidateEmail: string | null;
  candidateName: string | null;
  candidatePhone: string | null;
  contentHash: string | null;
  hrResumeAssessment?: string | null;
  interviewQuestions?: InterviewQuestion[];
  jobDescriptionId: string | null;
  qualitativeEvaluation?: ReusableResumePoolEvaluation | null;
  notes: string | null;
  organizationId: string;
  pipelineStage?: PipelineStage;
  resumeFileName: string | null;
  resumeProfile: ResumeProfile | null;
  resumeParseStatus?: ResumeParseStatus;
  resumeReview?: ResumeReview | null;
  resumeReviewError?: string | null;
  resumeReviewStatus?: ResumeReviewStatus;
  resumeScreeningResult?: ResumeScreeningResult | null;
  resumeScreeningError?: string | null;
  resumeScreeningStatus?: ResumeScreeningStatus;
  resumeText?: string | null;
  storageKey: string | null;
  targetRole: string | null;
  userId: string | null;
  source?: {
    importedAt: Date;
    importedBy: string | null;
    poolItemId: string | null;
    type: StudioInterviewResumeSourceType;
  };
}

export interface CreateResumeRecordFromStorageDependencies {
  syncSkills: typeof syncResumeSkills;
}

const defaultCreateResumeRecordFromStorageDependencies: CreateResumeRecordFromStorageDependencies =
  {
    syncSkills: syncResumeSkills,
  };

// 仅"从已经上传好的简历文件 + 已经解析过的 profile"装配一行 studio_interview。
// 不做：dedup / JD 匹配 / 上传 / 解析——由调用方负责。
//
// Assemble a single studio_interview row from an already-uploaded resume +
// already-parsed profile. Does NOT do dedup / JD-matching / upload / parsing —
// the caller is responsible for those.
// oxlint-disable-next-line complexity -- central data mapper for the resume-library row.
export async function createResumeRecordFromStorage(
  input: CreateResumeRecordFromStorageInput,
  tx?: Tx,
  dependencies: CreateResumeRecordFromStorageDependencies = defaultCreateResumeRecordFromStorageDependencies,
): Promise<string> {
  const now = new Date();
  const recordId = crypto.randomUUID();
  const candidateEmail = input.candidateEmail?.trim() || input.resumeProfile?.email || null;
  const candidatePhone = input.candidatePhone?.trim() || input.resumeProfile?.phone || null;
  let evaluationArtifactMode: "legacy" | "qualitative" | null = null;
  if (input.qualitativeEvaluation) {
    evaluationArtifactMode = "qualitative";
  } else if (input.resumeReview) {
    evaluationArtifactMode = "legacy";
  }
  // oxlint-disable-next-line complexity -- central data mapper for the resume-library row.
  const write = async (executor: Tx) => {
    await executor.insert(studioInterview).values({
      candidateEmail,
      candidateName: input.candidateName?.trim() || input.resumeProfile?.name || "未命名候选人",
      candidatePhone,
      createdAt: now,
      createdBy: input.userId,
      hrResumeAssessment: input.hrResumeAssessment?.trim() || null,
      hrResumeAssessmentUpdatedAt: input.hrResumeAssessment?.trim() ? now : null,
      hrResumeAssessmentUpdatedBy: input.hrResumeAssessment?.trim() ? input.userId : null,
      id: recordId,
      interviewQuestions: input.interviewQuestions ?? [],
      jobDescriptionId: input.jobDescriptionId,
      notes: input.notes,
      organizationId: input.organizationId,
      pipelineStage: input.pipelineStage ?? "screening",
      qualitativeJobDescriptionVersionId:
        input.qualitativeEvaluation?.jobDescriptionVersionId ?? null,
      qualitativeRecommendationLevel:
        input.qualitativeEvaluation?.evaluation.recommendationLevel ?? null,
      qualitativeResumeEvaluation: input.qualitativeEvaluation?.evaluation ?? null,
      resumeContentHash: input.contentHash,
      resumeEvaluationArtifactMode: evaluationArtifactMode,
      resumeEvaluationAttemptMode: evaluationArtifactMode,
      resumeFileName: input.resumeFileName,
      resumeParseError: null,
      resumeParseStatus:
        input.resumeParseStatus ??
        (input.storageKey && !input.resumeProfile ? "unparsed" : "ready"),
      resumeParsedAt: input.resumeProfile ? now : null,
      resumeProfile: input.resumeProfile,
      resumeReview: input.resumeReview ?? null,
      resumeReviewError: input.resumeReviewError ?? null,
      resumeReviewGeneratedAt:
        input.qualitativeEvaluation?.generatedAt ?? (input.resumeReview ? now : null),
      resumeReviewQueuedAt: input.resumeReviewStatus === "queued" ? now : null,
      resumeReviewStatus:
        input.qualitativeEvaluation || input.resumeReview
          ? "ready"
          : (input.resumeReviewStatus ?? "idle"),
      resumeScreeningError: input.resumeScreeningError ?? null,
      resumeScreeningEvaluatedAt: input.resumeScreeningResult ? now : null,
      resumeScreeningResult: input.resumeScreeningResult ?? null,
      resumeScreeningStatus: input.resumeScreeningResult
        ? "ready"
        : (input.resumeScreeningStatus ?? "idle"),
      resumeSourceImportedAt: input.source?.importedAt ?? null,
      resumeSourceImportedBy: input.source?.importedBy ?? null,
      resumeSourcePoolItemId: input.source?.poolItemId ?? null,
      resumeSourceType: input.source?.type ?? "direct_upload",
      resumeStorageKey: input.storageKey,
      resumeText: input.resumeText ?? null,
      targetRole: input.targetRole?.trim() || input.resumeProfile?.targetRoles?.[0] || null,
      updatedAt: now,
    });
    await dependencies.syncSkills(executor, {
      interviewId: recordId,
      organizationId: input.organizationId,
      skills: input.resumeProfile?.skills,
    });
  };
  await (tx ? write(tx) : db.transaction(write));
  return recordId;
}
