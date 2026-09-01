/* oxlint-disable complexity, max-lines -- The upload batch transaction and inbox projection intentionally remain co-located so the migrated HTTP contract and queue state machine can be audited together. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import type { BackendEnvironmentKey } from "../../../config/backend-environment.schema.js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  chatAttachment,
  jobDescription,
  resumeDuplicateMatch,
  resumePoolEvent,
  resumePoolItem,
  resumeUploadBatch,
  resumeUploadBatchItem,
  studioInterview,
} from "@arc/db-schema/schema";
import { isResumeStructuredSourceFileNameCompatible } from "@arc/db-schema/resume-parser-schema";
import { MAX_RESUME_FILE_SIZE_BYTES } from "@arc/shared/bulk-resume-upload";
import {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
  supportedResumeDocumentLabel,
} from "@arc/shared/resume-documents";
import { sha256HexOfBytes } from "@arc/shared/file-hash";
import {
  getResumeParseQueueJobsByItemIds,
  isResumeParseQueueConfigured,
  removeResumeParseJobs,
} from "@arc/resume-parse-queue/resume-parse";
import { UPLOAD_TASK_INBOX_PAGE_SIZE } from "@arc/shared/upload-task-inbox";
import { and, asc, count, desc, eq, gt, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceDatabasePort } from "../workspace.ports.js";
import type { createResumeUploadBatchSchema } from "./resume-upload-batch.schemas.js";

type CreateInput = z.infer<typeof createResumeUploadBatchSchema>;
export interface UploadedResumeFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

function batchDto(row: typeof resumeUploadBatch.$inferSelect) {
  return {
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    dedupPolicy: row.dedupPolicy,
    failedCount: row.failedCount,
    id: row.id,
    jdMode: row.jdMode,
    jobDescriptionId: row.jobDescriptionId,
    processedCount: row.processedCount,
    resumePoolScope: row.resumePoolScope,
    skippedCount: row.skippedCount,
    status: row.status,
    succeededCount: row.succeededCount,
    target: row.target,
    totalCount: row.totalCount,
    updatedAt: row.updatedAt.toISOString(),
  };
}
function itemDto(row: typeof resumeUploadBatchItem.$inferSelect) {
  return {
    batchId: row.batchId,
    contentHash: row.contentHash,
    dedupMatchSnapshot: row.dedupMatchSnapshot,
    errorMessage: row.errorMessage,
    fileSize: row.fileSize,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    id: row.id,
    orderIndex: row.orderIndex,
    originalFileName: row.originalFileName,
    poolItemId: row.poolItemId,
    resumeRecordId: row.resumeRecordId,
    startedAt: row.startedAt?.toISOString() ?? null,
    status: row.status,
  };
}
function required(name: BackendEnvironmentKey) {
  const value = rawBackendEnvironment[name]?.trim();
  if (!value) {
    throw new Error(`S3 storage is not configured: ${name} is required`);
  }
  return value;
}
function candidateName(fileName: string) {
  return (
    fileName
      .trim()
      .replace(/\.[^.]+$/i, "")
      .trim() || "未解析简历"
  );
}
function isCacheEnabled() {
  return !["1", "true", "yes"].includes(
    rawBackendEnvironment.RESUME_PARSE_DISABLE_CACHE?.trim().toLowerCase() ?? "",
  );
}
function isCacheSourceCompatible(source: string | null | undefined) {
  const aliyun = source === "aliyun-docmining";
  const provider = rawBackendEnvironment.RESUME_PARSE_PROVIDER?.trim() || "ocr-llm";
  return provider === "aliyun-docmining" ? aliyun : !aliyun && source !== "qwen3.5-ocr";
}

const liveQueueStateSchema = z.enum([
  "active",
  "completed",
  "delayed",
  "failed",
  "paused",
  "prioritized",
  "unknown",
  "waiting",
  "waiting-children",
]);
const queueJobDataSchema = z.object({ itemId: z.string() }).passthrough();
const queueProgressSchema = z
  .union([z.number(), z.object({ percentage: z.number() }), z.object({ progress: z.number() })])
  .transform((value) => {
    const direct = z.number().safeParse(value);
    if (direct.success) {
      return direct.data;
    }
    const percentage = z.object({ percentage: z.number() }).safeParse(value);
    if (percentage.success) {
      return percentage.data.percentage;
    }
    const raw = z.object({ progress: z.number() }).parse(value).progress;
    return raw <= 1 ? raw * 100 : raw;
  });

function queueState(status: typeof resumeUploadBatchItem.$inferSelect.status, live?: string) {
  if (status === "failed") {
    return "failed" as const;
  }
  if (status === "cancelled") {
    return "cancelled" as const;
  }
  if (status === "duplicate_skipped") {
    return "duplicate-skipped" as const;
  }
  if (status === "succeeded") {
    return "completed" as const;
  }
  const parsedLive = liveQueueStateSchema.safeParse(live);
  if (parsedLive.success) {
    return parsedLive.data;
  }
  return status === "pending" ? ("waiting" as const) : ("active" as const);
}

function progressPercentage(raw: number) {
  return Number.isFinite(raw) ? Math.min(100, Math.max(0, raw)) : null;
}

function resolvePreviewTarget(row: {
  poolItemId: string | null;
  poolItemStatus: string | null;
  resumeRecordId: string | null;
  target: string;
}) {
  if (row.target === "resume_pool") {
    return row.poolItemId && row.poolItemStatus === "active"
      ? { id: row.poolItemId, resource: "resume-pool" as const }
      : null;
  }
  return row.resumeRecordId ? { id: row.resumeRecordId, resource: "resumes" as const } : null;
}

@Injectable()
export class ResumeUploadBatchService {
  private storage?: { bucket: string; client: S3Client; prefix: string };
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}

  private storageConfig() {
    this.storage ??= {
      bucket: required("S3_BUCKET_NAME"),
      client: new S3Client({
        credentials: {
          accessKeyId: required("S3_ACCESS_KEY_ID"),
          secretAccessKey: required("S3_SECRET_ACCESS_KEY"),
        },
        endpoint: new URL(required("S3_ENDPOINT")).origin,
        forcePathStyle: rawBackendEnvironment.S3_FORCE_PATH_STYLE === "true",
        region: required("S3_REGION"),
        requestChecksumCalculation: "WHEN_REQUIRED",
        responseChecksumValidation: "WHEN_REQUIRED",
      }),
      prefix: rawBackendEnvironment.S3_KEY_PREFIX?.trim().replace(/\/+$/, "") ?? "",
    };
    return this.storage;
  }

  async upload(organizationId: string, userId: string, file?: UploadedResumeFile) {
    if (!file?.buffer?.length) {
      throw new BadRequestException("未提供文件。");
    }
    if (
      !isSupportedResumeDocumentInput({ fileName: file.originalname, mediaType: file.mimetype })
    ) {
      throw new BadRequestException(`仅支持上传 ${supportedResumeDocumentLabel} 简历。`);
    }
    if (file.size > MAX_RESUME_FILE_SIZE_BYTES) {
      throw new BadRequestException("简历文件不能超过 20 MB。");
    }
    try {
      const bytes = new Uint8Array(file.buffer);
      const contentHash = await sha256HexOfBytes(bytes);
      const extension = getResumeDocumentExtension({
        fileName: file.originalname,
        mediaType: file.mimetype,
      });
      const storage = this.storageConfig();
      const storageKey = `${storage.prefix ? `${storage.prefix}/` : ""}chat-attachments/${contentHash}.${extension.replaceAll(/[^a-z0-9]/gi, "").toLowerCase() || "bin"}`;
      const cached = isCacheEnabled()
        ? await this.database
            .select()
            .from(chatAttachment)
            .where(eq(chatAttachment.contentHash, contentHash))
            .orderBy(desc(chatAttachment.createdAt))
            .limit(1)
        : [];
      await storage.client.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: storage.bucket,
          ContentLength: bytes.byteLength,
          ContentType: file.mimetype || cached[0]?.mediaType || "application/octet-stream",
          Key: storageKey,
        }),
      );
      const previous =
        cached[0] && isCacheSourceCompatible(cached[0].parsedTextSource) ? cached[0] : undefined;
      const compatibleStructured =
        previous?.parsedStructured &&
        isResumeStructuredSourceFileNameCompatible(previous.parsedStructured, file.originalname)
          ? previous.parsedStructured
          : undefined;
      await this.database.insert(chatAttachment).values({
        contentHash,
        filename: file.originalname.slice(0, 255) || previous?.filename || "resume.pdf",
        id: crypto.randomUUID(),
        mediaType: file.mimetype || previous?.mediaType || "application/octet-stream",
        organizationId,
        parsedAt: previous?.parsedAt,
        parsedError: previous?.parsedError,
        parsedPageCount: previous?.parsedPageCount,
        parsedStatus: previous?.parsedStatus ?? "pending",
        parsedStructured: compatibleStructured,
        parsedText: previous?.parsedText,
        parsedTextSource: previous?.parsedTextSource,
        size: file.size,
        storageKey,
        userId,
      });
      return { contentHash, fileSize: file.size, originalFileName: file.originalname, storageKey };
    } catch (error) {
      console.error("[bulk-upload] file store failed", { error, organizationId, userId });
      throw new InternalServerErrorException("文件上传失败。");
    }
  }

  private async reconcile(batchId: string) {
    const [batch] = await this.database
      .select()
      .from(resumeUploadBatch)
      .where(eq(resumeUploadBatch.id, batchId))
      .limit(1);
    if (!batch) {
      return;
    }
    const rows = await this.database
      .select({ count: count(), status: resumeUploadBatchItem.status })
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, batchId))
      .groupBy(resumeUploadBatchItem.status);
    const byStatus = new Map(rows.map((row) => [row.status, row.count]));
    const succeededCount = byStatus.get("succeeded") ?? 0;
    const failedCount = byStatus.get("failed") ?? 0;
    const skippedCount = byStatus.get("duplicate_skipped") ?? 0;
    const processedCount = succeededCount + failedCount + skippedCount;
    const complete =
      !["completed", "cancelled"].includes(batch.status) && processedCount === batch.totalCount;
    await this.database
      .update(resumeUploadBatch)
      .set({
        completedAt: complete ? new Date() : batch.completedAt,
        failedCount,
        processedCount,
        skippedCount,
        status: complete ? "completed" : batch.status,
        succeededCount,
        updatedAt: new Date(),
      })
      .where(eq(resumeUploadBatch.id, batchId));
  }

  private async detail(organizationId: string, userId: string, id: string) {
    await this.reconcile(id);
    const rows = await this.database
      .select()
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, id),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      return null;
    }
    const items = await this.database
      .select()
      .from(resumeUploadBatchItem)
      .where(eq(resumeUploadBatchItem.batchId, id))
      .orderBy(asc(resumeUploadBatchItem.orderIndex));
    return { batch: batchDto(rows[0]), items: items.map(itemDto) };
  }

  async create(organizationId: string, userId: string, input: CreateInput) {
    if (!isResumeParseQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。");
    }
    if (input.target === "resume_pool" && !input.resumePoolScope) {
      throw new BadRequestException("简历池上传必须选择归属范围。");
    }
    if (input.jdMode === "bind") {
      if (!input.jobDescriptionId) {
        throw new BadRequestException("绑定模式必须选择岗位。");
      }
      const rows = await this.database
        .select({ id: jobDescription.id })
        .from(jobDescription)
        .where(
          and(
            eq(jobDescription.id, input.jobDescriptionId),
            eq(jobDescription.organizationId, organizationId),
            eq(jobDescription.lifecycleStatus, "published"),
          ),
        )
        .limit(1);
      if (!rows[0]) {
        throw new BadRequestException("选择的岗位不存在。");
      }
    }
    const keys = input.files.map((file) => file.storageKey);
    const attachments = await this.database
      .select({ key: chatAttachment.storageKey })
      .from(chatAttachment)
      .where(
        and(
          inArray(chatAttachment.storageKey, keys),
          eq(chatAttachment.organizationId, organizationId),
          eq(chatAttachment.userId, userId),
        ),
      );
    const found = new Set(attachments.map((row) => row.key));
    if (keys.some((key) => !found.has(key))) {
      throw new BadRequestException("部分文件未上传完成。");
    }
    const batchId = crypto.randomUUID();
    const now = new Date();
    const scope = input.resumePoolScope ?? "private";
    const rows = input.files.map((file, orderIndex) => ({
      file,
      itemId: crypto.randomUUID(),
      orderIndex,
      poolItemId: input.target === "resume_pool" ? crypto.randomUUID() : null,
      recordId: input.target === "resume_library" ? crypto.randomUUID() : null,
    }));
    await this.database.transaction(async (tx) => {
      await tx.insert(resumeUploadBatch).values({
        createdAt: now,
        createdBy: userId,
        dedupPolicy: input.dedupPolicy,
        id: batchId,
        jdMode: input.jdMode,
        jobDescriptionId: input.jobDescriptionId ?? null,
        organizationId,
        resumePoolScope: input.target === "resume_pool" ? scope : null,
        status: "pending",
        target: input.target,
        totalCount: rows.length,
        updatedAt: now,
      });
      const records = rows.filter((row): row is typeof row & { recordId: string } =>
        Boolean(row.recordId),
      );
      if (records.length) {
        await tx.insert(studioInterview).values(
          records.map(({ file, recordId }) => ({
            candidateEmail: null,
            candidateName: candidateName(file.originalFileName),
            candidatePhone: null,
            createdAt: now,
            createdBy: userId,
            id: recordId,
            interviewQuestions: [],
            jobDescriptionId: input.jdMode === "bind" ? input.jobDescriptionId : null,
            notes: null,
            organizationId,
            resumeContentHash: file.contentHash,
            resumeFileName: file.originalFileName,
            resumeParseError: null,
            resumeParseStatus: "queued" as const,
            resumeParsedAt: null,
            resumeProfile: null,
            resumeStorageKey: file.storageKey,
            status: "draft" as const,
            targetRole: null,
            updatedAt: now,
          })),
        );
      }
      const pool = rows.filter((row): row is typeof row & { poolItemId: string } =>
        Boolean(row.poolItemId),
      );
      if (pool.length) {
        await tx.insert(resumePoolItem).values(
          pool.map(({ file, poolItemId }) => ({
            candidateEmail: null,
            candidateName: candidateName(file.originalFileName),
            candidatePhone: null,
            createdAt: now,
            createdBy: userId,
            id: poolItemId,
            jobDescriptionId: input.jdMode === "bind" ? input.jobDescriptionId : null,
            notes: null,
            organizationId,
            publishedAt: scope === "public" ? now : null,
            publishedBy: scope === "public" ? userId : null,
            resumeContentHash: file.contentHash,
            resumeFileName: file.originalFileName,
            resumeParseError: null,
            resumeParseStatus: "queued" as const,
            resumeParsedAt: null,
            resumeProfile: null,
            resumeStorageKey: file.storageKey,
            scope,
            skillsNormalized: [],
            sourceOrganizationId: scope === "public" ? organizationId : null,
            sourcePoolItemId: null,
            sourceUserId: scope === "public" ? userId : null,
            status: "active" as const,
            targetRole: null,
            updatedAt: now,
          })),
        );
        await tx.insert(resumePoolEvent).values(
          pool.map(({ poolItemId }) => ({
            actorId: userId,
            createdAt: now,
            id: crypto.randomUUID(),
            organizationId,
            poolItemId,
            type: "created" as const,
          })),
        );
        if (input.jdMode === "bind" && input.jobDescriptionId) {
          await tx.insert(resumePoolEvent).values(
            pool.map(({ poolItemId }) => ({
              actorId: userId,
              createdAt: now,
              id: crypto.randomUUID(),
              organizationId,
              payload: {
                bindingMode: "manual",
                fromJobDescriptionId: null,
                source: "batch_fixed_job",
                toJobDescriptionId: input.jobDescriptionId,
              },
              poolItemId,
              type: "bound" as const,
            })),
          );
        }
      }
      await tx.insert(resumeUploadBatchItem).values(
        rows.map(({ file, itemId, orderIndex, poolItemId, recordId }) => ({
          batchId,
          contentHash: file.contentHash,
          fileSize: file.fileSize,
          id: itemId,
          orderIndex,
          organizationId,
          originalFileName: file.originalFileName,
          poolItemId,
          queuedAt: now,
          resumeRecordId: recordId,
          status: "pending" as const,
          storageKey: file.storageKey,
        })),
      );
    });
    const detail = await this.detail(organizationId, userId, batchId);
    if (!detail) {
      throw new InternalServerErrorException("批次创建失败。");
    }
    try {
      await this.queueProducer.enqueueResumeParseJobs(
        detail.items.map((item) => ({ batchId, itemId: item.id, organizationId, userId })),
      );
    } catch (error) {
      console.error("[bulk-upload] enqueue failed", error);
      await this.cancel(organizationId, userId, batchId);
      throw new ServiceUnavailableException("简历解析队列入队失败，请稍后重试。");
    }
    return (await this.detail(organizationId, userId, batchId)) ?? detail;
  }

  async list(organizationId: string, userId: string) {
    const rows = await this.database
      .select()
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
        ),
      )
      .orderBy(desc(resumeUploadBatch.createdAt))
      .limit(20);
    return rows.map(batchDto);
  }

  async processNext(organizationId: string, userId: string, id: string) {
    if (!isResumeParseQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。");
    }
    const detail = await this.detail(organizationId, userId, id);
    if (!detail) {
      throw new NotFoundException("记录不存在。");
    }
    if (["completed", "cancelled"].includes(detail.batch.status)) {
      return { batch: detail.batch, done: true, item: null };
    }
    const item = detail.items.find((candidate) => candidate.status === "pending");
    if (!item) {
      const done = detail.batch.processedCount === detail.batch.totalCount;
      if (done) {
        await this.database
          .update(resumeUploadBatch)
          .set({ completedAt: new Date(), status: "completed", updatedAt: new Date() })
          .where(eq(resumeUploadBatch.id, id));
      }
      const fresh = await this.detail(organizationId, userId, id);
      return { batch: fresh?.batch ?? detail.batch, done, item: null };
    }
    const now = new Date();
    await this.database
      .update(resumeUploadBatchItem)
      .set({ queuedAt: now })
      .where(
        and(
          eq(resumeUploadBatchItem.id, item.id),
          eq(resumeUploadBatchItem.batchId, id),
          eq(resumeUploadBatchItem.status, "pending"),
        ),
      );
    await this.database
      .update(resumeUploadBatch)
      .set({ status: "running", updatedAt: now })
      .where(eq(resumeUploadBatch.id, id));
    try {
      await this.queueProducer.enqueueResumeParseJobs([
        { batchId: id, itemId: item.id, organizationId, userId },
      ]);
    } catch (error) {
      throw new ServiceUnavailableException("简历解析队列入队失败，请稍后重试。", {
        cause: error,
      });
    }
    const fresh = await this.detail(organizationId, userId, id);
    return {
      batch: fresh?.batch ?? detail.batch,
      done: false,
      item: fresh?.items.find((candidate) => candidate.id === item.id) ?? item,
    };
  }

  async inbox(organizationId: string, userId: string, encodedCursor: string | null) {
    let cursor: {
      batchCreatedAt: Date;
      batchId: string;
      itemId: string;
      orderIndex: number;
    } | null = null;
    if (encodedCursor) {
      const [dateValue, batchId, orderValue, itemId, ...rest] = encodedCursor.split("~");
      const batchCreatedAt = new Date(dateValue ?? "");
      const orderIndex = Number(orderValue);
      if (
        rest.length ||
        !batchId ||
        !itemId ||
        Number.isNaN(batchCreatedAt.getTime()) ||
        !Number.isInteger(orderIndex) ||
        orderIndex < 0
      ) {
        throw new BadRequestException("分页游标无效");
      }
      cursor = { batchCreatedAt, batchId, itemId, orderIndex };
    }
    const base = and(
      eq(resumeUploadBatch.organizationId, organizationId),
      eq(resumeUploadBatch.createdBy, userId),
    );
    const cursorFilter = cursor
      ? or(
          lt(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
          and(
            eq(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
            lt(resumeUploadBatch.id, cursor.batchId),
          ),
          and(
            eq(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
            eq(resumeUploadBatch.id, cursor.batchId),
            gt(resumeUploadBatchItem.orderIndex, cursor.orderIndex),
          ),
          and(
            eq(resumeUploadBatch.createdAt, cursor.batchCreatedAt),
            eq(resumeUploadBatch.id, cursor.batchId),
            eq(resumeUploadBatchItem.orderIndex, cursor.orderIndex),
            gt(resumeUploadBatchItem.id, cursor.itemId),
          ),
        )
      : undefined;
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          attemptCount: resumeUploadBatchItem.attemptCount,
          batchCreatedAt: resumeUploadBatch.createdAt,
          batchId: resumeUploadBatchItem.batchId,
          errorMessage: resumeUploadBatchItem.errorMessage,
          fileSize: resumeUploadBatchItem.fileSize,
          finishedAt: resumeUploadBatchItem.finishedAt,
          id: resumeUploadBatchItem.id,
          orderIndex: resumeUploadBatchItem.orderIndex,
          originalFileName: resumeUploadBatchItem.originalFileName,
          poolCandidateName: resumePoolItem.candidateName,
          poolItemId: resumeUploadBatchItem.poolItemId,
          poolItemStatus: resumePoolItem.status,
          poolTargetRole: resumePoolItem.targetRole,
          queuedAt: resumeUploadBatchItem.queuedAt,
          resumeRecordId: resumeUploadBatchItem.resumeRecordId,
          startedAt: resumeUploadBatchItem.startedAt,
          status: resumeUploadBatchItem.status,
          studioCandidateName: studioInterview.candidateName,
          studioTargetRole: studioInterview.targetRole,
          target: resumeUploadBatch.target,
        })
        .from(resumeUploadBatchItem)
        .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
        .leftJoin(
          studioInterview,
          and(
            eq(studioInterview.id, resumeUploadBatchItem.resumeRecordId),
            eq(studioInterview.organizationId, resumeUploadBatch.organizationId),
          ),
        )
        .leftJoin(
          resumePoolItem,
          and(
            eq(resumePoolItem.id, resumeUploadBatchItem.poolItemId),
            eq(resumePoolItem.organizationId, resumeUploadBatch.organizationId),
          ),
        )
        .where(and(base, cursorFilter))
        .orderBy(
          desc(resumeUploadBatch.createdAt),
          desc(resumeUploadBatch.id),
          asc(resumeUploadBatchItem.orderIndex),
          asc(resumeUploadBatchItem.id),
        )
        .limit(UPLOAD_TASK_INBOX_PAGE_SIZE + 1),
      this.database
        .select({ total: count() })
        .from(resumeUploadBatchItem)
        .innerJoin(resumeUploadBatch, eq(resumeUploadBatch.id, resumeUploadBatchItem.batchId))
        .where(base),
    ]);
    const page = rows.slice(0, UPLOAD_TASK_INBOX_PAGE_SIZE);
    let queueJobs: Awaited<ReturnType<typeof getResumeParseQueueJobsByItemIds>> = [];
    try {
      queueJobs = await getResumeParseQueueJobsByItemIds(page.map((row) => row.id));
    } catch (error) {
      console.warn("[upload-task-inbox] failed to load queue state", {
        error,
        organizationId,
        userId,
      });
    }
    const jobs = new Map(
      queueJobs.flatMap((job) => {
        const parsed = queueJobDataSchema.safeParse(job.data);
        return parsed.success ? [[parsed.data.itemId, job] as const] : [];
      }),
    );
    const last = page.at(-1);
    const nextCursor =
      rows.length > UPLOAD_TASK_INBOX_PAGE_SIZE && last
        ? [last.batchCreatedAt.toISOString(), last.batchId, String(last.orderIndex), last.id].join(
            "~",
          )
        : null;
    return {
      nextCursor,
      records: page.map((row) => {
        const job = jobs.get(row.id);
        const parsedProgress = queueProgressSchema.safeParse(job?.progress);
        const previewTarget = resolvePreviewTarget(row);
        return {
          attemptCount: row.attemptCount,
          batchId: row.batchId,
          candidateName: row.studioCandidateName ?? row.poolCandidateName,
          errorMessage: row.errorMessage ?? job?.failedReason ?? null,
          fileSize: row.fileSize,
          finishedAt: row.finishedAt?.toISOString() ?? null,
          id: row.id,
          originalFileName: row.originalFileName,
          previewTarget,
          progressPercent: parsedProgress.success ? progressPercentage(parsedProgress.data) : null,
          queueState: queueState(row.status, job?.state),
          queuedAt: row.queuedAt?.toISOString() ?? null,
          startedAt: row.startedAt?.toISOString() ?? null,
          status: row.status,
          target: row.target,
          targetRole: row.studioTargetRole ?? row.poolTargetRole,
        };
      }),
      total: totals[0]?.total ?? 0,
    };
  }
  async active(organizationId: string, userId: string) {
    const rows = await this.database
      .select({ id: resumeUploadBatch.id })
      .from(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
          inArray(resumeUploadBatch.status, ["pending", "running"]),
        ),
      )
      .orderBy(desc(resumeUploadBatch.createdAt));
    const details = await Promise.all(
      rows.map((row) => this.detail(organizationId, userId, row.id)),
    );
    return details.filter((value) => value && ["pending", "running"].includes(value.batch.status));
  }
  async get(organizationId: string, userId: string, id: string) {
    const detail = await this.detail(organizationId, userId, id);
    if (!detail) {
      throw new NotFoundException("记录不存在。");
    }
    return detail;
  }

  async resume(organizationId: string, userId: string, id: string) {
    if (!isResumeParseQueueConfigured(rawBackendEnvironment)) {
      throw new ServiceUnavailableException("简历解析队列未配置 REDIS_URL。");
    }
    const threshold = Number.parseInt(
      rawBackendEnvironment.RESUME_PARSE_STALE_PROCESSING_SECONDS || "900",
      10,
    );
    const stale = Number.isFinite(threshold) && threshold > 0 ? threshold : 900;
    await this.database.transaction(async (tx) => {
      const batch = await tx
        .select({ id: resumeUploadBatch.id })
        .from(resumeUploadBatch)
        .where(
          and(
            eq(resumeUploadBatch.id, id),
            eq(resumeUploadBatch.organizationId, organizationId),
            eq(resumeUploadBatch.createdBy, userId),
          ),
        )
        .limit(1);
      if (!batch[0]) {
        return;
      }
      const staleRows = await tx
        .select({
          poolId: resumeUploadBatchItem.poolItemId,
          recordId: resumeUploadBatchItem.resumeRecordId,
        })
        .from(resumeUploadBatchItem)
        .where(
          and(
            eq(resumeUploadBatchItem.batchId, id),
            eq(resumeUploadBatchItem.status, "processing"),
            lt(
              resumeUploadBatchItem.startedAt,
              sql`now() - interval '${sql.raw(String(stale))} seconds'`,
            ),
          ),
        );
      const recordIds = staleRows.flatMap((row) => (row.recordId ? [row.recordId] : []));
      const poolIds = staleRows.flatMap((row) => (row.poolId ? [row.poolId] : []));
      if (recordIds.length) {
        await tx
          .update(studioInterview)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: new Date() })
          .where(inArray(studioInterview.id, recordIds));
      }
      if (poolIds.length) {
        await tx
          .update(resumePoolItem)
          .set({ resumeParseError: null, resumeParseStatus: "queued", updatedAt: new Date() })
          .where(inArray(resumePoolItem.id, poolIds));
      }
      await tx
        .update(resumeUploadBatchItem)
        .set({ startedAt: null, status: "pending" })
        .where(
          and(
            eq(resumeUploadBatchItem.batchId, id),
            eq(resumeUploadBatchItem.status, "processing"),
            lt(
              resumeUploadBatchItem.startedAt,
              sql`now() - interval '${sql.raw(String(stale))} seconds'`,
            ),
          ),
        );
      await tx
        .update(resumeUploadBatchItem)
        .set({ errorMessage: null, finishedAt: null, startedAt: null, status: "pending" })
        .where(
          and(
            eq(resumeUploadBatchItem.batchId, id),
            eq(resumeUploadBatchItem.status, "failed"),
            eq(resumeUploadBatchItem.errorMessage, "简历文件不可用（S3 对象缺失）。"),
          ),
        );
      await tx
        .update(resumeUploadBatch)
        .set({ status: "pending", updatedAt: new Date() })
        .where(eq(resumeUploadBatch.id, id));
    });
    const detail = await this.get(organizationId, userId, id);
    const pending = detail.items.filter((item) => item.status === "pending");
    await this.queueProducer.enqueueResumeParseJobs(
      pending.map((item) => ({ batchId: id, itemId: item.id, organizationId, userId })),
    );
    return detail;
  }

  async cancel(organizationId: string, userId: string, id: string) {
    let cancelled = false;
    const now = new Date();
    let recordIds: string[] = [];
    let poolIds: string[] = [];
    await this.database.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(resumeUploadBatch)
        .where(
          and(
            eq(resumeUploadBatch.id, id),
            eq(resumeUploadBatch.organizationId, organizationId),
            eq(resumeUploadBatch.createdBy, userId),
          ),
        )
        .limit(1);
      if (!rows[0] || ["completed", "cancelled"].includes(rows[0].status)) {
        return;
      }
      const items = await tx
        .select({
          poolId: resumeUploadBatchItem.poolItemId,
          recordId: resumeUploadBatchItem.resumeRecordId,
        })
        .from(resumeUploadBatchItem)
        .where(
          and(
            eq(resumeUploadBatchItem.batchId, id),
            inArray(resumeUploadBatchItem.status, ["pending", "processing"]),
          ),
        );
      recordIds = items.flatMap((item) => (item.recordId ? [item.recordId] : []));
      poolIds = items.flatMap((item) => (item.poolId ? [item.poolId] : []));
      if (recordIds.length) {
        await tx.delete(studioInterview).where(inArray(studioInterview.id, recordIds));
      }
      if (poolIds.length) {
        await tx
          .update(resumePoolItem)
          .set({ status: "archived", updatedAt: now })
          .where(inArray(resumePoolItem.id, poolIds));
      }
      await tx
        .update(resumeUploadBatchItem)
        .set({ finishedAt: now, resumeRecordId: null, status: "cancelled" })
        .where(
          and(
            eq(resumeUploadBatchItem.batchId, id),
            inArray(resumeUploadBatchItem.status, ["pending", "processing"]),
          ),
        );
      await tx
        .update(resumeUploadBatch)
        .set({ completedAt: now, status: "cancelled", updatedAt: now })
        .where(eq(resumeUploadBatch.id, id));
      cancelled = true;
    });
    if (!cancelled) {
      throw new BadRequestException("无法取消。");
    }
    for (const [sourceType, ids] of [
      ["studio_interview", recordIds],
      ["resume_pool_item", poolIds],
    ] as const) {
      for (const sourceId of ids) {
        await this.database
          .delete(resumeDuplicateMatch)
          .where(
            and(
              eq(resumeDuplicateMatch.organizationId, organizationId),
              or(
                and(
                  eq(resumeDuplicateMatch.sourceType, sourceType),
                  eq(resumeDuplicateMatch.sourceId, sourceId),
                ),
                and(
                  eq(resumeDuplicateMatch.matchedSourceType, sourceType),
                  eq(resumeDuplicateMatch.matchedSourceId, sourceId),
                ),
              ),
            ),
          );
      }
    }
    const detail = await this.get(organizationId, userId, id);
    try {
      await removeResumeParseJobs(
        detail.items.filter((item) => item.status === "cancelled").map((item) => item.id),
      );
    } catch (error) {
      console.warn("[bulk-upload] queue cleanup failed", error);
    }
    return detail;
  }

  async remove(organizationId: string, userId: string, id: string) {
    const rows = await this.database
      .delete(resumeUploadBatch)
      .where(
        and(
          eq(resumeUploadBatch.id, id),
          eq(resumeUploadBatch.organizationId, organizationId),
          eq(resumeUploadBatch.createdBy, userId),
          inArray(resumeUploadBatch.status, ["completed", "cancelled"]),
        ),
      )
      .returning({ id: resumeUploadBatch.id });
    if (!rows.length) {
      throw new BadRequestException("无法删除。");
    }
    return { success: true } as const;
  }
}
