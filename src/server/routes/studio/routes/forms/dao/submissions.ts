import type {
  CandidateFormSubmissionRecord,
  CandidateFormSubmissionWithSnapshot,
  CandidateFormTemplateSnapshot,
} from "@/lib/shared/candidate-forms";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  candidateFormSubmission,
  candidateFormTemplateVersion,
  studioInterview,
} from "@/lib/shared/db/schema";
import { serializeDate } from "./queries";

// 默认 / 上限的页大小。Drawer 一次加载 20 条已经够；100 是 hard cap，给 API
// 调用方留余地但不允许"一次性扫表"。
// Default / max page size. The drawer reads 20 at a time; 100 is a hard cap
// that gives API callers headroom without enabling table scans.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function loadSubmittedTemplateIds(
  interviewRecordId: string,
  templateIds: string[],
): Promise<Set<string>> {
  if (templateIds.length === 0) {
    return new Set();
  }
  const rows = await db
    .select({ templateId: candidateFormSubmission.templateId })
    .from(candidateFormSubmission)
    .where(
      and(
        eq(candidateFormSubmission.interviewRecordId, interviewRecordId),
        inArray(candidateFormSubmission.templateId, templateIds),
      ),
    );
  return new Set(rows.map((row) => row.templateId));
}

export async function loadSubmissionsByInterview(
  interviewRecordId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const rows = await db
    .select({
      answers: candidateFormSubmission.answers,
      id: candidateFormSubmission.id,
      interviewRecordId: candidateFormSubmission.interviewRecordId,
      snapshot: candidateFormTemplateVersion.snapshot,
      submittedAt: candidateFormSubmission.submittedAt,
      templateId: candidateFormSubmission.templateId,
      version: candidateFormTemplateVersion.version,
      versionId: candidateFormSubmission.versionId,
    })
    .from(candidateFormSubmission)
    .innerJoin(
      candidateFormTemplateVersion,
      eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
    )
    .where(eq(candidateFormSubmission.interviewRecordId, interviewRecordId))
    .orderBy(asc(candidateFormSubmission.submittedAt));

  return rows.map((row) => ({
    answers: row.answers,
    id: row.id,
    interviewRecordId: row.interviewRecordId,
    snapshot: row.snapshot,
    submittedAt: serializeDate(row.submittedAt),
    templateId: row.templateId,
    version: row.version,
    versionId: row.versionId,
  }));
}

export interface SubmissionWithCandidate extends CandidateFormSubmissionRecord {
  candidateName: string | null;
  snapshot: CandidateFormTemplateSnapshot;
}

export interface LoadSubmissionsResult {
  submissions: SubmissionWithCandidate[];
  total: number;
}

/**
 * 按模板拉取填写记录，后填写的在前。支持 limit + offset 分页 —— drawer 走"加载
 * 更多"模式，每次 20 条，offset 累加。total 与本页数据并行查，避免串行 RTT。
 *
 * Paginated fetch (latest first). The drawer uses an offset-based load-more
 * cursor (20 per page). `total` and the page data are issued in parallel so
 * we don't pay a sequential RTT.
 */
export async function loadSubmissionsByTemplate(
  templateId: string,
  pagination?: { limit?: number; offset?: number },
): Promise<LoadSubmissionsResult> {
  const rawLimit = pagination?.limit ?? DEFAULT_LIMIT;
  const limit = Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const offset = Math.max(pagination?.offset ?? 0, 0);

  const [rows, [countRow]] = await Promise.all([
    db
      .select({
        answers: candidateFormSubmission.answers,
        candidateName: studioInterview.candidateName,
        id: candidateFormSubmission.id,
        interviewRecordId: candidateFormSubmission.interviewRecordId,
        snapshot: candidateFormTemplateVersion.snapshot,
        submittedAt: candidateFormSubmission.submittedAt,
        templateId: candidateFormSubmission.templateId,
        version: candidateFormTemplateVersion.version,
        versionId: candidateFormSubmission.versionId,
      })
      .from(candidateFormSubmission)
      .innerJoin(
        candidateFormTemplateVersion,
        eq(candidateFormSubmission.versionId, candidateFormTemplateVersion.id),
      )
      .leftJoin(studioInterview, eq(candidateFormSubmission.interviewRecordId, studioInterview.id))
      .where(eq(candidateFormSubmission.templateId, templateId))
      .orderBy(desc(candidateFormSubmission.submittedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(candidateFormSubmission)
      .where(eq(candidateFormSubmission.templateId, templateId)),
  ]);

  return {
    submissions: rows.map((row) => ({
      answers: row.answers,
      candidateName: row.candidateName,
      id: row.id,
      interviewRecordId: row.interviewRecordId,
      snapshot: row.snapshot,
      submittedAt: serializeDate(row.submittedAt),
      templateId: row.templateId,
      version: row.version,
      versionId: row.versionId,
    })),
    total: countRow?.count ?? 0,
  };
}
