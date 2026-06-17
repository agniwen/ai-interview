import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { mailIngestAccount, mailIngestMessage } from "@arc/db-schema/schema";
import type { MailIngestMessageStatus } from "@arc/db-schema/schema";
import {
  decryptMailIngestSecret,
  encryptMailIngestSecret,
} from "@arc/ai-recruitment-copilot-backend/lib/server/mail-ingest-crypto";
import type { createMailIngestAccountSchema, updateMailIngestAccountSchema } from "./schema";
import type { z } from "zod";

const MAIL_INGEST_ACCOUNT_LEASE_MS = 14 * 60 * 1000;
const MAIL_INGEST_MESSAGE_PROCESSING_STALE_MS = 30 * 60 * 1000;
const ERROR_MESSAGE_MAX = 500;

type AccountRow = typeof mailIngestAccount.$inferSelect;
type CreateAccountInput = z.infer<typeof createMailIngestAccountSchema>;
type UpdateAccountInput = z.infer<typeof updateMailIngestAccountSchema>;

export interface MailIngestAccountDto {
  createdAt: string;
  emailAddress: string;
  enabled: boolean;
  failedMailbox: string;
  hasPassword: boolean;
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
  mailbox: string;
  processedMailbox: string;
  subjectKeyword: string;
  updatedAt: string;
  username: string;
}

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

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > ERROR_MESSAGE_MAX ? message.slice(0, ERROR_MESSAGE_MAX) : message;
}

function toDto(row: AccountRow): MailIngestAccountDto {
  return {
    createdAt: row.createdAt.toISOString(),
    emailAddress: row.emailAddress,
    enabled: row.enabled,
    failedMailbox: row.failedMailbox,
    hasPassword: Boolean(row.encryptedPassword),
    id: row.id,
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastError: row.lastError,
    mailbox: row.mailbox,
    processedMailbox: row.processedMailbox,
    subjectKeyword: row.subjectKeyword,
    updatedAt: row.updatedAt.toISOString(),
    username: row.username,
  };
}

function toWorkerAccount(row: AccountRow): WorkerMailIngestAccount {
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
    mailbox: row.mailbox,
    organizationId: row.organizationId,
    password: decryptMailIngestSecret(row.encryptedPassword),
    processedMailbox: row.processedMailbox,
    resumePoolScope: row.resumePoolScope,
    subjectKeyword: row.subjectKeyword,
    target: row.target,
    userId: row.userId,
    username: row.username,
  };
}

export async function listMailIngestAccounts(
  organizationId: string,
  userId: string,
): Promise<MailIngestAccountDto[]> {
  const rows = await db
    .select()
    .from(mailIngestAccount)
    .where(
      and(
        eq(mailIngestAccount.organizationId, organizationId),
        eq(mailIngestAccount.userId, userId),
      ),
    )
    .orderBy(mailIngestAccount.createdAt);
  return rows.map(toDto);
}

export async function createMailIngestAccount({
  input,
  organizationId,
  userId,
}: {
  input: CreateAccountInput;
  organizationId: string;
  userId: string;
}): Promise<MailIngestAccountDto> {
  const now = new Date();
  const [row] = await db
    .insert(mailIngestAccount)
    .values({
      createdAt: now,
      emailAddress: input.emailAddress,
      enabled: input.enabled,
      encryptedPassword: encryptMailIngestSecret(input.password),
      failedMailbox: input.failedMailbox,
      id: crypto.randomUUID(),
      imapHost: input.imapHost,
      imapPort: input.imapPort,
      imapSecure: input.imapSecure,
      mailbox: input.mailbox,
      organizationId,
      processedMailbox: input.processedMailbox,
      subjectKeyword: input.subjectKeyword,
      updatedAt: now,
      userId,
      username: input.username,
    })
    .returning();
  return toDto(row);
}

export async function updateMailIngestAccount({
  id,
  input,
  organizationId,
  userId,
}: {
  id: string;
  input: UpdateAccountInput;
  organizationId: string;
  userId: string;
}): Promise<MailIngestAccountDto | null> {
  const updateValues: Partial<typeof mailIngestAccount.$inferInsert> = {
    updatedAt: new Date(),
  };
  for (const key of [
    "emailAddress",
    "enabled",
    "failedMailbox",
    "imapHost",
    "imapPort",
    "imapSecure",
    "mailbox",
    "processedMailbox",
    "subjectKeyword",
    "username",
  ] as const) {
    if (input[key] !== undefined) {
      updateValues[key] = input[key] as never;
    }
  }
  if (input.password) {
    updateValues.encryptedPassword = encryptMailIngestSecret(input.password);
  }
  const [row] = await db
    .update(mailIngestAccount)
    .set(updateValues)
    .where(
      and(
        eq(mailIngestAccount.id, id),
        eq(mailIngestAccount.organizationId, organizationId),
        eq(mailIngestAccount.userId, userId),
      ),
    )
    .returning();
  return row ? toDto(row) : null;
}

export async function deleteMailIngestAccount({
  id,
  organizationId,
  userId,
}: {
  id: string;
  organizationId: string;
  userId: string;
}): Promise<boolean> {
  const rows = await db
    .delete(mailIngestAccount)
    .where(
      and(
        eq(mailIngestAccount.id, id),
        eq(mailIngestAccount.organizationId, organizationId),
        eq(mailIngestAccount.userId, userId),
      ),
    )
    .returning({ id: mailIngestAccount.id });
  return rows.length > 0;
}

export async function listEnabledMailIngestAccounts(
  limit = 20,
): Promise<WorkerMailIngestAccount[]> {
  const rows = await db
    .select()
    .from(mailIngestAccount)
    .where(eq(mailIngestAccount.enabled, true))
    .orderBy(mailIngestAccount.lastCheckedAt)
    .limit(limit);
  return rows.map(toWorkerAccount);
}

export async function claimMailIngestAccount(accountId: string): Promise<boolean> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - MAIL_INGEST_ACCOUNT_LEASE_MS);
  const rows = await db
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
    .returning({ id: mailIngestAccount.id });
  return rows.length > 0;
}

export async function finishMailIngestAccountRun(
  accountId: string,
  error?: unknown,
): Promise<void> {
  const now = new Date();
  await db
    .update(mailIngestAccount)
    .set({
      lastCheckedAt: now,
      lastError: error ? truncateError(error) : null,
      pollingStartedAt: null,
      updatedAt: now,
    })
    .where(eq(mailIngestAccount.id, accountId));
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
  const staleBefore = new Date(now.getTime() - MAIL_INGEST_MESSAGE_PROCESSING_STALE_MS);
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
    .set({
      batchId: null,
      errorMessage: null,
      processedAt: now,
      status: "processing",
    })
    .where(
      and(
        eq(mailIngestMessage.id, existing.id),
        eq(mailIngestMessage.status, "processing"),
        or(isNull(mailIngestMessage.processedAt), lt(mailIngestMessage.processedAt, staleBefore)),
      ),
    )
    .returning({ id: mailIngestMessage.id, status: mailIngestMessage.status });
  if (!staleRow) {
    return {
      id: existing.id,
      moveTo: null,
      shouldProcess: false,
      status: existing.status,
    };
  }
  return { id: staleRow.id, moveTo: null, shouldProcess: true, status: staleRow.status };
}

export async function updateMailIngestMessageResult(
  id: string,
  result: { batchId?: string | null; error?: unknown; status: MailIngestMessageStatus },
): Promise<void> {
  await db
    .update(mailIngestMessage)
    .set({
      batchId: result.batchId ?? null,
      errorMessage: result.error ? truncateError(result.error) : null,
      processedAt: new Date(),
      status: result.status,
    })
    .where(eq(mailIngestMessage.id, id));
}
