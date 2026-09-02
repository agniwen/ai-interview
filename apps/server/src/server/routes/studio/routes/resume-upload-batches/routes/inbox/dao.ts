import { and, asc, count, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import {
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@app/db-schema/schema";
import { UPLOAD_TASK_INBOX_PAGE_SIZE } from "@app/shared/upload-task-inbox";
import { decodeUploadTaskInboxCursor, encodeUploadTaskInboxCursor } from "./cursor";

export async function queryUploadTaskInbox(input: {
  cursor: string | null;
  organizationId: string;
  userId: string;
}) {
  const baseFilter = and(
    eq(resumeUploadBatch.organizationId, input.organizationId),
    eq(resumeUploadBatch.createdBy, input.userId),
  );
  const cursor = input.cursor ? decodeUploadTaskInboxCursor(input.cursor) : null;
  const cursorFilter = cursor
    ? or(
        lt(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
        and(
          eq(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
          lt(resumeUploadBatch.id, cursor.batchId),
        ),
        and(
          eq(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
          eq(resumeUploadBatch.id, cursor.batchId),
          gt(resumeUploadBatchItem.orderIndex, cursor.orderIndex),
        ),
        and(
          eq(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
          eq(resumeUploadBatch.id, cursor.batchId),
          eq(resumeUploadBatchItem.orderIndex, cursor.orderIndex),
          gt(resumeUploadBatchItem.id, cursor.itemId),
        ),
      )
    : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        attemptCount: resumeUploadBatchItem.attemptCount,
        batchCreatedAt: resumeUploadBatch.createdAt,
        batchId: resumeUploadBatchItem.batchId,
        errorMessage: resumeUploadBatchItem.errorMessage,
        fileSize: resumeUploadBatchItem.fileSize,
        finishedAt: resumeUploadBatchItem.finishedAt,
        id: resumeUploadBatchItem.id,
        orderIndex: resumeUploadBatchItem.orderIndex,
        originalFileName: resumeUploadBatchItem.originalFileName,
        poolCandidateName: resumePoolItem.candidateName,
        poolItemId: resumeUploadBatchItem.poolItemId,
        poolItemStatus: resumePoolItem.status,
        poolTargetRole: resumePoolItem.targetRole,
        queuedAt: resumeUploadBatchItem.queuedAt,
        resumeRecordId: resumeUploadBatchItem.resumeRecordId,
        startedAt: resumeUploadBatchItem.startedAt,
        status: resumeUploadBatchItem.status,
        studioCandidateName: studioInterview.candidateName,
        studioTargetRole: studioInterview.targetRole,
        target: resumeUploadBatch.target,
      })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
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
      .where(and(baseFilter, cursorFilter))
      .orderBy(
        desc(resumeUploadBatch.createdAt),
        desc(resumeUploadBatch.id),
        asc(resumeUploadBatchItem.orderIndex),
        asc(resumeUploadBatchItem.id),
      )
      .limit(UPLOAD_TASK_INBOX_PAGE_SIZE + 1),
    db
      .select({ total: count() })
      .from(resumeUploadBatchItem)
      .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
      .where(baseFilter),
  ]);
  const records = rows.slice(0, UPLOAD_TASK_INBOX_PAGE_SIZE);
  const lastRecord = records.at(-1);
  return {
    nextCursor:
      rows.length > UPLOAD_TASK_INBOX_PAGE_SIZE && lastRecord
        ? encodeUploadTaskInboxCursor({
            batchCreatedAt: lastRecord.batchCreatedAt,
            batchId: lastRecord.batchId,
            itemId: lastRecord.id,
            orderIndex: lastRecord.orderIndex,
          })
        : null,
    records,
    total,
  };
}
