import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { ParsedMail } from "mailparser";
import { enqueueResumeParseJobs } from "@arc/resume-parse-queue/resume-parse";
import {
  buildAttachmentKeyByHash,
  putObjectBytes,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import {
  claimMailIngestMessageForProcessing,
  finishMailIngestAccountRun,
  listEnabledMailIngestAccounts,
  claimMailIngestAccount,
  markMailIngestMessageSkipped,
  updateMailIngestMessageResult,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import type { WorkerMailIngestAccount } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import { fetchJobDescriptionsByCodes } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  insertBatchWithItems,
  loadBatchDetail,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { getResumeDocumentExtension } from "@arc/shared/resume-documents";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import type { MailIngestJdBindStatus } from "@arc/db-schema/schema";
import {
  buildMailSearchCriteria,
  extractJobCodesFromSubject,
  isMatchingResumeMailSubject,
  selectSupportedResumeAttachments,
  shouldProcessMailByListenStart,
} from "./message-filter";
import { getMailIngestGroupListenStart, groupMailIngestAccounts } from "./account-groups";
import { deriveJdBindStatus } from "./job-binding";
import type { MailIngestConfig } from "./config";

interface RunResult {
  accounts: number;
  messagesQueued: number;
  messagesSkipped: number;
  messagesFailed: number;
}

type MailJobBinding = Pick<WorkerMailIngestAccount, "jdMode" | "jobDescriptionId">;

function firstAddress(mail: ParsedMail): string | null {
  return (
    mail.from?.value
      ?.map((address) => address.address)
      .filter(Boolean)
      .join(", ") || null
  );
}

function toDate(value: Date | string | undefined): Date | null {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

function normalizeSubject(value: string | false | null | undefined): string | null {
  return typeof value === "string" ? value : null;
}

async function storeResumeAttachment(attachment: {
  content: Buffer;
  contentType: string;
  filename: string;
}) {
  const bytes = new Uint8Array(attachment.content);
  const contentHash = await sha256HexOfBytes(bytes);
  const storageKey = await buildAttachmentKeyByHash(
    contentHash,
    getResumeDocumentExtension({
      fileName: attachment.filename,
      mediaType: attachment.contentType,
    }),
  );
  await putObjectBytes({
    body: bytes,
    contentType: attachment.contentType,
    storageKey,
  });
  return {
    contentHash,
    fileSize: bytes.byteLength,
    originalFileName: attachment.filename.slice(0, 255) || "resume",
    storageKey,
  };
}

async function createBatchForMail(
  account: WorkerMailIngestAccount,
  mail: ParsedMail,
  binding: MailJobBinding,
): Promise<{
  batchId: string;
  jobs: { batchId: string; itemId: string; organizationId: string; userId: string }[];
  resumeAttachmentCount: number;
} | null> {
  const attachments = selectSupportedResumeAttachments(mail.attachments);
  if (attachments.length === 0) {
    return null;
  }
  const files = await Promise.all(attachments.map(storeResumeAttachment));
  const batchId = await insertBatchWithItems({
    dedupPolicy: account.dedupPolicy,
    files,
    jdMode: binding.jdMode,
    jobDescriptionId: binding.jobDescriptionId,
    organizationId: account.organizationId,
    resumePoolScope: account.resumePoolScope,
    sourceChannel: "mail_ingest",
    target: account.target,
    userId: account.userId,
  });
  const detail = await loadBatchDetail(batchId, account.organizationId, account.userId);
  if (!detail) {
    throw new Error("邮件简历批次创建失败。");
  }
  return {
    batchId,
    jobs: detail.items.map((item) => ({
      batchId,
      itemId: item.id,
      organizationId: account.organizationId,
      userId: account.userId,
    })),
    resumeAttachmentCount: attachments.length,
  };
}

interface MailJobBindingResult {
  binding: MailJobBinding;
  observability: {
    jdBindStatus: MailIngestJdBindStatus;
    extractedJobCodes: string[];
    boundJobDescriptionId: string | null;
  };
}

async function resolveMailJobBinding(
  account: WorkerMailIngestAccount,
  subject: string | null,
): Promise<MailJobBindingResult> {
  const hasDefaultJd = Boolean(account.jobDescriptionId);
  const defaultBinding = {
    jdMode: account.jdMode,
    jobDescriptionId: account.jobDescriptionId,
  };
  const codes = extractJobCodesFromSubject(subject);
  const jobs = codes.length ? await fetchJobDescriptionsByCodes(account.organizationId, codes) : [];
  const matchedJobIds = new Set(jobs.map((job) => job.id));
  const jdBindStatus = deriveJdBindStatus({
    hasDefaultJd,
    matchedJobIdCount: matchedJobIds.size,
  });

  if (matchedJobIds.size !== 1) {
    if (matchedJobIds.size > 1) {
      console.warn("[mail-ingest] multiple subject job codes matched different jobs", {
        accountId: account.id,
        codes,
        jobIds: [...matchedJobIds],
      });
    }
    return {
      binding: defaultBinding,
      observability: {
        boundJobDescriptionId: defaultBinding.jobDescriptionId,
        extractedJobCodes: codes,
        jdBindStatus,
      },
    };
  }
  const boundId = [...matchedJobIds][0] ?? null;
  return {
    binding: { jdMode: "bind", jobDescriptionId: boundId },
    observability: { boundJobDescriptionId: boundId, extractedJobCodes: codes, jdBindStatus },
  };
}

interface MailAccountTally {
  received: number;
  subjectSkipped: number;
  queued: number;
  failed: number;
  noAttachment: number;
}

function zeroMailAccountTally(): MailAccountTally {
  return { failed: 0, noAttachment: 0, queued: 0, received: 0, subjectSkipped: 0 };
}

async function processMailForAccount(
  account: WorkerMailIngestAccount,
  mail: ParsedMail,
  message: { envelope?: { subject?: string | false | null }; internalDate?: Date | string },
  uid: number,
  uidValidity: string,
): Promise<MailAccountTally> {
  const tally = zeroMailAccountTally();
  tally.received = 1;

  const subject = normalizeSubject(mail.subject) ?? normalizeSubject(message.envelope?.subject);
  if (!isMatchingResumeMailSubject(subject ?? undefined, account.subjectKeyword)) {
    tally.subjectSkipped = 1;
    return tally;
  }
  const receivedAt = mail.date ?? toDate(message.internalDate);
  if (!shouldProcessMailByListenStart(receivedAt, account.listenStartAt)) {
    return tally;
  }
  const messageClaim = await claimMailIngestMessageForProcessing({
    accountId: account.id,
    fromAddress: firstAddress(mail),
    mailbox: account.mailbox,
    messageId: mail.messageId ?? null,
    receivedAt,
    subject,
    uid: String(uid),
    uidValidity,
  });
  if (!messageClaim.shouldProcess) {
    return tally;
  }
  const attachmentCount = mail.attachments?.length ?? 0;
  try {
    const { binding, observability } = await resolveMailJobBinding(account, subject);
    const batch = await createBatchForMail(account, mail, binding);
    if (!batch) {
      await markMailIngestMessageSkipped(messageClaim.id, "no_supported_attachment", {
        attachmentCount,
        resumeAttachmentCount: 0,
      });
      tally.noAttachment = 1;
      return tally;
    }
    await updateMailIngestMessageResult(messageClaim.id, {
      attachmentCount,
      batchId: batch.batchId,
      boundJobDescriptionId: observability.boundJobDescriptionId,
      extractedJobCodes: observability.extractedJobCodes,
      jdBindStatus: observability.jdBindStatus,
      resumeAttachmentCount: batch.resumeAttachmentCount,
      status: "queued",
    });
    await enqueueResumeParseJobs(batch.jobs);
    tally.queued = 1;
  } catch (error) {
    await updateMailIngestMessageResult(messageClaim.id, {
      attachmentCount,
      error,
      status: "failed",
    });
    tally.failed = 1;
  }

  return tally;
}

async function processAccountGroup(
  accounts: WorkerMailIngestAccount[],
  config: MailIngestConfig,
): Promise<{ result: Omit<RunResult, "accounts">; tallies: Map<string, MailAccountTally> }> {
  const result = { messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const tallies = new Map<string, MailAccountTally>(
    accounts.map((account) => [account.id, zeroMailAccountTally()]),
  );
  const [connectionAccount] = accounts;
  if (!connectionAccount) {
    return { result, tallies };
  }
  const client = new ImapFlow({
    auth: {
      pass: connectionAccount.password,
      user: connectionAccount.username,
    },
    host: connectionAccount.imapHost,
    port: connectionAccount.imapPort,
    secure: connectionAccount.imapSecure,
  });
  client.on("error", (error) => {
    console.error("[mail-ingest] IMAP client error", {
      accountIds: accounts.map((account) => account.id),
      error,
    });
  });

  await client.connect();
  const lock = await client.getMailboxLock(connectionAccount.mailbox);
  try {
    const { mailbox } = client;
    const uidValidity = mailbox ? String(mailbox.uidValidity) : "unknown";
    const listenStartAt = getMailIngestGroupListenStart(accounts);
    const uids = await client.search(buildMailSearchCriteria(listenStartAt), { uid: true });
    if (!uids || !Array.isArray(uids) || uids.length === 0) {
      return { result, tallies };
    }
    for (const uid of uids.slice(-config.maxMessagesPerAccount)) {
      const message = await client.fetchOne(
        String(uid),
        {
          envelope: true,
          internalDate: true,
          source: true,
          uid: true,
        },
        { uid: true },
      );
      if (!message || !message.source) {
        continue;
      }
      const mail = await simpleParser(message.source);
      for (const account of accounts) {
        const tally = await processMailForAccount(account, mail, message, uid, uidValidity);
        const accountTally = tallies.get(account.id) ?? zeroMailAccountTally();
        tallies.set(account.id, {
          failed: accountTally.failed + tally.failed,
          noAttachment: accountTally.noAttachment + tally.noAttachment,
          queued: accountTally.queued + tally.queued,
          received: accountTally.received + tally.received,
          subjectSkipped: accountTally.subjectSkipped + tally.subjectSkipped,
        });
        result.messagesQueued += tally.queued;
        result.messagesFailed += tally.failed;
        result.messagesSkipped += tally.received - tally.queued - tally.failed;
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
  tallies: Map<string, MailAccountTally>,
  error?: unknown,
): Promise<void> {
  await Promise.all(
    accounts.map(({ id }) => {
      const t = tallies.get(id) ?? zeroMailAccountTally();
      return finishMailIngestAccountRun(id, {
        counts: {
          failed: t.failed,
          matched: t.queued + t.failed + t.noAttachment,
          queued: t.queued,
          received: t.received,
          subjectSkipped: t.subjectSkipped,
        },
        error,
      });
    }),
  );
}

export async function runMailIngestOnce(config: MailIngestConfig): Promise<RunResult> {
  const result = { accounts: 0, messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const accounts = await listEnabledMailIngestAccounts(config.maxAccountsPerRun);
  const claimedAccounts: WorkerMailIngestAccount[] = [];
  for (const account of accounts) {
    const claimed = await claimMailIngestAccount(account.id);
    if (!claimed) {
      continue;
    }
    result.accounts += 1;
    claimedAccounts.push(account);
  }
  for (const group of groupMailIngestAccounts(claimedAccounts)) {
    try {
      const { result: groupResult, tallies } = await processAccountGroup(group.accounts, config);
      result.messagesFailed += groupResult.messagesFailed;
      result.messagesQueued += groupResult.messagesQueued;
      result.messagesSkipped += groupResult.messagesSkipped;
      await finishAccounts(group.accounts, tallies);
    } catch (error) {
      result.messagesFailed += 1;
      await finishAccounts(group.accounts, new Map(), error);
      console.error("[mail-ingest] account poll failed", {
        accountIds: group.accounts.map((account) => account.id),
        error,
      });
    }
  }
  return result;
}
