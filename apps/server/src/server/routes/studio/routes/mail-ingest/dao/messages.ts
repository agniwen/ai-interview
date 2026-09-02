import { buildListTextFilterWhere } from "../../../../../../lib/server/db/list-text-filters";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  or,
  sql,
} from "drizzle-orm";

import { db } from "../../../../../../lib/server/db/index";
import { listActiveDuplicateMatchCounts } from "../../../../../../lib/server/resume-semantic/duplicate-matches";
import {
  jobDescription,
  mailIngestAccount,
  mailIngestMessage,
  resumePoolItem,
  resumeUploadBatchItem,
} from "@app/db-schema/schema";
import type {
  MailIngestJdBindStatus,
  MailIngestMessageStatus,
  MailIngestSkipReason,
} from "@app/db-schema/schema";
import type { ResumeParseStatus } from "@app/db-schema/studio-interviews";

const PROCESSING_STALE_MS = 30 * 60 * 1000;
const ERROR_MAX = 500;
const DISPLAY_ERROR_MAX = 300;

function truncateError(error: Error | string): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > ERROR_MAX ? message.slice(0, ERROR_MAX) : message;
}

export interface MailIngestMessageClaim {
  id: string;
  moveTo: "processed" | "failed" | null;
  shouldProcess: boolean;
  status: MailIngestMessageStatus;
}

export async function claimMailIngestMessageForProcessing(input: {
  accountId: string;
  fromAddress: string | null;
  mailbox: string;
  messageId: string | null;
  receivedAt: Date | null;
  subject: string | null;
  uid: string;
  uidValidity: string;
}): Promise<MailIngestMessageClaim> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_STALE_MS);
  const [row] = await db
    .insert(mailIngestMessage)
    .values({
      accountId: input.accountId,
      fromAddress: input.fromAddress,
      id: crypto.randomUUID(),
      mailbox: input.mailbox,
      messageId: input.messageId,
      processedAt: now,
      receivedAt: input.receivedAt,
      status: "processing",
      subject: input.subject,
      uid: input.uid,
      uidValidity: input.uidValidity,
    })
    .onConflictDoNothing({
      target: [
        mailIngestMessage.accountId,
        mailIngestMessage.mailbox,
        mailIngestMessage.uidValidity,
        mailIngestMessage.uid,
      ],
    })
    .returning({ id: mailIngestMessage.id, status: mailIngestMessage.status });
  if (row) {
    return { id: row.id, moveTo: null, shouldProcess: true, status: row.status };
  }

  const [existing] = await db
    .select({
      id: mailIngestMessage.id,
      processedAt: mailIngestMessage.processedAt,
      status: mailIngestMessage.status,
    })
    .from(mailIngestMessage)
    .where(
      and(
        eq(mailIngestMessage.accountId, input.accountId),
        eq(mailIngestMessage.mailbox, input.mailbox),
        eq(mailIngestMessage.uidValidity, input.uidValidity),
        eq(mailIngestMessage.uid, input.uid),
      ),
    )
    .limit(1);
  if (!existing) {
    throw new Error("邮件处理记录 claim 失败。");
  }
  if (existing.status !== "processing") {
    return {
      id: existing.id,
      moveTo: existing.status === "failed" ? "failed" : "processed",
      shouldProcess: false,
      status: existing.status,
    };
  }

  const [staleRow] = await db
    .update(mailIngestMessage)
    .set({ batchId: null, errorMessage: null, processedAt: now, status: "processing" })
    .where(
      and(
        eq(mailIngestMessage.id, existing.id),
        eq(mailIngestMessage.status, "processing"),
        or(isNull(mailIngestMessage.processedAt), lt(mailIngestMessage.processedAt, staleBefore)),
      ),
    )
    .returning({ id: mailIngestMessage.id, status: mailIngestMessage.status });
  return staleRow
    ? { id: staleRow.id, moveTo: null, shouldProcess: true, status: staleRow.status }
    : { id: existing.id, moveTo: null, shouldProcess: false, status: existing.status };
}

export async function updateMailIngestMessageResult(
  id: string,
  result: {
    batchId?: string | null;
    error?: Error | string;
    status: MailIngestMessageStatus;
    jdBindStatus?: MailIngestJdBindStatus | null;
    boundJobDescriptionId?: string | null;
    extractedJobCodes?: string[] | null;
    attachmentCount?: number | null;
    resumeAttachmentCount?: number | null;
  },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      attachmentCount: result.attachmentCount ?? null,
      batchId: result.batchId ?? null,
      boundJobDescriptionId: result.boundJobDescriptionId ?? null,
      errorMessage: result.error ? truncateError(result.error) : null,
      extractedJobCodes: result.extractedJobCodes ?? null,
      jdBindStatus: result.jdBindStatus ?? null,
      processedAt: new Date(),
      resumeAttachmentCount: result.resumeAttachmentCount ?? null,
      status: result.status,
    })
    .where(eq(mailIngestMessage.id, id));
}

export async function markMailIngestMessageSkipped(
  id: string,
  skipReason: MailIngestSkipReason,
  extra?: { attachmentCount?: number | null; resumeAttachmentCount?: number | null },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      attachmentCount: extra?.attachmentCount ?? null,
      processedAt: new Date(),
      resumeAttachmentCount: extra?.resumeAttachmentCount ?? null,
      skipReason,
      status: "skipped",
    })
    .where(eq(mailIngestMessage.id, id));
}

export interface MailMessageLogAttachment {
  fileName: string;
  hasDuplicate: boolean;
  poolItemId: string | null;
  resumeParseError: string | null;
  resumeParseStatus: ResumeParseStatus | null;
  resumeRecordId: string | null;
}

export interface MailMessageLogRecord {
  attachmentCount: number | null;
  attachments: MailMessageLogAttachment[];
  boundJobDescriptionName: string | null;
  errorMessage: string | null;
  fromAddress: string | null;
  id: string;
  jdBindStatus: MailIngestJdBindStatus | null;
  poolSummary: "all_failed" | "all_pooled" | "parsing" | "partial_failed" | null;
  receivedAt: string | null;
  resumeAttachmentCount: number | null;
  skipReason: MailIngestSkipReason | null;
  status: MailIngestMessageStatus;
  subject: string | null;
}

function displayError(message: string | null): string | null {
  if (!message) {
    return null;
  }
  const oneLine = message.replaceAll(/\s+/g, " ").trim();
  return oneLine.length > DISPLAY_ERROR_MAX ? `${oneLine.slice(0, DISPLAY_ERROR_MAX)}…` : oneLine;
}

function summarizePool(
  attachments: MailMessageLogAttachment[],
): MailMessageLogRecord["poolSummary"] {
  if (attachments.length === 0) {
    return null;
  }
  if (
    attachments.some(
      (item) => item.resumeParseStatus !== "ready" && item.resumeParseStatus !== "failed",
    )
  ) {
    return "parsing";
  }
  if (attachments.every((item) => item.resumeParseStatus === "ready")) {
    return "all_pooled";
  }
  if (attachments.every((item) => item.resumeParseStatus === "failed")) {
    return "all_failed";
  }
  return "partial_failed";
}

async function loadAttachments(organizationId: string, batchIds: string[]) {
  const rows = await db
    .select({
      batchId: resumeUploadBatchItem.batchId,
      fileName: resumeUploadBatchItem.originalFileName,
      orderIndex: resumeUploadBatchItem.orderIndex,
      poolItemId: resumeUploadBatchItem.poolItemId,
      resumeParseError: resumePoolItem.resumeParseError,
      resumeParseStatus: resumePoolItem.resumeParseStatus,
      resumeRecordId: resumeUploadBatchItem.resumeRecordId,
    })
    .from(resumeUploadBatchItem)
    .leftJoin(
      resumePoolItem,
      and(
        eq(resumeUploadBatchItem.poolItemId, resumePoolItem.id),
        eq(resumePoolItem.organizationId, organizationId),
      ),
    )
    .where(inArray(resumeUploadBatchItem.batchId, batchIds))
    .orderBy(asc(resumeUploadBatchItem.batchId), asc(resumeUploadBatchItem.orderIndex));
  const poolItemIds = rows.map((row) => row.poolItemId).filter((id): id is string => id !== null);
  const duplicates = await listActiveDuplicateMatchCounts({
    organizationId,
    sourceIds: poolItemIds,
    sourceType: "resume_pool_item",
  });
  const result = new Map<string, MailMessageLogAttachment[]>();
  for (const row of rows) {
    const attachment: MailMessageLogAttachment = {
      fileName: row.fileName,
      hasDuplicate: row.poolItemId ? (duplicates.get(row.poolItemId)?.count ?? 0) > 0 : false,
      poolItemId: row.poolItemId,
      resumeParseError: row.resumeParseError,
      resumeParseStatus: row.resumeParseStatus,
      resumeRecordId: row.resumeRecordId,
    };
    result.set(row.batchId, [...(result.get(row.batchId) ?? []), attachment]);
  }
  return result;
}

function buildWhere(input: {
  accountId: string;
  jdBindStatus?: MailIngestJdBindStatus;
  keyword?: string;
  textFilters?: string;
  receivedFrom?: Date;
  receivedTo?: Date;
  skipReason?: MailIngestSkipReason;
  status?: MailIngestMessageStatus;
}) {
  return and(
    eq(mailIngestMessage.accountId, input.accountId),
    buildListTextFilterWhere("mailLogs", input.textFilters, {
      fromAddress: mailIngestMessage.fromAddress,
      subject: mailIngestMessage.subject,
    }),
    ...(input.status ? [eq(mailIngestMessage.status, input.status)] : []),
    ...(input.skipReason ? [eq(mailIngestMessage.skipReason, input.skipReason)] : []),
    ...(input.jdBindStatus ? [eq(mailIngestMessage.jdBindStatus, input.jdBindStatus)] : []),
    ...(input.keyword
      ? [
          or(
            ilike(mailIngestMessage.subject, `%${input.keyword}%`),
            ilike(mailIngestMessage.fromAddress, `%${input.keyword}%`),
          ),
        ]
      : []),
    ...(input.receivedFrom ? [gte(mailIngestMessage.receivedAt, input.receivedFrom)] : []),
    ...(input.receivedTo ? [lte(mailIngestMessage.receivedAt, input.receivedTo)] : []),
  );
}

export async function listAccountMailMessages(input: {
  accountId: string;
  jdBindStatus?: MailIngestJdBindStatus;
  keyword?: string;
  textFilters?: string;
  organizationId: string;
  page: number;
  pageSize: number;
  receivedFrom?: Date;
  receivedTo?: Date;
  skipReason?: MailIngestSkipReason;
  status?: MailIngestMessageStatus;
}): Promise<{ records: MailMessageLogRecord[]; total: number }> {
  const where = buildWhere(input);
  const [[{ count: total } = { count: 0 }], rows] = await Promise.all([
    db
      .select({ count: count() })
      .from(mailIngestMessage)
      .innerJoin(
        mailIngestAccount,
        and(
          eq(mailIngestMessage.accountId, mailIngestAccount.id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .where(where),
    db
      .select({
        attachmentCount: mailIngestMessage.attachmentCount,
        batchId: mailIngestMessage.batchId,
        boundJobDescriptionName: jobDescription.name,
        errorMessage: mailIngestMessage.errorMessage,
        fromAddress: mailIngestMessage.fromAddress,
        id: mailIngestMessage.id,
        jdBindStatus: mailIngestMessage.jdBindStatus,
        receivedAt: mailIngestMessage.receivedAt,
        resumeAttachmentCount: mailIngestMessage.resumeAttachmentCount,
        skipReason: mailIngestMessage.skipReason,
        status: mailIngestMessage.status,
        subject: mailIngestMessage.subject,
      })
      .from(mailIngestMessage)
      .innerJoin(
        mailIngestAccount,
        and(
          eq(mailIngestMessage.accountId, mailIngestAccount.id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .leftJoin(jobDescription, eq(mailIngestMessage.boundJobDescriptionId, jobDescription.id))
      .where(where)
      .orderBy(sql`${mailIngestMessage.receivedAt} DESC NULLS LAST`, desc(mailIngestMessage.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
  ]);
  const batchIds = rows.map((row) => row.batchId).filter((id): id is string => id !== null);
  const attachments = batchIds.length
    ? await loadAttachments(input.organizationId, batchIds)
    : new Map<string, MailMessageLogAttachment[]>();
  return {
    records: rows.map((row) => {
      const items = row.batchId ? (attachments.get(row.batchId) ?? []) : [];
      return {
        attachmentCount: row.attachmentCount,
        attachments: items,
        boundJobDescriptionName: row.boundJobDescriptionName,
        errorMessage: displayError(row.errorMessage),
        fromAddress: row.fromAddress,
        id: row.id,
        jdBindStatus: row.jdBindStatus,
        poolSummary: summarizePool(items),
        receivedAt: row.receivedAt?.toISOString() ?? null,
        resumeAttachmentCount: row.resumeAttachmentCount,
        skipReason: row.skipReason,
        status: row.status,
        subject: row.subject,
      };
    }),
    total,
  };
}
