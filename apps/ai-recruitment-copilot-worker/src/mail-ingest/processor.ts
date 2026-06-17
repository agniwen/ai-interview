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
  updateMailIngestMessageResult,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import type { WorkerMailIngestAccount } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import {
  insertBatchWithItems,
  loadBatchDetail,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { getResumeDocumentExtension } from "@arc/shared/resume-documents";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import { isMatchingResumeMailSubject, selectSupportedResumeAttachments } from "./message-filter";
import type { MailIngestConfig } from "./config";

interface RunResult {
  accounts: number;
  messagesQueued: number;
  messagesSkipped: number;
  messagesFailed: number;
}

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

async function ensureMailbox(client: ImapFlow, mailbox: string): Promise<void> {
  try {
    await client.mailboxCreate(mailbox);
  } catch {
    // Creating an existing IMAP folder commonly fails; move will surface real path issues.
  }
}

async function moveMessage(client: ImapFlow, uid: number, mailbox: string): Promise<void> {
  await ensureMailbox(client, mailbox);
  await client.messageMove([uid], mailbox, { uid: true });
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
): Promise<{
  batchId: string;
  jobs: { batchId: string; itemId: string; organizationId: string; userId: string }[];
}> {
  const attachments = selectSupportedResumeAttachments(mail.attachments);
  if (attachments.length === 0) {
    throw new Error("Boss 直聘邮件中未找到支持的简历附件。");
  }
  const files = await Promise.all(attachments.map(storeResumeAttachment));
  const batchId = await insertBatchWithItems({
    dedupPolicy: account.dedupPolicy,
    files,
    jdMode: account.jdMode,
    jobDescriptionId: account.jobDescriptionId,
    organizationId: account.organizationId,
    resumePoolScope: account.resumePoolScope,
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
  };
}

async function processAccount(
  account: WorkerMailIngestAccount,
  config: MailIngestConfig,
): Promise<Omit<RunResult, "accounts">> {
  const result = { messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const client = new ImapFlow({
    auth: {
      pass: account.password,
      user: account.username,
    },
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure,
  });

  await client.connect();
  const lock = await client.getMailboxLock(account.mailbox);
  try {
    const { mailbox } = client;
    const uidValidity = mailbox ? String(mailbox.uidValidity) : "unknown";
    const uids = await client.search(
      { seen: false, subject: account.subjectKeyword },
      { uid: true },
    );
    if (!uids || !Array.isArray(uids) || uids.length === 0) {
      return result;
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
      const subject = mail.subject ?? message.envelope?.subject ?? null;
      if (!isMatchingResumeMailSubject(subject ?? undefined, account.subjectKeyword)) {
        continue;
      }
      const messageClaim = await claimMailIngestMessageForProcessing({
        accountId: account.id,
        fromAddress: firstAddress(mail),
        mailbox: account.mailbox,
        messageId: mail.messageId ?? null,
        receivedAt: mail.date ?? toDate(message.internalDate),
        subject,
        uid: String(uid),
        uidValidity,
      });
      if (!messageClaim.shouldProcess) {
        if (messageClaim.moveTo === "processed") {
          await moveMessage(client, uid, account.processedMailbox);
        } else if (messageClaim.moveTo === "failed") {
          await moveMessage(client, uid, account.failedMailbox);
        }
        result.messagesSkipped += 1;
        continue;
      }
      try {
        const batch = await createBatchForMail(account, mail);
        await updateMailIngestMessageResult(messageClaim.id, {
          batchId: batch.batchId,
          status: "queued",
        });
        await enqueueResumeParseJobs(batch.jobs);
        await moveMessage(client, uid, account.processedMailbox);
        result.messagesQueued += 1;
      } catch (error) {
        await updateMailIngestMessageResult(messageClaim.id, { error, status: "failed" });
        await moveMessage(client, uid, account.failedMailbox);
        result.messagesFailed += 1;
      }
    }
    return result;
  } finally {
    lock.release();
    await client.logout();
  }
}

export async function runMailIngestOnce(config: MailIngestConfig): Promise<RunResult> {
  const result = { accounts: 0, messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const accounts = await listEnabledMailIngestAccounts(config.maxAccountsPerRun);
  for (const account of accounts) {
    const claimed = await claimMailIngestAccount(account.id);
    if (!claimed) {
      continue;
    }
    result.accounts += 1;
    try {
      const accountResult = await processAccount(account, config);
      result.messagesFailed += accountResult.messagesFailed;
      result.messagesQueued += accountResult.messagesQueued;
      result.messagesSkipped += accountResult.messagesSkipped;
      await finishMailIngestAccountRun(account.id);
    } catch (error) {
      result.messagesFailed += 1;
      await finishMailIngestAccountRun(account.id, error);
      console.error("[mail-ingest] account poll failed", {
        accountId: account.id,
        error,
      });
    }
  }
  return result;
}
