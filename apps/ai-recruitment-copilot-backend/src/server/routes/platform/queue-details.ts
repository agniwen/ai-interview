import type {
  ResumeParseQueueJobRecord,
  ResumeParseQueueJobsResult,
} from "@arc/resume-parse-queue/resume-parse";
import { and, eq, inArray } from "drizzle-orm";
import {
  organization,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
  user,
} from "@arc/db-schema/schema";

export interface PlatformQueueOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface PlatformQueueTriggeredBy {
  email: string | null;
  id: string;
  image: string | null;
  name: string | null;
}

export interface ResumeQueueDetail {
  attemptCount: number;
  batch: {
    failedCount: number;
    processedCount: number;
    status: string;
    succeededCount: number;
    target: string;
    totalCount: number;
  };
  batchId: string;
  candidateEmail: string | null;
  candidateName: string | null;
  errorMessage: string | null;
  fileSize: number;
  finishedAt: string | null;
  itemId: string;
  itemStatus: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  originalFileName: string;
  poolItemId: string | null;
  poolScope: string | null;
  poolStatus: string | null;
  queuedAt: string | null;
  resumeParseError: string | null;
  resumeParseStatus: string | null;
  resumeRecordId: string | null;
  startedAt: string | null;
  targetRole: string | null;
  userEmail: string | null;
  userId: string;
  userImage: string | null;
  userName: string | null;
}

export type PlatformQueueJobRecord = ResumeParseQueueJobRecord & {
  organization: PlatformQueueOrganization | null;
  resumeDetail: ResumeQueueDetail | null;
  triggeredBy: PlatformQueueTriggeredBy | null;
};

export type PlatformQueueJobsResult = Omit<ResumeParseQueueJobsResult, "records"> & {
  records: PlatformQueueJobRecord[];
};

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function getResumeParseItemId(data: unknown): string | null {
  if (!data || typeof data !== "object") {
    return null;
  }
  const { itemId } = data as { itemId?: unknown };
  return typeof itemId === "string" && itemId.length > 0 ? itemId : null;
}

export function mergeResumeParseQueueJobsWithResumeDetails(
  jobs: ResumeParseQueueJobRecord[],
  details: ResumeQueueDetail[],
): PlatformQueueJobRecord[] {
  const detailsByItemId = new Map(details.map((detail) => [detail.itemId, detail]));

  return jobs.map((job) => {
    const itemId = getResumeParseItemId(job.data);
    const detail = itemId ? (detailsByItemId.get(itemId) ?? null) : null;
    return {
      ...job,
      organization: detail
        ? {
            id: detail.organizationId,
            name: detail.organizationName,
            slug: detail.organizationSlug,
          }
        : null,
      resumeDetail: detail,
      triggeredBy: detail
        ? {
            email: detail.userEmail,
            id: detail.userId,
            image: detail.userImage,
            name: detail.userName,
          }
        : null,
    };
  });
}

export async function loadResumeQueueDetailsByItemIds(
  itemIds: string[],
): Promise<ResumeQueueDetail[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const { db } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db");
  const rows = await db
    .select({
      attemptCount: resumeUploadBatchItem.attemptCount,
      batchFailedCount: resumeUploadBatch.failedCount,
      batchId: resumeUploadBatchItem.batchId,
      batchProcessedCount: resumeUploadBatch.processedCount,
      batchStatus: resumeUploadBatch.status,
      batchSucceededCount: resumeUploadBatch.succeededCount,
      batchTarget: resumeUploadBatch.target,
      batchTotalCount: resumeUploadBatch.totalCount,
      errorMessage: resumeUploadBatchItem.errorMessage,
      fileSize: resumeUploadBatchItem.fileSize,
      finishedAt: resumeUploadBatchItem.finishedAt,
      itemId: resumeUploadBatchItem.id,
      itemStatus: resumeUploadBatchItem.status,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      originalFileName: resumeUploadBatchItem.originalFileName,
      poolCandidateEmail: resumePoolItem.candidateEmail,
      poolCandidateName: resumePoolItem.candidateName,
      poolItemId: resumeUploadBatchItem.poolItemId,
      poolResumeParseError: resumePoolItem.resumeParseError,
      poolResumeParseStatus: resumePoolItem.resumeParseStatus,
      poolScope: resumePoolItem.scope,
      poolStatus: resumePoolItem.status,
      poolTargetRole: resumePoolItem.targetRole,
      queuedAt: resumeUploadBatchItem.queuedAt,
      resumeRecordId: resumeUploadBatchItem.resumeRecordId,
      startedAt: resumeUploadBatchItem.startedAt,
      studioCandidateEmail: studioInterview.candidateEmail,
      studioCandidateName: studioInterview.candidateName,
      studioResumeParseError: studioInterview.resumeParseError,
      studioResumeParseStatus: studioInterview.resumeParseStatus,
      studioTargetRole: studioInterview.targetRole,
      userEmail: user.email,
      userId: user.id,
      userImage: user.image,
      userName: user.name,
    })
    .from(resumeUploadBatchItem)
    .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
    .innerJoin(organization, eq(organization.id, resumeUploadBatch.organizationId))
    .innerJoin(user, eq(user.id, resumeUploadBatch.createdBy))
    .leftJoin(
      studioInterview,
      and(
        eq(studioInterview.id, resumeUploadBatchItem.resumeRecordId),
        eq(studioInterview.organizationId, resumeUploadBatch.organizationId),
      ),
    )
    .leftJoin(
      resumePoolItem,
      and(
        eq(resumePoolItem.id, resumeUploadBatchItem.poolItemId),
        eq(resumePoolItem.organizationId, resumeUploadBatch.organizationId),
      ),
    )
    .where(inArray(resumeUploadBatchItem.id, itemIds));

  return rows.map((row) => ({
    attemptCount: row.attemptCount,
    batch: {
      failedCount: row.batchFailedCount,
      processedCount: row.batchProcessedCount,
      status: row.batchStatus,
      succeededCount: row.batchSucceededCount,
      target: row.batchTarget,
      totalCount: row.batchTotalCount,
    },
    batchId: row.batchId,
    candidateEmail: row.studioCandidateEmail ?? row.poolCandidateEmail,
    candidateName: row.studioCandidateName ?? row.poolCandidateName,
    errorMessage: row.errorMessage,
    fileSize: row.fileSize,
    finishedAt: toIsoString(row.finishedAt),
    itemId: row.itemId,
    itemStatus: row.itemStatus,
    organizationId: row.organizationId,
    organizationName: row.organizationName,
    organizationSlug: row.organizationSlug,
    originalFileName: row.originalFileName,
    poolItemId: row.poolItemId,
    poolScope: row.poolScope,
    poolStatus: row.poolStatus,
    queuedAt: toIsoString(row.queuedAt),
    resumeParseError: row.studioResumeParseError ?? row.poolResumeParseError,
    resumeParseStatus: row.studioResumeParseStatus ?? row.poolResumeParseStatus,
    resumeRecordId: row.resumeRecordId,
    startedAt: toIsoString(row.startedAt),
    targetRole: row.studioTargetRole ?? row.poolTargetRole,
    userEmail: row.userEmail,
    userId: row.userId,
    userImage: row.userImage,
    userName: row.userName,
  }));
}

export async function enrichResumeParseQueueJobs(
  result: ResumeParseQueueJobsResult,
): Promise<PlatformQueueJobsResult> {
  const itemIds = result.records
    .map((job) => getResumeParseItemId(job.data))
    .filter((itemId): itemId is string => itemId !== null);
  const details = await loadResumeQueueDetailsByItemIds([...new Set(itemIds)]);
  return {
    ...result,
    records: mergeResumeParseQueueJobsWithResumeDetails(result.records, details),
  };
}
