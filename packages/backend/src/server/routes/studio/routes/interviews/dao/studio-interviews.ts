import { and, desc, eq, or, sql } from "drizzle-orm";
import type { StudioCandidateRecord } from "@arc/shared/studio-candidates";
import { db } from "@arc/backend/lib/server/db";
import { jobDescription, studioInterview, user } from "@arc/db-schema/schema";
import type { StudioInterviewStatus } from "@arc/db-schema/studio-interviews";

// ---------------------------------------------------------------------------
// 身份维度查重：按姓名/邮箱/电话 OR 命中。
// Identity-based dedup: matches by name OR email OR phone (any one suffices).
// 与文件哈希查重互补——前者抓"同一份 PDF"，这里抓"同一个人"。
// Complements the file-hash dedup (same PDF) by surfacing same-candidate cases.
// ---------------------------------------------------------------------------

export type DedupMatchedField = "name" | "email" | "phone";

export interface DedupMatchRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionName: string | null;
  status: StudioInterviewStatus;
  createdAt: string;
  matchedFields: DedupMatchedField[];
}

const DEDUP_LIMIT = 20;

function normalizeForDedup(value: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export async function queryInterviewDedup(
  organizationId: string,
  input: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  },
): Promise<DedupMatchRecord[]> {
  const name = input.name?.trim();
  const email = input.email?.trim();
  const phone = input.phone?.trim();
  // 简历 LLM 返回不可识别字段时填占位文本，不能用作查重输入。
  // The LLM returns the placeholder when a field is unrecognized; never match on it.
  const PLACEHOLDER = "未发现信息";
  const usableName = name && name !== PLACEHOLDER ? name : null;
  const usableEmail = email && email !== PLACEHOLDER ? email : null;
  const usablePhone = phone && phone !== PLACEHOLDER ? phone : null;

  if (!(usableName || usableEmail || usablePhone)) {
    return [];
  }

  const conditions = [
    usableName
      ? sql`lower(trim(${studioInterview.candidateName})) = lower(trim(${usableName}))`
      : null,
    usableEmail
      ? sql`lower(trim(${studioInterview.candidateEmail})) = lower(trim(${usableEmail}))`
      : null,
    usablePhone ? sql`trim(${studioInterview.candidatePhone}) = trim(${usablePhone})` : null,
  ].filter((value): value is NonNullable<typeof value> => value !== null);

  const rows = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      createdAt: studioInterview.createdAt,
      id: studioInterview.id,
      jobDescriptionName: jobDescription.name,
      status: studioInterview.status,
      targetRole: studioInterview.targetRole,
    })
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, studioInterview.organizationId),
      ),
    )
    .where(and(eq(studioInterview.organizationId, organizationId), or(...conditions)))
    .orderBy(desc(studioInterview.createdAt))
    .limit(DEDUP_LIMIT);

  const nameKey = usableName ? normalizeForDedup(usableName) : "";
  const emailKey = usableEmail ? normalizeForDedup(usableEmail) : "";
  const phoneKey = usablePhone ? usablePhone.trim() : "";

  return rows.map((row) => {
    const matchedFields: DedupMatchedField[] = [];
    if (nameKey && normalizeForDedup(row.candidateName) === nameKey) {
      matchedFields.push("name");
    }
    if (emailKey && normalizeForDedup(row.candidateEmail) === emailKey) {
      matchedFields.push("email");
    }
    if (phoneKey && (row.candidatePhone?.trim() ?? "") === phoneKey) {
      matchedFields.push("phone");
    }
    return {
      candidateEmail: row.candidateEmail,
      candidateName: row.candidateName,
      candidatePhone: row.candidatePhone,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
      id: row.id,
      jobDescriptionName: row.jobDescriptionName,
      matchedFields,
      status: row.status,
      targetRole: row.targetRole,
    };
  });
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
