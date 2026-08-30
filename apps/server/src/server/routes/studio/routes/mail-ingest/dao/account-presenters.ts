import { decryptMailIngestSecret } from "@app/server/lib/server/mail-ingest-crypto";
import type { mailIngestAccount } from "@arc/db-schema/schema";
import type { MailIngestLoginConfig } from "../validation";

type AccountRow = typeof mailIngestAccount.$inferSelect;

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
  listenStartAt: string | null;
  mailbox: string;
  processedMailbox: string;
  subjectKeyword: string;
  updatedAt: string;
  username: string;
}

export interface WorkspaceMailIngestAccountRow {
  account: MailIngestAccountDto | null;
  lastRunFailed: number | null;
  lastRunMatched: number | null;
  lastRunQueued: number | null;
  lastRunReceived: number | null;
  lastRunSubjectSkipped: number | null;
  messageCount: number;
  problemCount: number;
  user: { email: string; id: string; image: string | null; name: string; role: string };
}

export interface PlatformMailIngestAccountRow extends WorkspaceMailIngestAccountRow {
  organization: { id: string; name: string; slug: string };
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

export function toMailIngestAccountDto(row: AccountRow): MailIngestAccountDto {
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
    listenStartAt: row.listenStartAt?.toISOString() ?? null,
    mailbox: row.mailbox,
    processedMailbox: row.processedMailbox,
    subjectKeyword: row.subjectKeyword,
    updatedAt: row.updatedAt.toISOString(),
    username: row.username,
  };
}

export function toNullableMailIngestAccountDto(row: {
  accountCreatedAt: Date | null;
  accountEmailAddress: string | null;
  accountEnabled: boolean | null;
  accountEncryptedPassword: string | null;
  accountFailedMailbox: string | null;
  accountId: string | null;
  accountImapHost: string | null;
  accountImapPort: number | null;
  accountImapSecure: boolean | null;
  accountLastCheckedAt: Date | null;
  accountLastError: string | null;
  accountListenStartAt: Date | null;
  accountMailbox: string | null;
  accountProcessedMailbox: string | null;
  accountSubjectKeyword: string | null;
  accountUpdatedAt: Date | null;
  accountUsername: string | null;
}): MailIngestAccountDto | null {
  if (!row.accountId) {
    return null;
  }
  return {
    createdAt: (row.accountCreatedAt ?? new Date(0)).toISOString(),
    emailAddress: row.accountEmailAddress ?? "",
    enabled: row.accountEnabled ?? false,
    failedMailbox: row.accountFailedMailbox ?? "",
    hasPassword: Boolean(row.accountEncryptedPassword),
    id: row.accountId,
    imapHost: row.accountImapHost ?? "",
    imapPort: row.accountImapPort ?? 0,
    imapSecure: row.accountImapSecure ?? false,
    lastCheckedAt: row.accountLastCheckedAt?.toISOString() ?? null,
    lastError: row.accountLastError,
    listenStartAt: row.accountListenStartAt?.toISOString() ?? null,
    mailbox: row.accountMailbox ?? "",
    processedMailbox: row.accountProcessedMailbox ?? "",
    subjectKeyword: row.accountSubjectKeyword ?? "",
    updatedAt: (row.accountUpdatedAt ?? new Date(0)).toISOString(),
    username: row.accountUsername ?? "",
  };
}

export function toWorkerMailIngestAccount(row: AccountRow): WorkerMailIngestAccount {
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
    password: decryptMailIngestSecret(row.encryptedPassword),
    processedMailbox: row.processedMailbox,
    resumePoolScope: row.resumePoolScope,
    subjectKeyword: row.subjectKeyword,
    target: row.target,
    userId: row.userId,
    username: row.username,
  };
}

export function toMailIngestLoginConfig(row: AccountRow): MailIngestLoginConfig {
  return {
    imapHost: row.imapHost,
    imapPort: row.imapPort,
    imapSecure: row.imapSecure,
    mailbox: row.mailbox,
    password: decryptMailIngestSecret(row.encryptedPassword),
    username: row.username,
  };
}
