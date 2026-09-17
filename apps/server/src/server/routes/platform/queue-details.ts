import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import type { ResumeParseQueueJobsResult } from "@app/resume-parse-queue/resume-parse";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  organization,
  resumePoolItem,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
  user,
} from "@app/db-schema/schema";

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

export interface QueueJobRecordBase {
  attemptsMade: number;
  attemptsStarted: number | null;
  data: unknown;
  failedReason: string | null;
  finishedOn: string | null;
  id: string;
  name: string;
  processedBy: string | null;
  processedOn: string | null;
  progress: unknown;
  returnvalue: unknown;
  state: string;
  timestamp: string | null;
}

export type PlatformQueueJobRecord = QueueJobRecordBase & {
  organization: PlatformQueueOrganization | null;
  resumeDetail: ResumeQueueDetail | null;
  triggeredBy: PlatformQueueTriggeredBy | null;
};

export type PlatformQueueJobsResult = Omit<ResumeParseQueueJobsResult, "records"> & {
  records: PlatformQueueJobRecord[];
};

export interface ResumeQueueDetailFilters {
  parseStatus?: string;
  uploadStatus?: string;
}

const resumeParseQueueJobDataSchema = z
  .object({ itemId: z.string().min(1).optional() })
  .passthrough();

type ResumeParseQueueJobData = z.output<typeof resumeParseQueueJobDataSchema>;

function isAllFilter(value: string | undefined): boolean {
  return !value || value === "all";
}

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

function getResumeParseItemId(data: ResumeParseQueueJobData): string | null {
  return data.itemId ?? null;
}

export function mergeResumeParseQueueJobsWithResumeDetails(
  jobs: QueueJobRecordBase[],
  details: ResumeQueueDetail[],
): PlatformQueueJobRecord[] {
  const detailsByItemId = new Map(details.map((detail) => [detail.itemId, detail]));

  return jobs.map((job) => {
    const parsedJobData = resumeParseQueueJobDataSchema.safeParse(job.data);
    const itemId = parsedJobData.success ? getResumeParseItemId(parsedJobData.data) : null;
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

export function filterEnrichedResumeParseQueueJobRecords(
  records: PlatformQueueJobRecord[],
  filters: ResumeQueueDetailFilters,
): PlatformQueueJobRecord[] {
  const parseStatus = filters.parseStatus?.trim();
  const uploadStatus = filters.uploadStatus?.trim();

  if (isAllFilter(parseStatus) && isAllFilter(uploadStatus)) {
    return records;
  }

  return records.filter((record) => {
    const detail = record.resumeDetail;
    if (!detail) {
      return false;
    }
    if (!isAllFilter(uploadStatus) && detail.itemStatus !== uploadStatus) {
      return false;
    }
    if (!isAllFilter(parseStatus) && detail.resumeParseStatus !== parseStatus) {
      return false;
    }
    return true;
  });
}

export async function loadResumeQueueDetailsByItemIds(
  itemIds: string[],
): Promise<ResumeQueueDetail[]> {
  if (itemIds.length === 0) {
    return [];
  }

  const { db } = await import("../../../lib/server/db/index");
  const rows = await db
    .select({
      attemptCount: recruitingUploadBatchItem.attemptCount,
      batchFailedCount: recruitingUploadBatch.failedCount,
      batchId: recruitingUploadBatchItem.batchId,
      batchProcessedCount: recruitingUploadBatch.processedCount,
      batchStatus: recruitingUploadBatch.status,
      batchSucceededCount: recruitingUploadBatch.succeededCount,
      batchTarget: recruitingUploadBatch.target,
      batchTotalCount: recruitingUploadBatch.totalCount,
      errorMessage: recruitingUploadBatchItem.errorMessage,
      fileSize: recruitingUploadBatchItem.fileSize,
      finishedAt: recruitingUploadBatchItem.finishedAt,
      itemId: recruitingUploadBatchItem.id,
      itemStatus: recruitingUploadBatchItem.status,
      organizationId: organization.id,
      organizationName: organization.name,
      organizationSlug: organization.slug,
      originalFileName: recruitingUploadBatchItem.originalFileName,
      poolCandidateEmail: resumePoolItem.candidateEmail,
      poolCandidateName: resumePoolItem.candidateName,
      poolItemId: recruitingUploadBatchItem.poolItemId,
      poolResumeParseError: resumePoolItem.resumeParseError,
      poolResumeParseStatus: resumePoolItem.resumeParseStatus,
      poolScope: resumePoolItem.scope,
      poolStatus: resumePoolItem.status,
      poolTargetRole: resumePoolItem.targetRole,
      queuedAt: recruitingUploadBatchItem.queuedAt,
      resumeRecordId: recruitingUploadBatchItem.recruitingRecordId,
      startedAt: recruitingUploadBatchItem.startedAt,
      studioCandidateEmail: recruitingRecordReadModel.candidateEmail,
      studioCandidateName: recruitingRecordReadModel.candidateName,
      studioResumeParseError: recruitingRecordReadModel.resumeParseError,
      studioResumeParseStatus: recruitingRecordReadModel.resumeParseStatus,
      studioTargetRole: recruitingRecordReadModel.targetRole,
      userEmail: user.email,
      userId: user.id,
      userImage: user.image,
      userName: user.name,
    })
    .from(recruitingUploadBatchItem)
    .innerJoin(
      recruitingUploadBatch,
      eq(recruitingUploadBatch.id, recruitingUploadBatchItem.batchId),
    )
    .innerJoin(organization, eq(organization.id, recruitingUploadBatch.organizationId))
    .innerJoin(user, eq(user.id, recruitingUploadBatch.createdBy))
    .leftJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.id, recruitingUploadBatchItem.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, recruitingUploadBatch.organizationId),
      ),
    )
    .leftJoin(
      resumePoolItem,
      and(
        eq(resumePoolItem.id, recruitingUploadBatchItem.poolItemId),
        eq(resumePoolItem.organizationId, recruitingUploadBatch.organizationId),
      ),
    )
    .where(inArray(recruitingUploadBatchItem.id, itemIds));

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
    .map((job) => {
      const parsedJobData = resumeParseQueueJobDataSchema.safeParse(job.data);
      return parsedJobData.success ? getResumeParseItemId(parsedJobData.data) : null;
    })
    .filter((itemId): itemId is string => itemId !== null);
  const details = await loadResumeQueueDetailsByItemIds([...new Set(itemIds)]);
  return {
    ...result,
    records: mergeResumeParseQueueJobsWithResumeDetails(result.records, details),
  };
}
