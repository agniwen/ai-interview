export const MAIL_INGEST_ADMIN_COMMANDS = Symbol("MAIL_INGEST_ADMIN_COMMANDS");

export interface MailIngestAdminCreateInput {
  emailAddress: string;
  enabled: boolean;
  failedMailbox: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  listenStartAt?: string | null;
  mailbox: string;
  organizationId: string;
  password: string;
  processedMailbox: string;
  subjectKeyword: string;
  userId: string;
  username: string;
}

export interface MailIngestAdminUpdateInput {
  emailAddress?: string;
  enabled?: boolean;
  failedMailbox?: string;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
  listenStartAt?: string | null;
  mailbox?: string;
  organizationId: string;
  password?: string;
  processedMailbox?: string;
  subjectKeyword?: string;
  username?: string;
}

export interface MailIngestAdminAccount {
  createdAt: string;
  dedupPolicy: string;
  emailAddress: string;
  enabled: boolean;
  failedMailbox: string;
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  jdMode: string;
  jobDescriptionId: string | null;
  lastCheckedAt: string | null;
  lastError: string | null;
  lastRunFailed: number;
  lastRunMatched: number;
  lastRunQueued: number;
  lastRunReceived: number;
  lastRunSubjectSkipped: number;
  listenStartAt: string | null;
  mailbox: string;
  organizationId: string;
  pollingStartedAt: string | null;
  processedMailbox: string;
  resumePoolScope: string;
  subjectKeyword: string;
  target: string;
  updatedAt: string;
  userId: string;
  username: string;
}

export type MailIngestAdminError =
  | { code: "MAIL_INGEST_ACCOUNT_NOT_FOUND" }
  | { code: "MAIL_INGEST_LOGIN_FAILED"; message: string }
  | { code: "MAIL_INGEST_MEMBER_NOT_FOUND" }
  | { code: "MAIL_INGEST_SECRET_MISSING" };

export type MailIngestAdminResult<T> =
  | { value: T; ok: true }
  | { error: MailIngestAdminError; ok: false };

export interface MailIngestAdminCommands {
  create(input: MailIngestAdminCreateInput): Promise<MailIngestAdminResult<MailIngestAdminAccount>>;
  update(
    id: string,
    input: MailIngestAdminUpdateInput,
  ): Promise<MailIngestAdminResult<MailIngestAdminAccount>>;
}
