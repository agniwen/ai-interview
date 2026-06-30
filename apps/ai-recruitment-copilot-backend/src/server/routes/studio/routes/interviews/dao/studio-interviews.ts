import { and, eq } from "drizzle-orm";
import type { StudioCandidateRecord } from "@arc/shared/studio-candidates";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { jobDescription, studioInterview, user } from "@arc/db-schema/schema";
import type { ResumeSemanticSourceType } from "@arc/db-schema/schema";
import type { StudioInterviewStatus } from "@arc/db-schema/studio-interviews";

export interface DedupMatchRecord {
  id: string;
  sourceType?: ResumeSemanticSourceType;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  status: StudioInterviewStatus | "active" | "archived";
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
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      createdBy: studioInterview.createdBy,
      creatorName: user.name,
      creatorOrganizationName: user.feishuTenantName,
      id: studioInterview.id,
      interviewQuestions: studioInterview.interviewQuestions,
      jobDescriptionId: studioInterview.jobDescriptionId,
      jobDescriptionName: jobDescription.name,
      notes: studioInterview.notes,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
      resumeContentHash: studioInterview.resumeContentHash,
      resumeFileName: studioInterview.resumeFileName,
      resumeProfile: studioInterview.resumeProfile,
      resumeStorageKey: studioInterview.resumeStorageKey,
      status: studioInterview.status,
      targetRole: studioInterview.targetRole,
      updatedAt: studioInterview.updatedAt,
    })
    .from(studioInterview)
    .leftJoin(user, eq(studioInterview.createdBy, user.id))
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .where(
      and(eq(studioInterview.id, candidateId), eq(studioInterview.organizationId, organizationId)),
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
    status: row.status,
    targetRole: row.targetRole,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}
