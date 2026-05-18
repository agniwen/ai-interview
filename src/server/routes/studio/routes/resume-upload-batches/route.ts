import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { chatAttachment, jobDescription } from "@/lib/shared/db/schema";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import { validateResumeFile } from "@/server/agents/resume-analysis-agent";
import { normalizeResumeFile, storeInterviewResume } from "@/server/routes/interview/utils";
import {
  cancelBatch,
  deleteBatch,
  insertBatchWithItems,
  listBatches,
  loadActiveBatch,
  loadBatchDetail,
  reviveOrphans,
} from "@/server/routes/studio/routes/resume-upload-batches/dao/batches";
import { processNextItem } from "@/server/routes/studio/routes/resume-upload-batches/utils/processor";
import { createBatchInputSchema } from "./schema";

export const resumeUploadBatchesRouter = factory
  .createApp()
  .post("/uploads", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const formData = await c.req.formData();
    const file = normalizeResumeFile(formData.get("file"));
    if (!file) {
      return c.json({ error: "未提供文件。" }, 400);
    }
    try {
      validateResumeFile(file);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "文件无效。" }, 400);
    }
    const result = await storeInterviewResume("bulk-upload", file, user.id, activeOrg.id);
    if (!result) {
      return c.json({ error: "存储未配置。" }, 500);
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
    requirePermission("resume", "create"),
    zValidator("json", createBatchInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      if (input.jdMode === "bind") {
        if (!input.jobDescriptionId) {
          return c.json({ error: "绑定模式必须选择岗位。" }, 400);
        }
        const [jd] = await db
          .select({ id: jobDescription.id })
          .from(jobDescription)
          .where(
            and(
              eq(jobDescription.id, input.jobDescriptionId),
              eq(jobDescription.organizationId, activeOrg.id),
            ),
          )
          .limit(1);
        if (!jd) {
          return c.json({ error: "选择的岗位不存在。" }, 400);
        }
      }

      // 校验每个 storageKey 都在 chat_attachment 表里（由 /uploads 写入）。
      // Validate every storageKey exists in chat_attachment (written by /uploads).
      const keys = input.files.map((f) => f.storageKey);
      const found = await db
        .select({ storageKey: chatAttachment.storageKey })
        .from(chatAttachment)
        .where(inArray(chatAttachment.storageKey, keys));
      const foundSet = new Set(found.map((r) => r.storageKey));
      const missing = keys.filter((k) => !foundSet.has(k));
      if (missing.length > 0) {
        return c.json({ error: "部分文件未上传完成。" }, 400);
      }

      try {
        const batchId = await insertBatchWithItems({
          dedupPolicy: input.dedupPolicy,
          files: input.files,
          jdMode: input.jdMode,
          jobDescriptionId: input.jobDescriptionId ?? null,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const detail = await loadBatchDetail(batchId, activeOrg.id, user.id);
        return c.json(detail, 201);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "";
        if (msg.includes("resume_upload_batch_active_unique_idx") || msg.includes("unique")) {
          const active = await loadActiveBatch(activeOrg.id, user.id);
          return c.json(
            { activeBatchId: active?.batch.id ?? null, error: "已有进行中的批次" },
            409,
          );
        }
        throw error;
      }
    },
  )
  .get("/", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const rows = await listBatches(activeOrg.id, user.id);
    return c.json(rows, 200);
  })
  .get("/active", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const detail = await loadActiveBatch(activeOrg.id, user.id);
    return c.json(detail, 200);
  })
  .get("/:id", requirePermission("resume", "read"), async (c) => {
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
  .post("/:id/process-next", requirePermission("resume", "create"), async (c) => {
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
  .post("/:id/resume", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    await reviveOrphans(id, activeOrg.id, user.id);
    const detail = await loadBatchDetail(id, activeOrg.id, user.id);
    if (!detail) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(detail, 200);
  })
  .post("/:id/cancel", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const ok = await cancelBatch(c.req.param("id"), activeOrg.id, user.id);
    if (!ok) {
      return c.json({ error: "无法取消。" }, 400);
    }
    const detail = await loadBatchDetail(c.req.param("id"), activeOrg.id, user.id);
    return c.json(detail, 200);
  })
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
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
