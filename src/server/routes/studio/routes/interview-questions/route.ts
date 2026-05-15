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
import { countBindingsByTemplate } from "@/server/routes/studio/routes/interview-questions/dao/bindings";
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
  jobDescriptionId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  scope: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

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

    const bindingCount = await countBindingsByTemplate(id);
    if (bindingCount > 0) {
      return c.json({ error: "已有面试绑定该模板，无法删除。" }, 400);
    }

    await db.delete(interviewQuestionTemplate).where(eq(interviewQuestionTemplate.id, id));
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
