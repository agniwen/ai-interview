import { z } from "zod";
import { ResumeUploadRequestConflictError } from "@app/resume-processing/ingest";
import { zValidator } from "@hono/zod-validator";
import { RecruitingJobNotAcceptingCandidatesError } from "@app/recruiting/records";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../../../infrastructure/db/index";
import { chatAttachment } from "@app/db-schema/schema";
import { factory, jsonValidatorError } from "../../../../factory";
import { createInternalErrorResponse } from "../../../../error-handler";
import { requirePermission } from "../../../../middlewares/permission";
import { validateResumeFile } from "@app/resume-processing/ingest/agents/resume-analysis-agent";
import { normalizeResumeFile, storeResumeObjectOnly } from "../../../interview/utils";
import {
  cancelBatch,
  deleteBatch,
  insertBatchWithItems,
  listBatches,
  loadActiveBatches,
  loadBatchDetail,
  reviveOrphans,
  reviveRetriableFailures,
} from "./dao/batches";
import { processNextItem } from "./utils/processor";
import { uploadTaskInboxRouter } from "./routes/inbox/route";
import { createBatchInputSchema } from "./schema";

async function getResumeParseQueueApi() {
  return await import("@app/job-queues/resume-parse");
}

async function removeCancelledQueueJobsBestEffort(
  detail: Awaited<ReturnType<typeof loadBatchDetail>>,
): Promise<void> {
  if (!detail) {
    return;
  }
  const itemIds = detail.items.filter((item) => item.status === "cancelled").map((item) => item.id);
  if (itemIds.length === 0) {
    return;
  }
  try {
    const { isResumeParseQueueConfigured, removeResumeParseJobs } = await getResumeParseQueueApi();
    if (!isResumeParseQueueConfigured()) {
      return;
    }
    const result = await removeResumeParseJobs(itemIds);
    console.info("[bulk-upload] cancel queue cleanup", {
      batchId: detail.batch.id,
      ...result,
    });
  } catch (error) {
    console.error("[bulk-upload] cancel queue cleanup failed:", error);
  }
}

export const resumeUploadBatchesRouter = factory
  .createApp()
  .use("*", async (c, next) => {
    if (c.req.method !== "POST") {
      await next();
      return;
    }
    const incoming = c.req.header("x-request-id");
    const requestId =
      incoming && /^[\w.:-]{1,128}$/.test(incoming) ? incoming : crypto.randomUUID();
    c.header("x-request-id", requestId);
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      console.info("[bulk-upload] request", {
        durationMs: Math.round(performance.now() - startedAt),
        method: c.req.method,
        operation: c.req.path.endsWith("/uploads") ? "upload-file" : "batch-action",
        requestId,
        status: c.res.status,
      });
    }
  })
  .route("/inbox", uploadTaskInboxRouter)
  .post("/uploads", requirePermission("resumeUploadBatch", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const requestId = c.res.headers.get("x-request-id");
    const startedAt = performance.now();
    let stage = "read-multipart";
    let operationId = "";
    const onStage = (nextStage: string) => {
      stage = nextStage;
      console.info("[bulk-upload] stage", {
        elapsedMs: Math.round(performance.now() - startedAt),
        operationId,
        requestId,
        stage,
      });
    };
    onStage(stage);
    const formData = await c.req.formData();
    const operation = z
      .uuid()
      .optional()
      .safeParse(formData.get("requestId") ?? undefined);
    if (!operation.success) {
      return c.json({ error: "上传请求编号无效。" }, 400);
    }
    operationId = operation.data ?? "";
    const file = normalizeResumeFile(formData.get("file"));
    if (!file) {
      return c.json({ error: "未提供文件。" }, 400);
    }
    try {
      validateResumeFile(file);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "文件无效。" }, 400);
    }
    let result: Awaited<ReturnType<typeof storeResumeObjectOnly>>;
    try {
      result = await storeResumeObjectOnly(file, user.id, activeOrg.id, {
        onStage,
        requestId: operation.data,
      });
    } catch (error) {
      if (error instanceof ResumeUploadRequestConflictError) {
        return c.json({ error: error.message }, 409);
      }
      console.error("[bulk-upload] stage failed", {
        elapsedMs: Math.round(performance.now() - startedAt),
        errorType: error instanceof Error ? error.name : "unknown",
        requestId,
        stage,
      });
      // S3 / 注册表写入抛错时给个人类可读的中文反馈，避免 AWS SDK 原始堆栈泄露到前端。
      // Surface a friendly Chinese error instead of leaking the raw AWS SDK trace.
      return c.json(
        createInternalErrorResponse({
          context: { organizationId: activeOrg.id, userId: user.id },
          error,
          operation: "bulk-resume-upload-store",
          publicMessage: "文件上传失败。",
        }),
        500,
      );
    }
    if (!result) {
      return c.json({ error: "文件上传失败，请重试。" }, 500);
    }
    if (!result.storageKey || result.storageKey.length === 0) {
      // 防御性：极少数情况下注册表命中的旧行可能 storageKey 缺失。直接报错，
      // 避免把空字符串塞回客户端导致后续 process-next 失败。
      // Defensive: a legacy registry hit could theoretically have an empty
      // storageKey; reject here rather than poisoning the batch downstream.
      console.error("[bulk-upload] storeInterviewResume returned empty storageKey", result);
      return c.json({ error: "存储路径异常，请重试上传。" }, 500);
    }
    return c.json(
      {
        contentHash: result.contentHash,
        fileSize: file.size,
        originalFileName: file.name,
        storageKey: result.storageKey,
      },
      201,
    );
  })
  .post(
    "/",
    requirePermission("resumeUploadBatch", "create"),
    zValidator("json", createBatchInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      console.info("[bulk-upload] submit batch", {
        fileCount: input.files.length,
        operationId: input.requestId,
        requestId: c.res.headers.get("x-request-id"),
      });
      const { enqueueResumeParseJobs, isResumeParseQueueConfigured } =
        await getResumeParseQueueApi();
      if (!isResumeParseQueueConfigured()) {
        return c.json({ error: "简历解析队列未配置 REDIS_URL。" }, 503);
      }
      if (input.target === "resume_pool" && !input.resumePoolScope) {
        return c.json({ error: "简历池上传必须选择归属范围。" }, 400);
      }
      if (input.jdMode === "bind" && !input.jobDescriptionId) {
        return c.json({ error: "绑定模式必须选择岗位。" }, 400);
      }
      // The transactional creator validates and locks an active job for new batches.
      // A retry of an existing batch must still work after that job changes status.

      // 校验每个 storageKey 都在 chat_attachment 表里（由 /uploads 写入）。
      // Validate every storageKey exists in chat_attachment (written by /uploads).
      const keys = input.files.map((f) => f.storageKey);
      const found = await db
        .select({ storageKey: chatAttachment.storageKey })
        .from(chatAttachment)
        .where(
          and(
            inArray(chatAttachment.storageKey, keys),
            eq(chatAttachment.organizationId, activeOrg.id),
            eq(chatAttachment.userId, user.id),
          ),
        );
      const foundSet = new Set(found.map((r) => r.storageKey));
      const missing = keys.filter((k) => !foundSet.has(k));
      if (missing.length > 0) {
        return c.json({ error: "部分文件未上传完成。" }, 400);
      }

      let batchId: string;
      try {
        batchId = await insertBatchWithItems({
          dedupPolicy: input.dedupPolicy,
          files: input.files,
          jdMode: input.jdMode,
          jobDescriptionId: input.jobDescriptionId ?? null,
          organizationId: activeOrg.id,
          requestId: input.requestId,
          resumePoolScope: input.resumePoolScope ?? null,
          target: input.target,
          userId: user.id,
        });
      } catch (error) {
        if (
          error instanceof RecruitingJobNotAcceptingCandidatesError ||
          error instanceof ResumeUploadRequestConflictError
        ) {
          return c.json({ error: error.message }, 409);
        }
        throw error;
      }
      const detail = await loadBatchDetail(batchId, activeOrg.id, user.id);
      if (!detail) {
        return c.json({ error: "批次创建失败。" }, 500);
      }
      try {
        await enqueueResumeParseJobs(
          detail.items
            .filter((item) => item.status === "pending")
            .map((item) => ({
              batchId,
              itemId: item.id,
              organizationId: activeOrg.id,
              userId: user.id,
            })),
        );
      } catch (error) {
        console.error("[bulk-upload] enqueue failed:", error);
        // Keep a retryable receipt when the client supplied an operation identity.
        // The same request can safely re-enqueue pending items after a queue outage.
        if (!input.requestId) {
          await cancelBatch(batchId, activeOrg.id, user.id);
        }
        return c.json({ error: "简历解析队列入队失败，请稍后重试。" }, 503);
      }
      const enqueuedDetail = await loadBatchDetail(batchId, activeOrg.id, user.id);
      return c.json(enqueuedDetail ?? detail, 201);
    },
  )
  .get("/", requirePermission("resumeUploadBatch", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const rows = await listBatches(activeOrg.id, user.id);
    return c.json(rows, 200);
  })
  .get("/active", requirePermission("resumeUploadBatch", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const details = await loadActiveBatches(activeOrg.id, user.id);
    return c.json(details, 200);
  })
  .get("/:id", requirePermission("resumeUploadBatch", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const detail = await loadBatchDetail(c.req.param("id"), activeOrg.id, user.id);
    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(detail, 200);
  })
  .post("/:id/process-next", requirePermission("resumeUploadBatch", "process"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const result = await processNextItem(c.req.param("id"), activeOrg.id, user.id);
    if (!result) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(result, 200);
  })
  .post("/:id/resume", requirePermission("resumeUploadBatch", "process"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const { enqueueResumeParseJobs, isResumeParseQueueConfigured } = await getResumeParseQueueApi();
    if (!isResumeParseQueueConfigured()) {
      return c.json({ error: "简历解析队列未配置 REDIS_URL。" }, 503);
    }
    await reviveOrphans(id, activeOrg.id, user.id);
    await reviveRetriableFailures(id, activeOrg.id, user.id);
    const detail = await loadBatchDetail(id, activeOrg.id, user.id);
    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    await enqueueResumeParseJobs(
      detail.items
        .filter((item) => item.status === "pending")
        .map((item) => ({
          batchId: id,
          itemId: item.id,
          organizationId: activeOrg.id,
          userId: user.id,
        })),
    );
    return c.json(detail, 200);
  })
  .post("/:id/cancel", requirePermission("resumeUploadBatch", "cancel"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const ok = await cancelBatch(c.req.param("id"), activeOrg.id, user.id);
    if (!ok) {
      return c.json({ error: "无法取消。" }, 400);
    }
    const detail = await loadBatchDetail(c.req.param("id"), activeOrg.id, user.id);
    if (!detail) {
      return c.json({ error: "取消后的批次读取失败。" }, 500);
    }
    await removeCancelledQueueJobsBestEffort(detail);
    return c.json(detail, 200);
  })
  .delete("/:id", requirePermission("resumeUploadBatch", "delete"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const ok = await deleteBatch(c.req.param("id"), activeOrg.id, user.id);
    if (!ok) {
      return c.json({ error: "无法删除。" }, 400);
    }
    return c.json({ success: true }, 200);
  });
