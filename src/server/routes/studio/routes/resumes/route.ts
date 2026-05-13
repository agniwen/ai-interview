import type { ContentfulStatusCode } from "hono/utils/http-status";
import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { getObjectStream } from "@/lib/server/s3";
import { studioInterview } from "@/lib/shared/db/schema";
import { resumeLibraryFormSchema } from "@/lib/shared/studio-resumes";
import { invalidateStudioInterviewCaches } from "@/server/cache-tags";
import { factory, jsonValidatorError } from "@/server/factory";
import { parseResumeFastToProfile } from "@/server/agents/resume-analysis-agent";
import { requirePermission } from "@/server/middlewares/permission";
import {
  loadResumeDetail,
  queryPaginatedResumeRecords,
} from "@/server/routes/studio/routes/resumes/dao/resumes";
import { parseResumePayloadInput } from "@/lib/shared/studio-interviews";
import {
  normalizeResumeFile,
  storeInterviewResume,
  toBadRequest,
} from "@/server/routes/interview/utils";
import { queryInterviewDedup } from "@/server/routes/studio/routes/interviews/dao/studio-interviews";

const dedupCheckInputSchema = z.object({
  email: z.string().trim().max(200).nullable().optional(),
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
});

function toNullableString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseListFormInput(formData: FormData) {
  return resumeLibraryFormSchema.safeParse({
    candidateEmail: toNullableString(formData.get("candidateEmail")) ?? "",
    candidateName: toNullableString(formData.get("candidateName")) ?? "",
    candidatePhone: toNullableString(formData.get("candidatePhone")) ?? "",
    jobDescriptionId: toNullableString(formData.get("jobDescriptionId")) ?? "",
    notes: toNullableString(formData.get("notes")) ?? "",
    targetRole: toNullableString(formData.get("targetRole")) ?? "",
  });
}

export const resumeLibraryRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("resume", "read"),
    zValidator(
      "query",
      z.object({
        page: z.string().optional(),
        pageSize: z.string().optional(),
        search: z.string().optional(),
        sortBy: z.string().optional(),
        sortOrder: z.string().optional(),
      }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedResumeRecords(
        activeOrg.id,
        { search: q.search },
        {
          page: q.page,
          pageSize: q.pageSize,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        },
      );
      return c.json(result, 200);
    },
  )
  .post(
    "/dedup-check",
    requirePermission("resume", "read"),
    zValidator("json", dedupCheckInputSchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const matches = await queryInterviewDedup(activeOrg.id, {
        email: input.email ?? null,
        name: input.name ?? null,
        phone: input.phone ?? null,
      });
      return c.json({ matches }, 200);
    },
  )
  .get("/:id", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadResumeDetail(id, activeOrg.id);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .get("/:id/resume", requirePermission("resume", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadResumeDetail(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    if (!existing.hasResumeFile) {
      return c.json({ error: "该候选人没有可预览的简历 PDF。" }, 404);
    }

    const [row] = await db
      .select({
        resumeFileName: studioInterview.resumeFileName,
        resumeStorageKey: studioInterview.resumeStorageKey,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, id))
      .limit(1);

    if (!row?.resumeStorageKey) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const object = await getObjectStream(row.resumeStorageKey);
    if (!object) {
      return c.json({ error: "简历文件已不可用。" }, 404);
    }

    const filename = row.resumeFileName || "resume.pdf";
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Content-Type": object.contentType ?? "application/pdf",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  })
  // oxlint-disable-next-line complexity -- single create handler orchestrates upload + parse + insert.
  .post("/", requirePermission("resume", "create"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    try {
      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      const parsedResumePayload = parseResumePayloadInput(formData.get("resumePayload"));

      const input = parseListFormInput(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const now = new Date();
      const recordId = crypto.randomUUID();

      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(recordId, resume, c.var.user.id, activeOrg.id)
          : null;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      // 解析复用顺序：客户端预制 payload > 注册表缓存 > 现场兜底解析。
      // 服务端从不补跑题目生成——客户端没传 questions 就落库空数组。
      // Reuse order: client-prebaked payload → registry cache → server fallback.
      // Questions are NEVER generated server-side; if the client did not ship a
      // resumePayload, the row stores an empty interviewQuestions array.
      let resumeProfile =
        parsedResumePayload?.resumeProfile ?? uploadResult?.cachedResumeProfile ?? null;
      let parsedFileName: string | null = parsedResumePayload?.fileName ?? resume?.name ?? null;
      if (resume && !resumeProfile) {
        const parsed = await parseResumeFastToProfile(resume);
        ({ resumeProfile } = parsed);
        parsedFileName = resume.name;
      }

      const row = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || resumeProfile?.name || "未命名候选人",
        candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        id: recordId,
        interviewQuestions: parsedResumePayload?.interviewQuestions ?? [],
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        organizationId: activeOrg.id,
        resumeContentHash,
        resumeFileName: parsedFileName,
        resumeProfile,
        resumeStorageKey,
        status: "draft" as const,
        targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
        updatedAt: now,
      } satisfies typeof studioInterview.$inferInsert;

      await db.insert(studioInterview).values(row);

      invalidateStudioInterviewCaches();
      const detail = await loadResumeDetail(recordId, activeOrg.id);
      return c.json(detail, 201);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  // oxlint-disable-next-line complexity -- single update handler orchestrates upload + parse + whitelist write.
  .patch("/:id", requirePermission("resume", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    try {
      const existing = await loadResumeDetail(id, activeOrg.id);
      if (!existing) {
        return c.json({ error: "记录不存在。" }, 404);
      }

      const formData = await c.req.formData();
      const resume = normalizeResumeFile(formData.get("resume"));
      const input = parseListFormInput(formData);
      if (!input.success) {
        return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }

      if (resume && !c.var.user) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const uploadResult =
        resume && c.var.user
          ? await storeInterviewResume(id, resume, c.var.user.id, activeOrg.id)
          : null;

      let { resumeProfile } = existing;
      let { resumeFileName } = existing;
      const resumeStorageKey = uploadResult?.storageKey ?? null;
      const resumeContentHash = uploadResult?.contentHash ?? null;

      if (resume) {
        const parsed = await parseResumeFastToProfile(resume);
        resumeProfile = uploadResult?.cachedResumeProfile ?? parsed.resumeProfile;
        resumeFileName = resume.name;
      }

      // 显式白名单写入 —— 绝不触碰 interviewQuestions / status / schedule。
      // Explicit whitelist write — never touches interviewQuestions / status / schedule.
      const update = {
        candidateEmail: input.data.candidateEmail || null,
        candidateName: input.data.candidateName || resumeProfile?.name || existing.candidateName,
        candidatePhone: input.data.candidatePhone || resumeProfile?.phone || null,
        jobDescriptionId: input.data.jobDescriptionId || null,
        notes: input.data.notes || null,
        targetRole: input.data.targetRole || resumeProfile?.targetRoles[0] || null,
        updatedAt: new Date(),
        ...(resume
          ? {
              resumeContentHash: resumeContentHash ?? existing.resumeContentHash,
              resumeFileName,
              resumeProfile,
              resumeStorageKey: resumeStorageKey ?? null,
            }
          : {}),
      } satisfies Partial<typeof studioInterview.$inferInsert>;

      await db
        .update(studioInterview)
        .set(update)
        .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)));

      invalidateStudioInterviewCaches();
      const detail = await loadResumeDetail(id, activeOrg.id);
      return c.json(detail, 200);
    } catch (error) {
      const result = toBadRequest(error);
      return c.json({ error: result.error }, { status: result.status as ContentfulStatusCode });
    }
  })
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const result = await db
      .delete(studioInterview)
      .where(and(eq(studioInterview.id, id), eq(studioInterview.organizationId, activeOrg.id)))
      .returning({ id: studioInterview.id });
    if (result.length === 0) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    invalidateStudioInterviewCaches();
    return c.json({ success: true }, 200);
  })
  .post(
    "/bulk-delete",
    requirePermission("resume", "delete"),
    zValidator(
      "json",
      z.object({ ids: z.array(z.string()).nonempty() }),
      jsonValidatorError("缺少待删除的记录 ID。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { ids: rawIds } = c.req.valid("json");
      const ids = rawIds.filter((v): v is string => typeof v === "string" && v.length > 0);
      if (ids.length === 0) {
        return c.json({ error: "缺少待删除的记录 ID。" }, 400);
      }

      const result = await db
        .delete(studioInterview)
        .where(
          and(inArray(studioInterview.id, ids), eq(studioInterview.organizationId, activeOrg.id)),
        )
        .returning({ id: studioInterview.id });

      invalidateStudioInterviewCaches();
      return c.json({ deletedCount: result.length, success: true }, 200);
    },
  );
