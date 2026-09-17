import { buildListTextFilterWhere } from "../../../../../../lib/server/db/list-text-filters";
import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql } from "drizzle-orm";

import { db } from "../../../../../../lib/server/db/index";
import { listActiveDuplicateMatchCounts } from "../../../../../../lib/server/resume-semantic/duplicate-matches";
import {
  jobDescription,
  mailIngestAccount,
  recruitingMailMessage,
  resumePoolItem,
  recruitingUploadBatchItem,
} from "@app/db-schema/schema";
import type {
  MailIngestJdBindStatus,
  MailIngestMessageStatus,
  MailIngestSkipReason,
} from "@app/db-schema/schema";
import type { ResumeParseStatus } from "@app/db-schema/studio-interviews";
import { mailIngestWorkerDao } from "./worker";

const DISPLAY_ERROR_MAX = 300;
export type { MailIngestMessageClaim } from "@app/resume-processing/mail-ingest";

export function claimMailIngestMessageForProcessing(input: {
  accountId: string;
  fromAddress: string | null;
  mailbox: string;
  messageId: string | null;
  receivedAt: Date | null;
  subject: string | null;
  uid: string;
  uidValidity: string;
}) {
  return mailIngestWorkerDao.claimMessageForProcessing(input);
}

export function updateMailIngestMessageResult(
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
  return mailIngestWorkerDao.updateMessageResult(id, result);
}

export function markMailIngestMessageSkipped(
  id: string,
  skipReason: MailIngestSkipReason,
  extra?: { attachmentCount?: number | null; resumeAttachmentCount?: number | null },
): Promise<void> {
  return mailIngestWorkerDao.markMessageSkipped(id, skipReason, extra);
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
      batchId: recruitingUploadBatchItem.batchId,
      fileName: recruitingUploadBatchItem.originalFileName,
      orderIndex: recruitingUploadBatchItem.orderIndex,
      poolItemId: recruitingUploadBatchItem.poolItemId,
      resumeParseError: resumePoolItem.resumeParseError,
      resumeParseStatus: resumePoolItem.resumeParseStatus,
      resumeRecordId: recruitingUploadBatchItem.recruitingRecordId,
    })
    .from(recruitingUploadBatchItem)
    .leftJoin(
      resumePoolItem,
      and(
        eq(recruitingUploadBatchItem.poolItemId, resumePoolItem.id),
        eq(resumePoolItem.organizationId, organizationId),
      ),
    )
    .where(inArray(recruitingUploadBatchItem.batchId, batchIds))
    .orderBy(asc(recruitingUploadBatchItem.batchId), asc(recruitingUploadBatchItem.orderIndex));
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
    eq(recruitingMailMessage.accountId, input.accountId),
    buildListTextFilterWhere("mailLogs", input.textFilters, {
      fromAddress: recruitingMailMessage.fromAddress,
      subject: recruitingMailMessage.subject,
    }),
    ...(input.status ? [eq(recruitingMailMessage.status, input.status)] : []),
    ...(input.skipReason ? [eq(recruitingMailMessage.skipReason, input.skipReason)] : []),
    ...(input.jdBindStatus ? [eq(recruitingMailMessage.jdBindStatus, input.jdBindStatus)] : []),
    ...(input.keyword
      ? [
          or(
            ilike(recruitingMailMessage.subject, `%${input.keyword}%`),
            ilike(recruitingMailMessage.fromAddress, `%${input.keyword}%`),
          ),
        ]
      : []),
    ...(input.receivedFrom ? [gte(recruitingMailMessage.receivedAt, input.receivedFrom)] : []),
    ...(input.receivedTo ? [lte(recruitingMailMessage.receivedAt, input.receivedTo)] : []),
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
      .from(recruitingMailMessage)
      .innerJoin(
        mailIngestAccount,
        and(
          eq(recruitingMailMessage.accountId, mailIngestAccount.id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .where(where),
    db
      .select({
        attachmentCount: recruitingMailMessage.attachmentCount,
        batchId: recruitingMailMessage.batchId,
        boundJobDescriptionName: jobDescription.name,
        errorMessage: recruitingMailMessage.errorMessage,
        fromAddress: recruitingMailMessage.fromAddress,
        id: recruitingMailMessage.id,
        jdBindStatus: recruitingMailMessage.jdBindStatus,
        receivedAt: recruitingMailMessage.receivedAt,
        resumeAttachmentCount: recruitingMailMessage.resumeAttachmentCount,
        skipReason: recruitingMailMessage.skipReason,
        status: recruitingMailMessage.status,
        subject: recruitingMailMessage.subject,
      })
      .from(recruitingMailMessage)
      .innerJoin(
        mailIngestAccount,
        and(
          eq(recruitingMailMessage.accountId, mailIngestAccount.id),
          eq(mailIngestAccount.organizationId, input.organizationId),
        ),
      )
      .leftJoin(jobDescription, eq(recruitingMailMessage.boundJobDescriptionId, jobDescription.id))
      .where(where)
      .orderBy(
        sql`${recruitingMailMessage.receivedAt} DESC NULLS LAST`,
        desc(recruitingMailMessage.id),
      )
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
