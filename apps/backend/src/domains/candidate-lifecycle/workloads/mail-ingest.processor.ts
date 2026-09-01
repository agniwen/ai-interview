/* oxlint-disable anti-slop/no-runtime-typeof -- IMAP polling parses external date/subject unions before message idempotency and attachment batching in one copied transactional workload. */
import type { MailIngestJdBindStatus, mailIngestAccount } from "@arc/db-schema/schema";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
} from "@arc/shared/resume-documents";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";
import type {
  MailIngestConfig,
  MailIngestRunResult,
  MailIngestRunScope,
} from "../../../background/background.types.js";

type MailAccountRow = typeof mailIngestAccount.$inferSelect;

export interface WorkerMailIngestAccount {
  dedupPolicy: MailAccountRow["dedupPolicy"];
  id: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  jdMode: MailAccountRow["jdMode"];
  jobDescriptionId: string | null;
  listenStartAt: Date | null;
  mailbox: string;
  organizationId: string;
  password: string;
  subjectKeyword: string;
  target: MailAccountRow["target"];
  userId: string;
  username: string;
}

export interface MailIngestProcessorPorts {
  buildAttachmentKeyByHash(contentHash: string, extension: string): Promise<string>;
  claimAccount(accountId: string): Promise<Date | null>;
  claimMessage(input: {
    accountId: string;
    fromAddress: string | null;
    mailbox: string;
    messageId: string | null;
    receivedAt: Date | null;
    subject: string | null;
    uid: string;
    uidValidity: string;
  }): Promise<{ id: string; shouldProcess: boolean }>;
  enqueueResumeParseJobs(
    jobs: {
      batchId: string;
      itemId: string;
      organizationId: string;
      userId: string;
    }[],
  ): Promise<void>;
  fetchPublishedJobsByCodes(organizationId: string, codes: string[]): Promise<{ id: string }[]>;
  finishAccount(
    accountId: string,
    result:
      | { error: Error; pollingStartedAt: Date }
      | {
          counts: {
            failed: number;
            matched: number;
            queued: number;
            received: number;
            subjectSkipped: number;
          };
          pollingStartedAt: Date;
        },
  ): Promise<void>;
  insertBatch(input: {
    dedupPolicy: MailAccountRow["dedupPolicy"];
    files: {
      contentHash: string;
      fileSize: number;
      originalFileName: string;
      storageKey: string;
    }[];
    jdMode: MailAccountRow["jdMode"];
    jobDescriptionId: string | null;
    jobMatchRequestedAt: Date;
    organizationId: string;
    resumePoolScope: "public";
    sourceChannel: "mail_ingest";
    target: MailAccountRow["target"];
    userId: string;
  }): Promise<string>;
  listEnabledAccounts(
    limit: number,
    scope?: MailIngestRunScope,
  ): Promise<WorkerMailIngestAccount[]>;
  loadBatchDetail(
    batchId: string,
    organizationId: string,
    userId: string,
  ): Promise<{ items: { id: string }[] } | null>;
  markMessageSkipped(
    messageId: string,
    reason: "no_supported_attachment",
    counts: { attachmentCount: number; resumeAttachmentCount: number },
  ): Promise<void>;
  putObjectBytes(input: {
    body: Uint8Array;
    contentType: string;
    storageKey: string;
  }): Promise<void>;
  updateMessageResult(
    messageId: string,
    result:
      | { attachmentCount: number; error: Error | string; status: "failed" }
      | {
          attachmentCount: number;
          batchId: string;
          boundJobDescriptionId: string | null;
          extractedJobCodes: string[];
          jdBindStatus: MailIngestJdBindStatus;
          resumeAttachmentCount: number;
          status: "queued";
        },
  ): Promise<void>;
}

interface MailAttachment {
  content: Buffer;
  contentDisposition?: string | false;
  contentType?: string;
  filename?: string;
}

const JOB_CODE_PATTERN = /(^|[^A-Za-z0-9])(?<code>[A-Za-z0-9]{7})(?=$|[^A-Za-z0-9])/g;

export function extractJobCodesFromMailSubject(subject: string | null | undefined): string[] {
  if (!subject) {
    return [];
  }
  const codes = new Set<string>();
  for (const match of subject.toUpperCase().matchAll(JOB_CODE_PATTERN)) {
    const code = match.groups?.code;
    if (code) {
      codes.add(code.toUpperCase());
    }
  }
  return [...codes];
}

export function selectSupportedMailAttachments(
  attachments: readonly MailAttachment[],
): { content: Buffer; contentType: string; filename: string }[] {
  return attachments
    .filter((attachment) => attachment.contentDisposition !== "inline")
    .filter((attachment) =>
      isSupportedResumeDocumentInput({
        fileName: attachment.filename,
        mediaType: attachment.contentType,
      }),
    )
    .map((attachment) => ({
      content: attachment.content,
      contentType: attachment.contentType || "application/octet-stream",
      filename: attachment.filename?.trim() || "resume",
    }));
}

function connectionKey(account: WorkerMailIngestAccount): string {
  return JSON.stringify({
    host: account.imapHost,
    mailbox: account.mailbox,
    password: account.password,
    port: account.imapPort,
    secure: account.imapSecure,
    username: account.username,
  });
}

function groupAccounts(accounts: WorkerMailIngestAccount[]): WorkerMailIngestAccount[][] {
  const groups = new Map<string, WorkerMailIngestAccount[]>();
  for (const account of accounts) {
    const key = connectionKey(account);
    groups.set(key, [...(groups.get(key) ?? []), account]);
  }
  return [...groups.values()];
}

function earliestListenStart(accounts: WorkerMailIngestAccount[]): Date | null {
  if (accounts.some((account) => account.listenStartAt === null)) {
    return null;
  }
  const values = accounts.flatMap((account) =>
    account.listenStartAt ? [account.listenStartAt.getTime()] : [],
  );
  return values.length === 0 ? null : new Date(Math.min(...values));
}

function deriveJdBindStatus(input: {
  hasDefaultJd: boolean;
  matchedJobIdCount: number;
}): MailIngestJdBindStatus {
  if (input.matchedJobIdCount === 1) {
    return "bound";
  }
  if (input.matchedJobIdCount >= 2) {
    return "ambiguous";
  }
  return input.hasDefaultJd ? "fallback" : "unmatched";
}

function firstAddress(mail: ParsedMail): string | null {
  return (
    mail.from?.value.flatMap((address) => (address.address ? [address.address] : [])).join(", ") ||
    null
  );
}

function normalizeSubject(value: string | false | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}

async function storeAttachment(
  attachment: { content: Buffer; contentType: string; filename: string },
  ports: MailIngestProcessorPorts,
) {
  const bytes = new Uint8Array(attachment.content);
  const contentHash = await sha256HexOfBytes(bytes);
  const storageKey = await ports.buildAttachmentKeyByHash(
    contentHash,
    getResumeDocumentExtension({
      fileName: attachment.filename,
      mediaType: attachment.contentType,
    }),
  );
  await ports.putObjectBytes({ body: bytes, contentType: attachment.contentType, storageKey });
  return {
    contentHash,
    fileSize: bytes.byteLength,
    originalFileName: attachment.filename.slice(0, 255) || "resume",
    storageKey,
  };
}

async function resolveBinding(
  account: WorkerMailIngestAccount,
  subject: string | null,
  ports: MailIngestProcessorPorts,
) {
  const defaultBinding = account.jobDescriptionId
    ? { jdMode: account.jdMode, jobDescriptionId: account.jobDescriptionId }
    : { jdMode: "auto" as const, jobDescriptionId: null };
  const codes = extractJobCodesFromMailSubject(subject);
  const jobs = codes.length
    ? await ports.fetchPublishedJobsByCodes(account.organizationId, codes)
    : [];
  const ids = new Set(jobs.map((job) => job.id));
  const status = deriveJdBindStatus({
    hasDefaultJd: Boolean(account.jobDescriptionId),
    matchedJobIdCount: ids.size,
  });
  const matchedId = ids.size === 1 ? ([...ids][0] ?? null) : null;
  const binding = matchedId
    ? { jdMode: "bind" as const, jobDescriptionId: matchedId }
    : defaultBinding;
  return {
    binding,
    observability: { boundId: binding.jobDescriptionId, codes, status },
  };
}

interface MailTally {
  failed: number;
  noAttachment: number;
  queued: number;
  received: number;
  subjectSkipped: number;
}

const zeroTally = (): MailTally => ({
  failed: 0,
  noAttachment: 0,
  queued: 0,
  received: 0,
  subjectSkipped: 0,
});

async function processMail(
  account: WorkerMailIngestAccount,
  mail: ParsedMail,
  message: { envelope?: { subject?: string | false | null }; internalDate?: Date | string },
  uid: number,
  uidValidity: string,
  ports: MailIngestProcessorPorts,
): Promise<MailTally> {
  const tally = zeroTally();
  tally.received = 1;
  const subject = normalizeSubject(mail.subject) ?? normalizeSubject(message.envelope?.subject);
  const normalizedSubject = subject?.trim().toLowerCase();
  const normalizedKeyword = account.subjectKeyword.trim().toLowerCase();
  if (!(normalizedSubject && normalizedKeyword && normalizedSubject.includes(normalizedKeyword))) {
    tally.subjectSkipped = 1;
    return tally;
  }
  const receivedAt =
    mail.date ??
    (typeof message.internalDate === "string"
      ? new Date(message.internalDate)
      : (message.internalDate ?? null));
  if (account.listenStartAt && (!receivedAt || receivedAt < account.listenStartAt)) {
    return tally;
  }
  const claim = await ports.claimMessage({
    accountId: account.id,
    fromAddress: firstAddress(mail),
    mailbox: account.mailbox,
    messageId: mail.messageId ?? null,
    receivedAt,
    subject,
    uid: String(uid),
    uidValidity,
  });
  if (!claim.shouldProcess) {
    return tally;
  }
  const attachmentCount = mail.attachments.length;
  try {
    const { binding, observability } = await resolveBinding(account, subject, ports);
    const attachments = selectSupportedMailAttachments(mail.attachments);
    if (attachments.length === 0) {
      await ports.markMessageSkipped(claim.id, "no_supported_attachment", {
        attachmentCount,
        resumeAttachmentCount: 0,
      });
      tally.noAttachment = 1;
      return tally;
    }
    const files = await Promise.all(attachments.map((item) => storeAttachment(item, ports)));
    const batchId = await ports.insertBatch({
      dedupPolicy: account.dedupPolicy,
      files,
      jdMode: binding.jdMode,
      jobDescriptionId: binding.jobDescriptionId,
      jobMatchRequestedAt: new Date(),
      organizationId: account.organizationId,
      resumePoolScope: "public",
      sourceChannel: "mail_ingest",
      target: account.target,
      userId: account.userId,
    });
    const detail = await ports.loadBatchDetail(batchId, account.organizationId, account.userId);
    if (!detail) {
      throw new Error("邮件简历批次创建失败。");
    }
    await ports.updateMessageResult(claim.id, {
      attachmentCount,
      batchId,
      boundJobDescriptionId: observability.boundId,
      extractedJobCodes: observability.codes,
      jdBindStatus: observability.status,
      resumeAttachmentCount: attachments.length,
      status: "queued",
    });
    await ports.enqueueResumeParseJobs(
      detail.items.map((item) => ({
        batchId,
        itemId: item.id,
        organizationId: account.organizationId,
        userId: account.userId,
      })),
    );
    tally.queued = 1;
  } catch (error) {
    await ports.updateMessageResult(claim.id, {
      attachmentCount,
      error: error instanceof Error ? error : String(error),
      status: "failed",
    });
    tally.failed = 1;
  }
  return tally;
}

async function processGroup(
  accounts: WorkerMailIngestAccount[],
  config: MailIngestConfig,
  ports: MailIngestProcessorPorts,
): Promise<{ result: Omit<MailIngestRunResult, "accounts">; tallies: Map<string, MailTally> }> {
  const result = { messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const tallies = new Map(accounts.map((account) => [account.id, zeroTally()]));
  const [account] = accounts;
  if (!account) {
    return { result, tallies };
  }
  const client = new ImapFlow({
    auth: { pass: account.password, user: account.username },
    host: account.imapHost,
    logger: false,
    port: account.imapPort,
    secure: account.imapSecure,
  });
  client.on("error", (error) =>
    console.error("[mail-ingest] IMAP client error", {
      accountIds: accounts.map((item) => item.id),
      error,
    }),
  );
  await client.connect();
  const lock = await client.getMailboxLock(account.mailbox);
  try {
    const uidValidity = client.mailbox ? String(client.mailbox.uidValidity) : "unknown";
    const since = earliestListenStart(accounts);
    const uids = await client.search(since ? { since } : { all: true }, { uid: true });
    if (!uids || !Array.isArray(uids)) {
      return { result, tallies };
    }
    for (const uid of uids.slice(-config.maxMessagesPerAccount)) {
      const message = await client.fetchOne(
        String(uid),
        { envelope: true, internalDate: true, source: true, uid: true },
        { uid: true },
      );
      if (!message || !message.source) {
        continue;
      }
      const mail = await simpleParser(message.source);
      for (const current of accounts) {
        const next = await processMail(current, mail, message, uid, uidValidity, ports);
        const tally = tallies.get(current.id) ?? zeroTally();
        // SAFETY: zeroTally creates exactly the numeric MailTally own keys iterated here.
        for (const key of Object.keys(tally) as (keyof MailTally)[]) {
          tally[key] += next[key];
        }
        tallies.set(current.id, tally);
        result.messagesQueued += next.queued;
        result.messagesFailed += next.failed;
        result.messagesSkipped += next.received - next.queued - next.failed;
      }
    }
    return { result, tallies };
  } finally {
    lock.release();
    await client.logout();
  }
}

async function finishAccounts(
  accounts: WorkerMailIngestAccount[],
  tallies: Map<string, MailTally>,
  starts: ReadonlyMap<string, Date>,
  ports: MailIngestProcessorPorts,
  error?: Error,
): Promise<void> {
  await Promise.all(
    accounts.map((account) => {
      const pollingStartedAt = starts.get(account.id);
      if (!pollingStartedAt) {
        return null;
      }
      const tally = tallies.get(account.id) ?? zeroTally();
      return ports.finishAccount(
        account.id,
        error
          ? { error, pollingStartedAt }
          : {
              counts: {
                failed: tally.failed,
                matched: tally.queued + tally.failed + tally.noAttachment,
                queued: tally.queued,
                received: tally.received,
                subjectSkipped: tally.subjectSkipped,
              },
              pollingStartedAt,
            },
      );
    }),
  );
}

/** Full copied IMAP polling, dedupe, JD binding, S3 and parse-queue workflow. */
export async function processMailIngestWorkload(
  config: MailIngestConfig,
  ports: MailIngestProcessorPorts,
  scope?: MailIngestRunScope,
): Promise<MailIngestRunResult> {
  const result = { accounts: 0, messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const accounts = await ports.listEnabledAccounts(config.maxAccountsPerRun, scope);
  const claimed: WorkerMailIngestAccount[] = [];
  const starts = new Map<string, Date>();
  for (const account of accounts) {
    const start = await ports.claimAccount(account.id);
    if (start) {
      result.accounts += 1;
      claimed.push(account);
      starts.set(account.id, start);
    }
  }
  for (const group of groupAccounts(claimed)) {
    try {
      const processed = await processGroup(group, config, ports);
      result.messagesFailed += processed.result.messagesFailed;
      result.messagesQueued += processed.result.messagesQueued;
      result.messagesSkipped += processed.result.messagesSkipped;
      await finishAccounts(group, processed.tallies, starts, ports);
    } catch (error) {
      result.messagesFailed += 1;
      const failure = error instanceof Error ? error : new Error("Mail ingest failed");
      await finishAccounts(group, new Map(), starts, ports, failure);
      console.error("[mail-ingest] account poll failed", {
        accountIds: group.map((account) => account.id),
        error,
      });
    }
  }
  return result;
}
