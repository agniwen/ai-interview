import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { getObjectBytes, getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { jobDescription } from "@arc/db-schema/schema";
import { and, eq } from "drizzle-orm";
import {
  parseResumeFastToProfile,
  validateResumeFile,
} from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  normalizeResumeFile,
  storeInterviewResume,
  toBadRequest,
} from "@arc/ai-recruitment-copilot-backend/server/routes/interview/utils";
import { jobDescriptionIdsExist } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { createPptxPreviewPdfResponse } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import {
  createResumePoolItem,
  deleteOwnPoolItem,
  importPoolItemToResumeLibrary,
  loadResumePoolItem,
  publishPrivatePoolItem,
  queryResumePoolItems,
} from "./dao";
import {
  resumePoolCreateInputSchema,
  resumePoolImportInputSchema,
  resumePoolListQuerySchema,
} from "./schema";

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseCreateFormData(formData: FormData) {
  return resumePoolCreateInputSchema.safeParse({
    candidateEmail: toNullableString(formData.get("candidateEmail")),
    candidateName: toNullableString(formData.get("candidateName")),
    candidatePhone: toNullableString(formData.get("candidatePhone")),
    jobDescriptionId: toNullableString(formData.get("jobDescriptionId")),
    notes: toNullableString(formData.get("notes")),
    scope: toNullableString(formData.get("scope")) ?? "private",
    targetRole: toNullableString(formData.get("targetRole")),
  });
}

export const resumePoolRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("resume", "read"),
    zValidator("query", resumePoolListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryResumePoolItems({
        organizationId: activeOrg.id,
        scope: q.scope,
        userId: user.id,
      });
      return c.json(result, 200);
    },
  )
  .get("/:id", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const item = await loadResumePoolItem({
      organizationId: activeOrg.id,
      poolItemId: c.req.param("id"),
      userId: user.id,
    });
    if (!item) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(item, 200);
  })
  .get("/:id/resume", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const item = await loadResumePoolItem({
      organizationId: activeOrg.id,
      poolItemId: c.req.param("id"),
      userId: user.id,
    });
    if (!item?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }
    const object = await getObjectStream(item.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }
    const filename = item.resumeFileName || "resume.pdf";
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Content-Type": object.contentType ?? "application/octet-stream",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  })
  .get("/:id/resume-preview.pdf", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const item = await loadResumePoolItem({
      organizationId: activeOrg.id,
      poolItemId: c.req.param("id"),
      userId: user.id,
    });
    if (!item?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }
    const object = await getObjectBytes(item.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }
    return createPptxPreviewPdfResponse({
      bytes: object.bytes,
      cacheKey: item.resumeStorageKey,
      fileName: item.resumeFileName,
      mediaType: object.contentType,
    });
  })
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      await deleteOwnPoolItem({
        organizationId: activeOrg.id,
        poolItemId: c.req.param("id"),
        userId: user.id,
      });
      return c.json({ success: true }, 200);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "删除失败。" }, 404);
    }
  })
  .post("/", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      if (!resume) {
        return c.json({ error: "请上传简历文件。" }, 400);
      }
      validateResumeFile(resume);

      const input = parseCreateFormData(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }
      if (input.data.jobDescriptionId) {
        const ok = await jobDescriptionIdsExist([input.data.jobDescriptionId], activeOrg.id);
        if (!ok) {
          return c.json({ error: "所选在招岗位不存在。" }, 400);
        }
      }

      const uploadResult = await storeInterviewResume(
        crypto.randomUUID(),
        resume,
        user.id,
        activeOrg.id,
      );
      if (!uploadResult?.storageKey) {
        return c.json({ error: "文件上传失败，请重试。" }, 500);
      }
      let resumeProfile = uploadResult.cachedResumeProfile ?? null;
      if (!resumeProfile) {
        const parsed = await parseResumeFastToProfile(resume);
        ({ resumeProfile } = parsed);
      }
      const id = await createResumePoolItem({
        candidateEmail: input.data.candidateEmail ?? null,
        candidateName: input.data.candidateName ?? null,
        candidatePhone: input.data.candidatePhone ?? null,
        contentHash: uploadResult.contentHash,
        createdBy: user.id,
        jobDescriptionId: input.data.jobDescriptionId ?? null,
        notes: input.data.notes ?? null,
        organizationId: activeOrg.id,
        resumeFileName: resume.name,
        resumeProfile,
        scope: input.data.scope,
        storageKey: uploadResult.storageKey,
        targetRole: input.data.targetRole ?? null,
      });
      await enqueueResumeSemanticIndexJobBestEffort({
        organizationId: activeOrg.id,
        sourceId: id,
        sourceType: "resume_pool_item",
      });
      const item = await loadResumePoolItem({
        organizationId: activeOrg.id,
        poolItemId: id,
        userId: user.id,
      });
      return c.json(item, 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .post("/:id/publish", requirePermission("resume", "create"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const item = await publishPrivatePoolItem({
        organizationId: activeOrg.id,
        poolItemId: c.req.param("id"),
        userId: user.id,
      });
      return c.json(item, 201);
    } catch (error) {
      return c.json({ error: error instanceof Error ? error.message : "推送失败。" }, 400);
    }
  })
  .post(
    "/:id/import",
    requirePermission("resume", "create"),
    zValidator("json", resumePoolImportInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      if (input.jobDescriptionId) {
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
          return c.json({ error: "所选在招岗位不存在。" }, 400);
        }
      }
      try {
        const result = await importPoolItemToResumeLibrary({
          dedupPolicy: input.dedupPolicy,
          importedBy: user.id,
          jobDescriptionId: input.jobDescriptionId,
          organizationId: activeOrg.id,
          poolItemId: c.req.param("id"),
        });
        return c.json(result, result.status === "imported" ? 201 : 409);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "入库失败。" }, 400);
      }
    },
  );
