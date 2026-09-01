/* oxlint-disable class-methods-use-this, anti-slop/no-unknown-parameters -- Queue package functions are exposed through an instance port and provider errors are normalized immediately. */
import { rawBackendEnvironment } from "../config/raw-backend-environment.js";
import { createDecipheriv, createHash } from "node:crypto";
import {
  jobDescription,
  mailIngestAccount,
  mailIngestMessage,
  resumePoolEvent,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
} from "@arc/db-schema/schema";
import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { Database } from "../infrastructure/database/database.tokens.js";
import type {
  MailIngestProcessorPorts,
  WorkerMailIngestAccount,
} from "../background-workloads/processors/mail-ingest.processor.js";
import type { MailIngestRunScope } from "../background/background.types.js";
import type { BackgroundQueueProducerService } from "../background/background-queue-producer.service.js";
import type { BackgroundObjectStorageService } from "./background-object-storage.service.js";

const ACCOUNT_LEASE_MS = 14 * 60 * 1000;
const MESSAGE_STALE_MS = 30 * 60 * 1000;
const ERROR_MAX = 500;

function truncateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > ERROR_MAX ? message.slice(0, ERROR_MAX) : message;
}

function decryptMailSecret(
  encryptedValue: string,
  secret = rawBackendEnvironment.MAIL_INGEST_SECRET_KEY,
) {
  const value = secret?.trim();
  if (!value) {
    throw new Error("MAIL_INGEST_SECRET_KEY is required when mail ingest is enabled");
  }
  const [version, ivValue, tagValue, payloadValue] = encryptedValue.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !payloadValue) {
    throw new Error("Invalid mail ingest secret payload");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(value).digest(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadValue, "base64url")),
    decipher.final(),
  ]).toString("utf-8");
}

function candidateName(fileName: string): string {
  return (
    fileName
      .trim()
      .replace(/\.[^.]+$/u, "")
      .trim() || "未解析简历"
  );
}

export class MailIngestInfrastructure implements MailIngestProcessorPorts {
  private readonly database: Database;
  private readonly queueProducer: BackgroundQueueProducerService;
  private readonly storage: BackgroundObjectStorageService;

  constructor(
    database: Database,
    storage: BackgroundObjectStorageService,
    queueProducer: BackgroundQueueProducerService,
  ) {
    this.database = database;
    this.storage = storage;
    this.queueProducer = queueProducer;
  }

  buildAttachmentKeyByHash(contentHash: string, extension: string): Promise<string> {
    return this.storage.buildAttachmentKeyByHash(contentHash, extension);
  }

  putObjectBytes(input: { body: Uint8Array; contentType: string; storageKey: string }) {
    return this.storage.putObjectBytes(input);
  }

  async listEnabledAccounts(
    limit: number,
    scope?: MailIngestRunScope,
  ): Promise<WorkerMailIngestAccount[]> {
    const filters = [eq(mailIngestAccount.enabled, true)];
    if (scope) {
      filters.push(eq(mailIngestAccount.organizationId, scope.organizationId));
    }
    const rows = await this.database
      .select()
      .from(mailIngestAccount)
      .where(and(...filters))
      .orderBy(mailIngestAccount.lastCheckedAt)
      .limit(limit);
    return rows.map((row) => ({
      dedupPolicy: row.dedupPolicy,
      id: row.id,
      imapHost: row.imapHost,
      imapPort: row.imapPort,
      imapSecure: row.imapSecure,
      jdMode: row.jdMode,
      jobDescriptionId: row.jobDescriptionId,
      listenStartAt: row.listenStartAt,
      mailbox: row.mailbox,
      organizationId: row.organizationId,
      password: decryptMailSecret(row.encryptedPassword),
      subjectKeyword: row.subjectKeyword,
      target: row.target,
      userId: row.userId,
      username: row.username,
    }));
  }

  async claimAccount(accountId: string): Promise<Date | null> {
    const now = new Date();
    const [claimed] = await this.database
      .update(mailIngestAccount)
      .set({ lastError: null, pollingStartedAt: now, updatedAt: now })
      .where(
        and(
          eq(mailIngestAccount.id, accountId),
          eq(mailIngestAccount.enabled, true),
          or(
            isNull(mailIngestAccount.pollingStartedAt),
            lt(mailIngestAccount.pollingStartedAt, new Date(now.getTime() - ACCOUNT_LEASE_MS)),
          ),
        ),
      )
      .returning({ pollingStartedAt: mailIngestAccount.pollingStartedAt });
    return claimed?.pollingStartedAt ?? null;
  }

  async finishAccount(
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
  ): Promise<void> {
    const now = new Date();
    await this.database
      .update(mailIngestAccount)
      .set(
        "error" in result
          ? {
              lastCheckedAt: now,
              lastError: truncateError(result.error),
              pollingStartedAt: null,
              updatedAt: now,
            }
          : {
              lastCheckedAt: now,
              lastError: null,
              lastRunFailed: result.counts.failed,
              lastRunMatched: result.counts.matched,
              lastRunQueued: result.counts.queued,
              lastRunReceived: result.counts.received,
              lastRunSubjectSkipped: result.counts.subjectSkipped,
              pollingStartedAt: null,
              updatedAt: now,
            },
      )
      .where(
        and(
          eq(mailIngestAccount.id, accountId),
          eq(mailIngestAccount.pollingStartedAt, result.pollingStartedAt),
        ),
      );
  }

  async claimMessage(input: {
    accountId: string;
    fromAddress: string | null;
    mailbox: string;
    messageId: string | null;
    receivedAt: Date | null;
    subject: string | null;
    uid: string;
    uidValidity: string;
  }): Promise<{ id: string; shouldProcess: boolean }> {
    const now = new Date();
    const [created] = await this.database
      .insert(mailIngestMessage)
      .values({
        ...input,
        id: crypto.randomUUID(),
        processedAt: now,
        status: "processing",
      })
      .onConflictDoNothing({
        target: [
          mailIngestMessage.accountId,
          mailIngestMessage.mailbox,
          mailIngestMessage.uidValidity,
          mailIngestMessage.uid,
        ],
      })
      .returning({ id: mailIngestMessage.id });
    if (created) {
      return { id: created.id, shouldProcess: true };
    }
    const [existing] = await this.database
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
      return { id: existing.id, shouldProcess: false };
    }
    const [reclaimed] = await this.database
      .update(mailIngestMessage)
      .set({ batchId: null, errorMessage: null, processedAt: now, status: "processing" })
      .where(
        and(
          eq(mailIngestMessage.id, existing.id),
          eq(mailIngestMessage.status, "processing"),
          or(
            isNull(mailIngestMessage.processedAt),
            lt(mailIngestMessage.processedAt, new Date(now.getTime() - MESSAGE_STALE_MS)),
          ),
        ),
      )
      .returning({ id: mailIngestMessage.id });
    return { id: existing.id, shouldProcess: Boolean(reclaimed) };
  }

  async markMessageSkipped(
    messageId: string,
    reason: "no_supported_attachment",
    counts: { attachmentCount: number; resumeAttachmentCount: number },
  ): Promise<void> {
    await this.database
      .update(mailIngestMessage)
      .set({
        ...counts,
        processedAt: new Date(),
        skipReason: reason,
        status: "skipped",
      })
      .where(eq(mailIngestMessage.id, messageId));
  }

  async updateMessageResult(
    messageId: string,
    result: Parameters<MailIngestProcessorPorts["updateMessageResult"]>[1],
  ): Promise<void> {
    await this.database
      .update(mailIngestMessage)
      .set(
        result.status === "failed"
          ? {
              attachmentCount: result.attachmentCount,
              errorMessage: truncateError(result.error),
              processedAt: new Date(),
              status: result.status,
            }
          : {
              attachmentCount: result.attachmentCount,
              batchId: result.batchId,
              boundJobDescriptionId: result.boundJobDescriptionId,
              errorMessage: null,
              extractedJobCodes: result.extractedJobCodes,
              jdBindStatus: result.jdBindStatus,
              processedAt: new Date(),
              resumeAttachmentCount: result.resumeAttachmentCount,
              status: result.status,
            },
      )
      .where(eq(mailIngestMessage.id, messageId));
  }

  fetchPublishedJobsByCodes(organizationId: string, codes: string[]): Promise<{ id: string }[]> {
    const normalized = [...new Set(codes.map((code) => code.trim().toUpperCase()).filter(Boolean))];
    if (normalized.length === 0) {
      return Promise.resolve([]);
    }
    return this.database
      .select({ id: jobDescription.id })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "published"),
          inArray(jobDescription.code, normalized),
        ),
      );
  }

  async insertBatch(input: Parameters<MailIngestProcessorPorts["insertBatch"]>[0]) {
    const batchId = crypto.randomUUID();
    const now = new Date();
    await this.database.transaction(async (tx) => {
      await tx.insert(resumeUploadBatch).values({
        createdAt: now,
        createdBy: input.userId,
        dedupPolicy: input.dedupPolicy,
        id: batchId,
        jdMode: input.jdMode,
        jobDescriptionId: input.jobDescriptionId,
        jobMatchRequestedAt: input.jobMatchRequestedAt,
        organizationId: input.organizationId,
        resumePoolScope: input.resumePoolScope,
        status: "pending",
        target: input.target,
        totalCount: input.files.length,
        updatedAt: now,
      });
      const rows = input.files.map((file, orderIndex) => ({
        file,
        itemId: crypto.randomUUID(),
        orderIndex,
        poolItemId: crypto.randomUUID(),
      }));
      await tx.insert(resumePoolItem).values(
        rows.map(({ file, poolItemId }) => ({
          candidateEmail: null,
          candidateName: candidateName(file.originalFileName),
          candidatePhone: null,
          createdAt: now,
          createdBy: input.userId,
          id: poolItemId,
          jobDescriptionId: input.jdMode === "bind" ? input.jobDescriptionId : null,
          notes: null,
          organizationId: input.organizationId,
          publishedAt: now,
          publishedBy: input.userId,
          resumeContentHash: file.contentHash,
          resumeFileName: file.originalFileName,
          resumeParseError: null,
          resumeParseStatus: "queued" as const,
          resumeParsedAt: null,
          resumeProfile: null,
          resumeStorageKey: file.storageKey,
          scope: "public" as const,
          skillsNormalized: [],
          sourceChannel: "mail_ingest" as const,
          sourceOrganizationId: input.organizationId,
          sourcePoolItemId: null,
          sourceUserId: input.userId,
          status: "active" as const,
          targetRole: null,
          updatedAt: now,
        })),
      );
      await tx.insert(resumePoolEvent).values(
        rows.map(({ poolItemId }) => ({
          actorId: input.userId,
          createdAt: now,
          id: crypto.randomUUID(),
          organizationId: input.organizationId,
          poolItemId,
          type: "created" as const,
        })),
      );
      if (input.jdMode === "bind" && input.jobDescriptionId) {
        await tx.insert(resumePoolEvent).values(
          rows.map(({ poolItemId }) => ({
            actorId: input.userId,
            createdAt: now,
            id: crypto.randomUUID(),
            organizationId: input.organizationId,
            payload: {
              bindingMode: "automatic",
              fromJobDescriptionId: null,
              source: "batch_fixed_job",
              toJobDescriptionId: input.jobDescriptionId,
            },
            poolItemId,
            type: "bound" as const,
          })),
        );
      }
      await tx.insert(resumeUploadBatchItem).values(
        rows.map(({ file, itemId, orderIndex, poolItemId }) => ({
          batchId,
          contentHash: file.contentHash,
          fileSize: file.fileSize,
          id: itemId,
          orderIndex,
          organizationId: input.organizationId,
          originalFileName: file.originalFileName,
          poolItemId,
          queuedAt: now,
          resumeRecordId: null,
          status: "pending" as const,
          storageKey: file.storageKey,
        })),
      );
    });
    return batchId;
  }

  async loadBatchDetail(batchId: string, organizationId: string, userId: string) {
    const [batch] = await this.database
      .select({ id: resumeUploadBatch.id })
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, batchId),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!batch) {
      return null;
    }
    const items = await this.database
      .select({ id: resumeUploadBatchItem.id })
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId))
      .orderBy(asc(resumeUploadBatchItem.orderIndex));
    return { items };
  }

  enqueueResumeParseJobs(
    jobs: {
      batchId: string;
      itemId: string;
      organizationId: string;
      userId: string;
    }[],
  ): Promise<void> {
    return this.queueProducer.enqueueResumeParseJobs(jobs);
  }
}
