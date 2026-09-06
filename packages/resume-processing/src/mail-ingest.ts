import type { Database } from "@app/database";
import { jobDescription, mailIngestAccount, recruitingMailMessage } from "@app/db-schema/schema";
import type {
  MailIngestJdBindStatus,
  MailIngestMessageStatus,
  MailIngestSkipReason,
} from "@app/db-schema/schema";
import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { z } from "zod";

const MAIL_INGEST_ACCOUNT_LEASE_MS = 14 * 60 * 1000;
const MESSAGE_PROCESSING_STALE_MS = 30 * 60 * 1000;
const ERROR_MESSAGE_MAX = 500;

type AccountRow = typeof mailIngestAccount.$inferSelect;

const mailIngestErrorSchema = z.object({
  message: z.string().optional(),
  responseStatus: z.string().optional(),
  responseText: z.string().optional(),
});
type MailIngestError = z.output<typeof mailIngestErrorSchema>;

export interface WorkerMailIngestAccount {
  dedupPolicy: AccountRow["dedupPolicy"];
  emailAddress: string;
  failedMailbox: string;
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  jdMode: AccountRow["jdMode"];
  jobDescriptionId: string | null;
  listenStartAt: Date | null;
  mailbox: string;
  organizationId: string;
  password: string;
  processedMailbox: string;
  resumePoolScope: AccountRow["resumePoolScope"];
  subjectKeyword: string;
  target: AccountRow["target"];
  userId: string;
  username: string;
}

export interface MailIngestMessageClaim {
  id: string;
  moveTo: "processed" | "failed" | null;
  shouldProcess: boolean;
  status: MailIngestMessageStatus;
}

export interface MailIngestDaoOptions {
  decryptSecret(value: string): string;
}

function truncateAccountError(error: MailIngestError): string {
  const { message = "未知错误", responseStatus, responseText } = error;
  const parts = [message];
  if (responseStatus?.trim()) {
    parts.push(responseStatus.trim());
  }
  if (responseText?.trim()) {
    parts.push(responseText.trim());
  }
  const combined = parts.join(" · ");
  return combined.length > ERROR_MESSAGE_MAX ? combined.slice(0, ERROR_MESSAGE_MAX) : combined;
}

function truncateMessageError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message;
}

function toWorkerMailIngestAccount(
  row: AccountRow,
  decryptSecret: MailIngestDaoOptions["decryptSecret"],
): WorkerMailIngestAccount {
  return {
    dedupPolicy: row.dedupPolicy,
    emailAddress: row.emailAddress,
    failedMailbox: row.failedMailbox,
    id: row.id,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    jdMode: row.jdMode,
    jobDescriptionId: row.jobDescriptionId,
    listenStartAt: row.listenStartAt,
    mailbox: row.mailbox,
    organizationId: row.organizationId,
    password: decryptSecret(row.encryptedPassword),
    processedMailbox: row.processedMailbox,
    resumePoolScope: row.resumePoolScope,
    subjectKeyword: row.subjectKeyword,
    target: row.target,
    userId: row.userId,
    username: row.username,
  };
}

export function createMailIngestDao(database: Database, options: MailIngestDaoOptions) {
  return {
    async claimAccount(accountId: string): Promise<Date | null> {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - MAIL_INGEST_ACCOUNT_LEASE_MS);
      const rows = await database
        .update(mailIngestAccount)
        .set({ lastError: null, pollingStartedAt: now, updatedAt: now })
        .where(
          and(
            eq(mailIngestAccount.id, accountId),
            eq(mailIngestAccount.enabled, true),
            or(
              isNull(mailIngestAccount.pollingStartedAt),
              lt(mailIngestAccount.pollingStartedAt, staleBefore),
            ),
          ),
        )
        .returning({ pollingStartedAt: mailIngestAccount.pollingStartedAt });
      return rows[0]?.pollingStartedAt ?? null;
    },

    async claimMessageForProcessing(input: {
      accountId: string;
      fromAddress: string | null;
      mailbox: string;
      messageId: string | null;
      receivedAt: Date | null;
      subject: string | null;
      uid: string;
      uidValidity: string;
    }): Promise<MailIngestMessageClaim> {
      const [account] = await database
        .select({ organizationId: mailIngestAccount.organizationId })
        .from(mailIngestAccount)
        .where(eq(mailIngestAccount.id, input.accountId))
        .limit(1);
      if (!account) {
        throw new Error("邮箱接收账户不存在");
      }
      const now = new Date();
      const staleBefore = new Date(now.getTime() - MESSAGE_PROCESSING_STALE_MS);
      const [row] = await database
        .insert(recruitingMailMessage)
        .values({
          accountId: input.accountId,
          fromAddress: input.fromAddress,
          id: crypto.randomUUID(),
          mailbox: input.mailbox,
          messageId: input.messageId,
          organizationId: account.organizationId,
          processedAt: now,
          receivedAt: input.receivedAt,
          status: "processing",
          subject: input.subject,
          uid: input.uid,
          uidValidity: input.uidValidity,
        })
        .onConflictDoNothing({
          target: [
            recruitingMailMessage.accountId,
            recruitingMailMessage.mailbox,
            recruitingMailMessage.uidValidity,
            recruitingMailMessage.uid,
          ],
        })
        .returning({ id: recruitingMailMessage.id, status: recruitingMailMessage.status });
      if (row) {
        return { id: row.id, moveTo: null, shouldProcess: true, status: row.status };
      }

      const [existing] = await database
        .select({
          id: recruitingMailMessage.id,
          processedAt: recruitingMailMessage.processedAt,
          status: recruitingMailMessage.status,
        })
        .from(recruitingMailMessage)
        .where(
          and(
            eq(recruitingMailMessage.accountId, input.accountId),
            eq(recruitingMailMessage.mailbox, input.mailbox),
            eq(recruitingMailMessage.uidValidity, input.uidValidity),
            eq(recruitingMailMessage.uid, input.uid),
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

      const [staleRow] = await database
        .update(recruitingMailMessage)
        .set({ batchId: null, errorMessage: null, processedAt: now, status: "processing" })
        .where(
          and(
            eq(recruitingMailMessage.id, existing.id),
            eq(recruitingMailMessage.status, "processing"),
            or(
              isNull(recruitingMailMessage.processedAt),
              lt(recruitingMailMessage.processedAt, staleBefore),
            ),
          ),
        )
        .returning({ id: recruitingMailMessage.id, status: recruitingMailMessage.status });
      return staleRow
        ? { id: staleRow.id, moveTo: null, shouldProcess: true, status: staleRow.status }
        : { id: existing.id, moveTo: null, shouldProcess: false, status: existing.status };
    },

    async fetchPublishedJobDescriptionsByCodes(
      organizationId: string,
      codes: readonly string[],
    ): Promise<{ code: string; id: string }[]> {
      const normalizedCodes = [
        ...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean)),
      ];
      if (normalizedCodes.length === 0) {
        return [];
      }
      const rows = await database
        .select({ code: jobDescription.code, id: jobDescription.id })
        .from(jobDescription)
        .where(
          and(
            eq(jobDescription.organizationId, organizationId),
            eq(jobDescription.lifecycleStatus, "published"),
            inArray(jobDescription.code, normalizedCodes),
          ),
        );
      return rows.flatMap((row) => (row.code ? [{ code: row.code, id: row.id }] : []));
    },

    async finishAccountRun(
      accountId: string,
      opts?: {
        error?: unknown;
        pollingStartedAt?: Date;
        counts?: {
          received: number;
          subjectSkipped: number;
          matched: number;
          queued: number;
          failed: number;
        };
      },
    ): Promise<void> {
      const now = new Date();
      const updateValues = {
        lastCheckedAt: now,
        lastError: opts?.error
          ? truncateAccountError(mailIngestErrorSchema.parse(opts.error))
          : null,
        pollingStartedAt: null,
        updatedAt: now,
      };
      if (opts?.counts) {
        Object.assign(updateValues, {
          lastRunFailed: opts.counts.failed,
          lastRunMatched: opts.counts.matched,
          lastRunQueued: opts.counts.queued,
          lastRunReceived: opts.counts.received,
          lastRunSubjectSkipped: opts.counts.subjectSkipped,
        });
      }
      const filters = [eq(mailIngestAccount.id, accountId)];
      if (opts?.pollingStartedAt) {
        filters.push(eq(mailIngestAccount.pollingStartedAt, opts.pollingStartedAt));
      }
      await database
        .update(mailIngestAccount)
        .set(updateValues)
        .where(and(...filters));
    },

    async listEnabledAccounts(
      limit = 20,
      scope?: { organizationId: string },
    ): Promise<WorkerMailIngestAccount[]> {
      const filters = [eq(mailIngestAccount.enabled, true)];
      if (scope) {
        filters.push(eq(mailIngestAccount.organizationId, scope.organizationId));
      }
      const rows = await database
        .select()
        .from(mailIngestAccount)
        .where(and(...filters))
        .orderBy(mailIngestAccount.lastCheckedAt)
        .limit(limit);
      return rows.map((row) => toWorkerMailIngestAccount(row, options.decryptSecret));
    },

    async markMessageSkipped(
      id: string,
      skipReason: MailIngestSkipReason,
      extra?: { attachmentCount?: number | null; resumeAttachmentCount?: number | null },
    ): Promise<void> {
      await database
        .update(recruitingMailMessage)
        .set({
          attachmentCount: extra?.attachmentCount ?? null,
          processedAt: new Date(),
          resumeAttachmentCount: extra?.resumeAttachmentCount ?? null,
          skipReason,
          status: "skipped",
        })
        .where(eq(recruitingMailMessage.id, id));
    },

    async updateMessageResult(
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
      await database
        .update(recruitingMailMessage)
        .set({
          attachmentCount: result.attachmentCount ?? null,
          batchId: result.batchId ?? null,
          boundJobDescriptionId: result.boundJobDescriptionId ?? null,
          errorMessage: result.error ? truncateMessageError(result.error) : null,
          extractedJobCodes: result.extractedJobCodes ?? null,
          jdBindStatus: result.jdBindStatus ?? null,
          processedAt: new Date(),
          resumeAttachmentCount: result.resumeAttachmentCount ?? null,
          status: result.status,
        })
        .where(eq(recruitingMailMessage.id, id));
    },
  };
}

export type MailIngestDao = ReturnType<typeof createMailIngestDao>;
