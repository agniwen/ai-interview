import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { studioInterview } from "@arc/db-schema/schema";
import type { StudioInterviewResumeSourceType } from "@arc/db-schema/schema";
import type { InterviewQuestion, ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeReview } from "@arc/db-schema/resume-review";
import type {
  ResumeParseStatus,
  ResumeReviewStatus,
  ResumeScreeningStatus,
} from "@arc/db-schema/studio-interviews";
import type { ResumeScreeningResult } from "@arc/shared/resume-screening";
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
  notes: string | null;
  organizationId: string;
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
): Promise<string> {
  const now = new Date();
  const recordId = crypto.randomUUID();
  const candidateEmail = input.candidateEmail?.trim() || input.resumeProfile?.email || null;
  const candidatePhone = input.candidatePhone?.trim() || input.resumeProfile?.phone || null;
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
      resumeContentHash: input.contentHash,
      resumeFileName: input.resumeFileName,
      resumeParseError: null,
      resumeParseStatus:
        input.resumeParseStatus ??
        (input.storageKey && !input.resumeProfile ? "unparsed" : "ready"),
      resumeParsedAt: input.resumeProfile ? now : null,
      resumeProfile: input.resumeProfile,
      resumeReview: input.resumeReview ?? null,
      resumeReviewError: input.resumeReviewError ?? null,
      resumeReviewGeneratedAt: input.resumeReview ? now : null,
      resumeReviewQueuedAt: input.resumeReviewStatus === "queued" ? now : null,
      resumeReviewStatus: input.resumeReview ? "ready" : (input.resumeReviewStatus ?? "idle"),
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
    await syncResumeSkills(executor, {
      interviewId: recordId,
      organizationId: input.organizationId,
      skills: input.resumeProfile?.skills,
    });
  };
  await (tx ? write(tx) : db.transaction(write));
  return recordId;
}
