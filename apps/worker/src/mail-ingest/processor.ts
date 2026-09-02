// oxlint-disable max-classes-per-file -- Effect services and tagged errors are class-based capability contracts.
import type { ImapFlow, ImapFlowOptions } from "imapflow";
import type { ParsedMail } from "mailparser";
import { z } from "zod";
import type { MailIngestDao, WorkerMailIngestAccount } from "@app/resume-processing/mail-ingest";
import type { buildAttachmentKeyByHash, putObjectBytes } from "@app/object-storage";
import type { enqueueResumeParseJobs } from "@app/resume-parse-queue/resume-parse";
import { getResumeDocumentExtension } from "@app/shared/resume-documents";
import { sha256HexOfBytes } from "@app/shared/file-hash";
import type { MailIngestJdBindStatus } from "@app/db-schema/schema";
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
import { Context, Data, Effect, Layer } from "effect";
import { cleanupPreservingPrimary } from "../effect/cleanup";
import { captureWorkerException } from "../sentry";

export interface RunResult {
  accounts: number;
  messagesQueued: number;
  messagesSkipped: number;
  messagesFailed: number;
}

export interface MailIngestRunScope {
  organizationId: string;
}

type MailJobBinding = Pick<WorkerMailIngestAccount, "jdMode" | "jobDescriptionId">;

export type ImapClient = Pick<
  ImapFlow,
  "connect" | "fetchOne" | "getMailboxLock" | "logout" | "search"
> & {
  mailbox: ImapFlow["mailbox"];
  on(event: "error", listener: (error: Error) => void): ImapClient;
};

export interface MailIngestDependencies {
  buildAttachmentKeyByHash: typeof buildAttachmentKeyByHash;
  claimMailIngestAccount: MailIngestDao["claimAccount"];
  claimMailIngestMessageForProcessing: MailIngestDao["claimMessageForProcessing"];
  createImapClient: (options: ImapFlowOptions) => ImapClient;
  enqueueResumeParseJobs: typeof enqueueResumeParseJobs;
  fetchPublishedJobDescriptionsByCodes: MailIngestDao["fetchPublishedJobDescriptionsByCodes"];
  finishMailIngestAccountRun: MailIngestDao["finishAccountRun"];
  insertBatchWithItems(input: {
    dedupPolicy: WorkerMailIngestAccount["dedupPolicy"];
    files: {
      contentHash: string;
      fileSize: number;
      originalFileName: string;
      storageKey: string;
    }[];
    jdMode: WorkerMailIngestAccount["jdMode"];
    jobDescriptionId: string | null;
    jobMatchRequestedAt: Date;
    organizationId: string;
    resumePoolScope: "public";
    sourceChannel: "mail_ingest";
    target: WorkerMailIngestAccount["target"];
    userId: string;
  }): Promise<string>;
  listEnabledMailIngestAccounts: MailIngestDao["listEnabledAccounts"];
  loadBatchDetail(
    batchId: string,
    organizationId: string,
    userId: string,
  ): Promise<{ items: { id: string }[] } | null>;
  markMailIngestMessageSkipped: MailIngestDao["markMessageSkipped"];
  parseMail: (source: Buffer) => Promise<ParsedMail>;
  putObjectBytes: typeof putObjectBytes;
  updateMailIngestMessageResult: MailIngestDao["updateMessageResult"];
}

export class MailIngestProcessor extends Context.Service<
  MailIngestProcessor,
  MailIngestDependencies
>()("@app/worker/MailIngestProcessor") {}

export const mailIngestProcessorLayer = (dependencies: MailIngestDependencies) =>
  Layer.succeed(MailIngestProcessor, dependencies);

class MailIngestFailure extends Data.TaggedError("MailIngestFailure")<{
  readonly cause: unknown;
}> {}

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
  return z.string().safeParse(value).data ?? null;
}

// 以内容哈希生成存储键，实现附件去重，并返回批次持久化所需元数据。 / Uses a content-derived storage key for deduplication and returns metadata needed by batch persistence.
async function storeResumeAttachment(
  attachment: {
    content: Buffer;
    contentType: string;
    filename: string;
  },
  dependencies: MailIngestDependencies,
) {
  const bytes = new Uint8Array(attachment.content);
  const contentHash = await sha256HexOfBytes(bytes);
  const storageKey = await dependencies.buildAttachmentKeyByHash(
    contentHash,
    getResumeDocumentExtension({
      fileName: attachment.filename,
      mediaType: attachment.contentType,
    }),
  );
  await dependencies.putObjectBytes({
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

// 先落对象存储和批次记录，再返回可直接投递解析队列的 item 列表。 / Persists objects and the batch before returning items ready for the resume-parse queue.
async function createBatchForMail(
  account: WorkerMailIngestAccount,
  mail: ParsedMail,
  binding: MailJobBinding,
  dependencies: MailIngestDependencies,
): Promise<{
  batchId: string;
  jobs: { batchId: string; itemId: string; organizationId: string; userId: string }[];
  resumeAttachmentCount: number;
} | null> {
  const attachments = selectSupportedResumeAttachments(mail.attachments);
  if (attachments.length === 0) {
    return null;
  }
  const files = await Promise.all(
    attachments.map((attachment) => storeResumeAttachment(attachment, dependencies)),
  );
  const batchId = await dependencies.insertBatchWithItems({
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
  const detail = await dependencies.loadBatchDetail(
    batchId,
    account.organizationId,
    account.userId,
  );
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

// 仅当主题职位码唯一命中时覆盖账号默认 JD；歧义或未命中保留默认绑定并记录观测状态。 / Overrides the account default JD only for one unique subject-code match; ambiguity or no match keeps the default and records observability.
async function resolveMailJobBinding(
  account: WorkerMailIngestAccount,
  subject: string | null,
  dependencies: MailIngestDependencies,
): Promise<MailJobBindingResult> {
  const hasDefaultJd = Boolean(account.jobDescriptionId);
  const defaultBinding = account.jobDescriptionId
    ? { jdMode: account.jdMode, jobDescriptionId: account.jobDescriptionId }
    : { jdMode: "auto" as const, jobDescriptionId: null };
  const codes = extractJobCodesFromSubject(subject);
  const jobs = codes.length
    ? await dependencies.fetchPublishedJobDescriptionsByCodes(account.organizationId, codes)
    : [];
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

// 对单封邮件执行主题/时间/幂等认领，再持久化批次后入队；失败写回消息记录。 / Applies subject, time, and idempotency gates before persisting and enqueueing; failures are written back to the message record.
async function processMailForAccount(
  account: WorkerMailIngestAccount,
  mail: ParsedMail,
  message: { envelope?: { subject?: string | false | null }; internalDate?: Date | string },
  uid: number,
  uidValidity: string,
  dependencies: MailIngestDependencies,
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
  const messageClaim = await dependencies.claimMailIngestMessageForProcessing({
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
    const { binding, observability } = await resolveMailJobBinding(account, subject, dependencies);
    const batch = await createBatchForMail(account, mail, binding, dependencies);
    if (!batch) {
      await dependencies.markMailIngestMessageSkipped(messageClaim.id, "no_supported_attachment", {
        attachmentCount,
        resumeAttachmentCount: 0,
      });
      tally.noAttachment = 1;
      return tally;
    }
    await dependencies.updateMailIngestMessageResult(messageClaim.id, {
      attachmentCount,
      batchId: batch.batchId,
      boundJobDescriptionId: observability.boundJobDescriptionId,
      extractedJobCodes: observability.extractedJobCodes,
      jdBindStatus: observability.jdBindStatus,
      resumeAttachmentCount: batch.resumeAttachmentCount,
      status: "queued",
    });
    await dependencies.enqueueResumeParseJobs(batch.jobs);
    tally.queued = 1;
  } catch (error) {
    await dependencies.updateMailIngestMessageResult(messageClaim.id, {
      attachmentCount,
      error: error instanceof Error ? error : String(error),
      status: "failed",
    });
    tally.failed = 1;
  }

  return tally;
}

// 同凭据账号共享一次 IMAP 锁与消息扫描，再分别应用账号规则并累计结果。 / Shares one IMAP lock and scan across same-credential accounts, then applies account rules and tallies separately.
async function processAccountGroup(
  accounts: WorkerMailIngestAccount[],
  config: MailIngestConfig,
  dependencies: MailIngestDependencies,
): Promise<{ result: Omit<RunResult, "accounts">; tallies: Map<string, MailAccountTally> }> {
  const result = { messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const tallies = new Map<string, MailAccountTally>(
    accounts.map((account) => [account.id, zeroMailAccountTally()]),
  );
  const [connectionAccount] = accounts;
  if (!connectionAccount) {
    return { result, tallies };
  }
  const client = dependencies.createImapClient({
    auth: {
      pass: connectionAccount.password,
      user: connectionAccount.username,
    },
    host: connectionAccount.imapHost,
    logger: false,
    port: connectionAccount.imapPort,
    secure: connectionAccount.imapSecure,
  });
  client.on("error", (error) => {
    console.error("[mail-ingest] IMAP client error", {
      accountIds: accounts.map((account) => account.id),
      error,
    });
  });

  let releaseLock: (() => void) | undefined;
  let primaryCause: unknown;
  let hasPrimaryFailure = false;
  try {
    await client.connect();
    const lock = await client.getMailboxLock(connectionAccount.mailbox);
    releaseLock = () => lock.release();
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
      const mail = await dependencies.parseMail(message.source);
      for (const account of accounts) {
        const tally = await processMailForAccount(
          account,
          mail,
          message,
          uid,
          uidValidity,
          dependencies,
        );
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
  } catch (error) {
    primaryCause = error;
    hasPrimaryFailure = true;
    throw error;
  } finally {
    await cleanupPreservingPrimary({
      cleanup: async () => {
        let releaseError: unknown;
        try {
          releaseLock?.();
        } catch (error) {
          releaseError = error;
        }
        try {
          await client.logout();
        } catch (error) {
          releaseError ??= error;
        }
        if (releaseError !== undefined) {
          throw releaseError;
        }
      },
      hasPrimaryFailure,
      onCleanupFailure: (error) => {
        captureWorkerException(error, "worker.mail-ingest.cleanup", {
          accountIds: accounts.map((account) => account.id),
        });
        console.error("[mail-ingest] failed to close IMAP resources", {
          accountIds: accounts.map((account) => account.id),
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      },
      primaryCause,
    });
  }
}

// 将每个已认领账号的统计或组级错误写回，未成功认领的账号不会被结束。 / Persists per-account tallies or the group error; accounts without a successful claim are not finalized.
async function finishAccounts(
  accounts: WorkerMailIngestAccount[],
  tallies: Map<string, MailAccountTally>,
  dependencies: MailIngestDependencies,
  pollingStartedAtByAccountId: ReadonlyMap<string, Date>,
  error?: Error,
): Promise<void> {
  await Promise.all(
    accounts.map(({ id }) => {
      const t = tallies.get(id) ?? zeroMailAccountTally();
      const pollingStartedAt = pollingStartedAtByAccountId.get(id);
      if (!pollingStartedAt) {
        return null;
      }
      return dependencies.finishMailIngestAccountRun(
        id,
        error
          ? { error, pollingStartedAt }
          : {
              counts: {
                failed: t.failed,
                matched: t.queued + t.failed + t.noAttachment,
                queued: t.queued,
                received: t.received,
                subjectSkipped: t.subjectSkipped,
              },
              pollingStartedAt,
            },
      );
    }),
  );
}

// 认领启用账号、按连接分组处理，并把组级失败隔离到当前连接。 / Claims enabled accounts, processes connection groups, and confines group failures to their connection.
async function runMailIngestOnceWithDependencies(
  config: MailIngestConfig,
  dependencies: MailIngestDependencies,
  scope?: MailIngestRunScope,
): Promise<RunResult> {
  const result = { accounts: 0, messagesFailed: 0, messagesQueued: 0, messagesSkipped: 0 };
  const accounts = scope
    ? await dependencies.listEnabledMailIngestAccounts(config.maxAccountsPerRun, scope)
    : await dependencies.listEnabledMailIngestAccounts(config.maxAccountsPerRun);
  const claimedAccounts: WorkerMailIngestAccount[] = [];
  const pollingStartedAtByAccountId = new Map<string, Date>();
  for (const account of accounts) {
    const pollingStartedAt = await dependencies.claimMailIngestAccount(account.id);
    if (!pollingStartedAt) {
      continue;
    }
    result.accounts += 1;
    claimedAccounts.push(account);
    pollingStartedAtByAccountId.set(account.id, pollingStartedAt);
  }
  for (const group of groupMailIngestAccounts(claimedAccounts)) {
    try {
      const { result: groupResult, tallies } = await processAccountGroup(
        group.accounts,
        config,
        dependencies,
      );
      result.messagesFailed += groupResult.messagesFailed;
      result.messagesQueued += groupResult.messagesQueued;
      result.messagesSkipped += groupResult.messagesSkipped;
      await finishAccounts(group.accounts, tallies, dependencies, pollingStartedAtByAccountId);
    } catch (error) {
      result.messagesFailed += 1;
      const accountError = error instanceof Error ? error : new Error("Mail ingest failed");
      await finishAccounts(
        group.accounts,
        new Map(),
        dependencies,
        pollingStartedAtByAccountId,
        accountError,
      );
      console.error("[mail-ingest] account poll failed", {
        accountIds: group.accounts.map((account) => account.id),
        error,
      });
    }
  }
  return result;
}

// 将 IO 端口一次性绑定到处理器，保持轮询编排可在测试中替换。 / Binds IO ports once so polling orchestration remains replaceable in tests.
export function createMailIngestProcessor(dependencies: MailIngestDependencies) {
  const layer = mailIngestProcessorLayer(dependencies);
  const runMailIngestOnceEffect = (config: MailIngestConfig, scope?: MailIngestRunScope) =>
    Effect.gen(function* runMailIngestOnceProgram() {
      const ports = yield* MailIngestProcessor;
      return yield* Effect.tryPromise({
        catch: (cause) => new MailIngestFailure({ cause }),
        try: () => runMailIngestOnceWithDependencies(config, ports, scope),
      });
    });
  return {
    runMailIngestOnce: (config: MailIngestConfig, scope?: MailIngestRunScope) =>
      Effect.runPromise(
        runMailIngestOnceEffect(config, scope).pipe(
          Effect.provide(layer),
          Effect.catchTag("MailIngestFailure", (failure) => Effect.fail(failure.cause)),
        ),
      ),
    runMailIngestOnceEffect,
  };
}
