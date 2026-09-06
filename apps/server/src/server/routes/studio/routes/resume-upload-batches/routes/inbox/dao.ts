import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, asc, count, desc, eq, gt, lt, or } from "drizzle-orm";
import { db } from "../../../../../../../lib/server/db/index";
import {
  resumePoolItem,
  recruitingUploadBatch,
  recruitingUploadBatchItem,
} from "@app/db-schema/schema";
import { UPLOAD_TASK_INBOX_PAGE_SIZE } from "@app/shared/upload-task-inbox";
import { decodeUploadTaskInboxCursor, encodeUploadTaskInboxCursor } from "./cursor";

export async function queryUploadTaskInbox(input: {
  cursor: string | null;
  organizationId: string;
  userId: string;
}) {
  const baseFilter = and(
    eq(recruitingUploadBatch.organizationId, input.organizationId),
    eq(recruitingUploadBatch.createdBy, input.userId),
  );
  const cursor = input.cursor ? decodeUploadTaskInboxCursor(input.cursor) : null;
  const cursorFilter = cursor
    ? or(
        lt(recruitingUploadBatch.createdAt, cursor.batchCreatedAt),
        and(
          eq(recruitingUploadBatch.createdAt, cursor.batchCreatedAt),
          lt(recruitingUploadBatch.id, cursor.batchId),
        ),
        and(
          eq(recruitingUploadBatch.createdAt, cursor.batchCreatedAt),
          eq(recruitingUploadBatch.id, cursor.batchId),
          gt(recruitingUploadBatchItem.orderIndex, cursor.orderIndex),
        ),
        and(
          eq(recruitingUploadBatch.createdAt, cursor.batchCreatedAt),
          eq(recruitingUploadBatch.id, cursor.batchId),
          eq(recruitingUploadBatchItem.orderIndex, cursor.orderIndex),
          gt(recruitingUploadBatchItem.id, cursor.itemId),
        ),
      )
    : undefined;
  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        attemptCount: recruitingUploadBatchItem.attemptCount,
        batchCreatedAt: recruitingUploadBatch.createdAt,
        batchId: recruitingUploadBatchItem.batchId,
        errorMessage: recruitingUploadBatchItem.errorMessage,
        fileSize: recruitingUploadBatchItem.fileSize,
        finishedAt: recruitingUploadBatchItem.finishedAt,
        id: recruitingUploadBatchItem.id,
        orderIndex: recruitingUploadBatchItem.orderIndex,
        originalFileName: recruitingUploadBatchItem.originalFileName,
        poolCandidateName: resumePoolItem.candidateName,
        poolItemId: recruitingUploadBatchItem.poolItemId,
        poolItemStatus: resumePoolItem.status,
        poolTargetRole: resumePoolItem.targetRole,
        queuedAt: recruitingUploadBatchItem.queuedAt,
        resumeRecordId: recruitingUploadBatchItem.recruitingRecordId,
        startedAt: recruitingUploadBatchItem.startedAt,
        status: recruitingUploadBatchItem.status,
        studioCandidateName: recruitingRecordReadModel.candidateName,
        studioTargetRole: recruitingRecordReadModel.targetRole,
        target: recruitingUploadBatch.target,
      })
      .from(recruitingUploadBatchItem)
      .innerJoin(
        recruitingUploadBatch,
        eq(recruitingUploadBatch.id, recruitingUploadBatchItem.batchId),
      )
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
      .where(and(baseFilter, cursorFilter))
      .orderBy(
        desc(recruitingUploadBatch.createdAt),
        desc(recruitingUploadBatch.id),
        asc(recruitingUploadBatchItem.orderIndex),
        asc(recruitingUploadBatchItem.id),
      )
      .limit(UPLOAD_TASK_INBOX_PAGE_SIZE + 1),
    db
      .select({ total: count() })
      .from(recruitingUploadBatchItem)
      .innerJoin(
        recruitingUploadBatch,
        eq(recruitingUploadBatch.id, recruitingUploadBatchItem.batchId),
      )
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
