import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
} from "@arc/db-schema/schema";
import { interviewQuestionTemplateSchema } from "@arc/db-schema/interview-question-templates";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { createInternalErrorResponse } from "@arc/ai-recruitment-copilot-backend/server/error-handler";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  listAllInterviewQuestionTemplates,
  loadInterviewQuestionTemplateById,
  queryPaginatedInterviewQuestionTemplates,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/queries";
import { loadInterviewQuestionTemplateVersionById } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/versions";
import { managedJobDescriptionIdsExist } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import {
  cacheTags,
  invalidateStudioInterviewCaches,
  safeUpdateTag,
} from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import {
  resolveAiGenerateContext,
  resolveInterviewRecordIds,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/utils/resolve-ai-generate-context";
import { generateInterviewQuestionTemplateFromPrompt } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/utils/ai-interview-questions-generate";
import { refreshEligibleCandidatesForInterviewQuestionTemplate } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/refresh-eligible";

const generateTemplateQuestionsBodySchema = z.object({
  interviewRecordId: z.string().trim().min(1).optional(),
  interviewRecordIds: z.array(z.string().trim().min(1)).max(10).optional(),
  jobDescriptionId: z.string().trim().min(1).optional(),
  jobDescriptionIds: z.array(z.string().trim().min(1)).max(50).optional(),
  prompt: z.string().trim().min(1, "请填写 AI 填写指令").max(2000),
  templateDescription: z.string().trim().max(1000).optional(),
  templateTitle: z.string().trim().max(120).optional(),
});

function normalizeQuestions(
  questions: {
    id?: string;
    content: string;
    difficulty: "easy" | "medium" | "hard";
    evaluationFocus?: string | null;
    followUpDirections?: string | null;
    sortOrder: number;
  }[],
  templateId: string,
  now: Date,
) {
  return questions.map((question) => ({
    content: question.content.trim(),
    createdAt: now,
    difficulty: question.difficulty,
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
    id: question.id?.trim() || crypto.randomUUID(),
    sortOrder: question.sortOrder,
    templateId,
    updatedAt: now,
  }));
}

const interviewQuestionListQuerySchema = z.object({
  // 三态：active=仅未归档（默认）/ archived=仅已归档 / all=全部；其他取值降级为 active。
  // Tri-state: active=active only (default) / archived=archived only / all=both.
  archived: z.string().optional(),
  jobDescriptionId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  scope: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

function parseArchivedFilter(value: string | undefined): "active" | "archived" | "all" {
  if (value === "archived" || value === "all") {
    return value;
  }
  return "active";
}

export const interviewQuestionTemplatesRouter = factory
  .createApp()
  .post(
    "/ai-generate-questions",
    requirePermission("questionTemplate", "update"),
    zValidator("json", generateTemplateQuestionsBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const body = c.req.valid("json");
      const { jobDescriptionId, jobDescriptionIds, prompt } = body;
      const interviewRecordIds = resolveInterviewRecordIds(body);
      const templateTitle = body.templateTitle?.trim() || "未命名面试题";
      const templateDescription = body.templateDescription?.trim() || null;

      const resolved = await resolveAiGenerateContext(activeOrg.id, {
        interviewRecordIds,
        jobDescriptionId,
        jobDescriptionIds,
      });
      if ("error" in resolved) {
        return c.json({ error: resolved.error }, 400);
      }

      try {
        const questions = await generateInterviewQuestionTemplateFromPrompt({
          candidates: resolved.candidates,
          hrPrompt: prompt,
          jobDescription: resolved.jobDescription,
          templateDescription,
          templateTitle,
        });
        return c.json({ questions }, 200);
      } catch (error) {
        return c.json(
          createInternalErrorResponse({
            context: { organizationId: activeOrg.id },
            error,
            operation: "interview-question-template-ai-generate",
            publicMessage: "AI 生成失败。",
          }),
          500,
        );
      }
    },
  )
  .get(
    "/",
    requirePermission("questionTemplate", "read"),
    zValidator("query", interviewQuestionListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedInterviewQuestionTemplates(
        activeOrg.id,
        {
          archivedFilter: parseArchivedFilter(q.archived),
          jobDescriptionId: q.jobDescriptionId,
          scope: q.scope,
          search: q.search,
        },
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
  .get("/all", requirePermission("questionTemplate", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listAllInterviewQuestionTemplates(activeOrg.id);
    return c.json({ records }, 200);
  })
  .post(
    "/",
    requirePermission("questionTemplate", "create"),
    zValidator("json", interviewQuestionTemplateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const jobDescriptionIds = input.scope === "job_description" ? input.jobDescriptionIds : [];
      if (jobDescriptionIds.length > 0) {
        const ok = await managedJobDescriptionIdsExist(jobDescriptionIds, activeOrg.id);
        if (!ok) {
          return c.json({ error: "所选在招岗位中存在无效项。" }, 400);
        }
      }

      const now = new Date();
      const templateId = crypto.randomUUID();
      const record = {
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        description: input.description?.trim() || null,
        id: templateId,
        organizationId: activeOrg.id,
        scope: input.scope,
        title: input.title.trim(),
        updatedAt: now,
      } satisfies typeof interviewQuestionTemplate.$inferInsert;

      const questions = normalizeQuestions(input.questions, templateId, now);

      await db.transaction(async (tx) => {
        await tx.insert(interviewQuestionTemplate).values(record);
        if (questions.length > 0) {
          await tx.insert(interviewQuestionTemplateQuestion).values(questions);
        }
        if (jobDescriptionIds.length > 0) {
          await tx
            .insert(interviewQuestionTemplateJobDescription)
            .values(jobDescriptionIds.map((jdId) => ({ jobDescriptionId: jdId, templateId })));
        }
      });

      safeUpdateTag(`interview-question-templates:${activeOrg.id}`);
      const created = await loadInterviewQuestionTemplateById(activeOrg.id, templateId);
      return c.json(created, 201);
    },
  )
  .get("/:id", requirePermission("questionTemplate", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadInterviewQuestionTemplateById(activeOrg.id, id);
    if (!record) {
      return c.json({ error: "面试题不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .patch(
    "/:id",
    requirePermission("questionTemplate", "update"),
    zValidator("json", interviewQuestionTemplateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadInterviewQuestionTemplateById(activeOrg.id, id);
      if (!existing) {
        return c.json({ error: "面试题不存在。" }, 404);
      }

      const input = c.req.valid("json");
      const jobDescriptionIds = input.scope === "job_description" ? input.jobDescriptionIds : [];
      if (jobDescriptionIds.length > 0) {
        const ok = await managedJobDescriptionIdsExist(jobDescriptionIds, activeOrg.id);
        if (!ok) {
          return c.json({ error: "所选在招岗位中存在无效项。" }, 400);
        }
      }

      const now = new Date();
      const questions = normalizeQuestions(input.questions, id, now);

      await db.transaction(async (tx) => {
        await tx
          .update(interviewQuestionTemplate)
          .set({
            description: input.description?.trim() || null,
            scope: input.scope,
            title: input.title.trim(),
            updatedAt: now,
          })
          .where(eq(interviewQuestionTemplate.id, id));

        // Replace the question set atomically. Downstream snapshots are already
        // frozen via versioning; we don't need to preserve old question ids.
        await tx
          .delete(interviewQuestionTemplateQuestion)
          .where(eq(interviewQuestionTemplateQuestion.templateId, id));
        if (questions.length > 0) {
          await tx.insert(interviewQuestionTemplateQuestion).values(questions);
        }

        // 重写岗位绑定关系；scope=global 时清空。
        // Replace JD links wholesale; scope=global drops them all.
        await tx
          .delete(interviewQuestionTemplateJobDescription)
          .where(eq(interviewQuestionTemplateJobDescription.templateId, id));
        if (jobDescriptionIds.length > 0) {
          await tx
            .insert(interviewQuestionTemplateJobDescription)
            .values(jobDescriptionIds.map((jdId) => ({ jobDescriptionId: jdId, templateId: id })));
        }
      });

      safeUpdateTag(`interview-question-templates:${activeOrg.id}`);
      const updated = await loadInterviewQuestionTemplateById(activeOrg.id, id);
      return c.json(updated, 200);
    },
  )
  // DELETE 现在是「归档」(软删除)：把 archivedAt 写为当前时间。归档后的模板
  // 不再出现在「选择模板」的列表里，但已经绑定它的面试 / 排期 / JD 不动，
  // 避免误删进行中的面试。需要彻底清空时直接走数据库。
  //
  // DELETE is now a soft-delete: set archivedAt = now(). Archived templates are
  // hidden from picker lists but existing bindings stay intact so in-flight
  // interviews aren't broken. Hard delete is no longer exposed via API.
  .delete("/:id", requirePermission("questionTemplate", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadInterviewQuestionTemplateById(activeOrg.id, id);
    if (!existing) {
      return c.json({ error: "面试题不存在。" }, 404);
    }
    if (existing.archivedAt) {
      return c.json({ error: "该模板已归档。" }, 400);
    }
    await db
      .update(interviewQuestionTemplate)
      .set({ archivedAt: new Date() })
      .where(eq(interviewQuestionTemplate.id, id));
    safeUpdateTag(`interview-question-templates:${activeOrg.id}`);
    return c.json({ success: true }, 200);
  })
  .post("/:id/unarchive", requirePermission("questionTemplate", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadInterviewQuestionTemplateById(activeOrg.id, id);
    if (!existing) {
      return c.json({ error: "面试题不存在。" }, 404);
    }
    if (!existing.archivedAt) {
      return c.json({ error: "该模板未归档。" }, 400);
    }
    await db
      .update(interviewQuestionTemplate)
      .set({ archivedAt: null })
      .where(eq(interviewQuestionTemplate.id, id));
    safeUpdateTag(`interview-question-templates:${activeOrg.id}`);
    return c.json({ success: true }, 200);
  })
  // 把本沟通题最新版本推送到「从未开始 AI 面试」的适用候选人（含绑定与 runtime 快照）。
  // Push the latest version of this template to never-started applicable candidates.
  .post(
    "/:id/refresh-eligible-candidates",
    requirePermission("questionTemplate", "update"),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      try {
        const result = await refreshEligibleCandidatesForInterviewQuestionTemplate({
          operatorId: user?.id ?? null,
          organizationId: activeOrg.id,
          templateId: id,
        });
        safeUpdateTag(cacheTags.interviewConversations);
        invalidateStudioInterviewCaches(activeOrg.id);
        return c.json(
          {
            refreshedCount: result.refreshedCount,
            scannedCount: result.scannedCount,
            success: true,
          },
          200,
        );
      } catch (error) {
        if (error instanceof Error && error.message === "TEMPLATE_NOT_FOUND") {
          return c.json({ error: "面试题不存在或已归档。" }, 404);
        }
        return c.json(
          createInternalErrorResponse({
            context: { organizationId: activeOrg.id, templateId: id },
            error,
            operation: "refresh-eligible-interview-question-template",
            publicMessage: "刷新未面试候选人沟通题失败。",
          }),
          500,
        );
      }
    },
  )
  .get("/:id/versions/:versionId", requirePermission("questionTemplate", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const versionId = c.req.param("versionId");
    const template = await loadInterviewQuestionTemplateById(activeOrg.id, id);
    if (!template) {
      return c.json({ error: "面试题不存在。" }, 404);
    }
    const version = await loadInterviewQuestionTemplateVersionById(id, versionId);
    if (!version) {
      return c.json({ error: "版本不存在。" }, 404);
    }
    return c.json(version, 200);
  });
