import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import type {
  CandidateFormSubmissionRecord,
  CandidateFormSubmissionWithSnapshot,
  CandidateFormTemplateSnapshot,
} from "@app/db-schema/candidate-forms";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { recruitingFormSubmission, candidateFormTemplateVersion } from "@app/db-schema/schema";
import { serializeDate } from "../../../../../../lib/server/db/serialize";

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
    .select({ templateId: recruitingFormSubmission.templateId })
    .from(recruitingFormSubmission)
    .where(
      and(
        eq(recruitingFormSubmission.recruitingRecordId, interviewRecordId),
        inArray(recruitingFormSubmission.templateId, templateIds),
      ),
    );
  return new Set(rows.map((row) => row.templateId));
}

export async function loadSubmissionsByInterview(
  interviewRecordId: string,
): Promise<CandidateFormSubmissionWithSnapshot[]> {
  const rows = await db
    .select({
      answers: recruitingFormSubmission.answers,
      id: recruitingFormSubmission.id,
      interviewRecordId: recruitingFormSubmission.recruitingRecordId,
      snapshot: candidateFormTemplateVersion.snapshot,
      submittedAt: recruitingFormSubmission.submittedAt,
      templateId: recruitingFormSubmission.templateId,
      version: candidateFormTemplateVersion.version,
      versionId: recruitingFormSubmission.versionId,
    })
    .from(recruitingFormSubmission)
    .innerJoin(
      candidateFormTemplateVersion,
      eq(recruitingFormSubmission.versionId, candidateFormTemplateVersion.id),
    )
    .where(eq(recruitingFormSubmission.recruitingRecordId, interviewRecordId))
    .orderBy(asc(recruitingFormSubmission.submittedAt));

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
        answers: recruitingFormSubmission.answers,
        candidateName: recruitingRecordReadModel.candidateName,
        id: recruitingFormSubmission.id,
        interviewRecordId: recruitingFormSubmission.recruitingRecordId,
        snapshot: candidateFormTemplateVersion.snapshot,
        submittedAt: recruitingFormSubmission.submittedAt,
        templateId: recruitingFormSubmission.templateId,
        version: candidateFormTemplateVersion.version,
        versionId: recruitingFormSubmission.versionId,
      })
      .from(recruitingFormSubmission)
      .innerJoin(
        candidateFormTemplateVersion,
        eq(recruitingFormSubmission.versionId, candidateFormTemplateVersion.id),
      )
      .leftJoin(
        recruitingRecordReadModel,
        eq(recruitingFormSubmission.recruitingRecordId, recruitingRecordReadModel.id),
      )
      .where(eq(recruitingFormSubmission.templateId, templateId))
      .orderBy(desc(recruitingFormSubmission.submittedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(recruitingFormSubmission)
      .where(eq(recruitingFormSubmission.templateId, templateId)),
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
