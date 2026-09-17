import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import type { StudioCandidateRecord } from "@app/shared/studio-candidates";
import type { ResumeLibraryProfileSnapshot } from "@app/shared/studio-resumes";
import { db } from "../../../../../../lib/server/db/index";
import { jobDescription, user } from "@app/db-schema/schema";
import type { ResumeSemanticSourceType } from "@app/db-schema/schema";
import type { PipelineStage } from "@app/db-schema/studio-interviews";

export interface DedupMatchRecord {
  id: string;
  sourceType?: ResumeSemanticSourceType;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  uploaderImage?: string | null;
  uploaderName?: string | null;
  resumeProfileSnapshot?: ResumeLibraryProfileSnapshot | null;
  resumeFileName?: string | null;
  /** Mastered skills for comparison UI (top skills from resume profile). */
  skills?: string[];
  status: "active" | "archived";
  /** 招聘台记录当前招聘状态（describeResumeProgress 文案），人才库记录为 null。 */
  pipelineStatus?: {
    label: string;
    stage: PipelineStage;
    tone: "success" | "warning" | "info" | "outline";
  } | null;
  createdAt: string;
  conflictingSignals?: string[];
  level?: "high" | "low" | "medium";
  score?: number;
  semanticReasons?: string[];
  similarity?: {
    resumeOverview?: number;
    skillRole?: number;
    workProject?: number;
  };
}

/**
 * Load a candidate (studio_interview row) with JD + creator info, without
 * embedding scheduleEntries (those belong to the round-side view).
 * 加载候选人聚合记录（不含 scheduleEntries —— 那是 round 维度的事）。
 */
export async function loadStudioCandidate(
  candidateId: string,
  organizationId: string,
): Promise<StudioCandidateRecord | null> {
  const [row] = await db
    .select({
      candidateEmail: recruitingRecordReadModel.candidateEmail,
      candidateName: recruitingRecordReadModel.candidateName,
      candidatePhone: recruitingRecordReadModel.candidatePhone,
      createdAt: recruitingRecordReadModel.createdAt,
      createdBy: recruitingRecordReadModel.createdBy,
      creatorName: user.name,
      creatorOrganizationName: user.feishuTenantName,
      id: recruitingRecordReadModel.id,
      interviewQuestions: recruitingRecordReadModel.interviewQuestions,
      jobDescriptionId: recruitingRecordReadModel.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: recruitingRecordReadModel.notes,
      outcome: recruitingRecordReadModel.outcome,
      pipelineStage: recruitingRecordReadModel.pipelineStage,
      resumeContentHash: recruitingRecordReadModel.resumeContentHash,
      resumeFileName: recruitingRecordReadModel.resumeFileName,
      resumeProfile: recruitingRecordReadModel.resumeProfile,
      resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
      targetRole: recruitingRecordReadModel.targetRole,
      updatedAt: recruitingRecordReadModel.updatedAt,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(user, eq(recruitingRecordReadModel.createdBy, user.id))
    .leftJoin(
      jobDescription,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.id, candidateId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    candidateEmail: row.candidateEmail,
    candidateName: row.candidateName,
    candidatePhone: row.candidatePhone,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    createdBy: row.createdBy,
    creatorName: row.creatorName,
    creatorOrganizationName: row.creatorOrganizationName,
    id: row.id,
    interviewQuestions: row.interviewQuestions ?? [],
    jobDescriptionId: row.jobDescriptionId,
    jobDescriptionName: row.jobDescriptionName,
    notes: row.notes,
    outcome: row.outcome,
    pipelineStage: row.pipelineStage,
    resumeContentHash: row.resumeContentHash,
    resumeFileName: row.resumeFileName,
    resumeProfile: row.resumeProfile,
    resumeStorageKey: row.resumeStorageKey,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
