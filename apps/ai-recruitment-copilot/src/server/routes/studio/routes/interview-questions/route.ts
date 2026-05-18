import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
} from "@/lib/shared/db/schema";
import { interviewQuestionTemplateSchema } from "@/lib/shared/interview-question-templates";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import {
  listAllInterviewQuestionTemplates,
  loadInterviewQuestionTemplateById,
  queryPaginatedInterviewQuestionTemplates,
} from "@/server/routes/studio/routes/interview-questions/dao/queries";
import { loadInterviewQuestionTemplateVersionById } from "@/server/routes/studio/routes/interview-questions/dao/versions";
import { jobDescriptionIdsExist } from "@/server/routes/studio/routes/job-descriptions/dao";
import { safeUpdateTag } from "@/server/cache-tags";

function normalizeQuestions(
  questions: {
    id?: string;
    content: string;
    difficulty: "easy" | "medium" | "hard";
    sortOrder: number;
  }[],
  templateId: string,
  now: Date,
) {
  return questions.map((question, index) => ({
    content: question.content.trim(),
    createdAt: now,
    difficulty: question.difficulty,
    id: question.id?.trim() || crypto.randomUUID(),
    sortOrder: typeof question.sortOrder === "number" ? question.sortOrder : index,
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
        const ok = await jobDescriptionIdsExist(jobDescriptionIds);
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
        const ok = await jobDescriptionIdsExist(jobDescriptionIds);
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
  .get("/:id/versions/:versionId", requirePermission("questionTemplate", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const versionId = c.req.param("versionId");
    const version = await loadInterviewQuestionTemplateVersionById(id, versionId);
    if (!version) {
      return c.json({ error: "版本不存在。" }, 404);
    }
    return c.json(version, 200);
  });
