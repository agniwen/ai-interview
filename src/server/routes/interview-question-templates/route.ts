import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  interviewQuestionTemplate,
  interviewQuestionTemplateJobDescription,
  interviewQuestionTemplateQuestion,
  jobDescription,
} from "@/lib/db/schema";
import { interviewQuestionTemplateSchema } from "@/lib/interview-question-templates";
import { factory } from "@/server/factory";
import {
  countBindingsByTemplate,
  listAllInterviewQuestionTemplates,
  loadInterviewQuestionTemplateById,
  loadInterviewQuestionTemplateVersionById,
  queryPaginatedInterviewQuestionTemplates,
} from "@/server/queries/interview-question-templates";
import { safeUpdateTag } from "@/server/routes/interview/utils";

async function validateJobDescriptionsExist(ids: string[]) {
  if (ids.length === 0) {
    return true;
  }
  const rows = await db
    .select({ id: jobDescription.id })
    .from(jobDescription)
    .where(inArray(jobDescription.id, ids));
  return rows.length === new Set(ids).size;
}

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

export const interviewQuestionTemplatesRouter = factory
  .createApp()
  .get("/", async (c) => {
    const result = await queryPaginatedInterviewQuestionTemplates(
      {
        jobDescriptionId: c.req.query("jobDescriptionId"),
        scope: c.req.query("scope"),
        search: c.req.query("search"),
      },
      {
        page: c.req.query("page"),
        pageSize: c.req.query("pageSize"),
        sortBy: c.req.query("sortBy"),
        sortOrder: c.req.query("sortOrder"),
      },
    );
    return c.json(result);
  })
  .get("/all", async (c) => {
    const records = await listAllInterviewQuestionTemplates();
    return c.json({ records });
  })
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = interviewQuestionTemplateSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }
    const jobDescriptionIds =
      input.data.scope === "job_description" ? input.data.jobDescriptionIds : [];
    if (jobDescriptionIds.length > 0) {
      const ok = await validateJobDescriptionsExist(jobDescriptionIds);
      if (!ok) {
        return c.json({ error: "所选在招岗位中存在无效项。" }, 400);
      }
    }

    const now = new Date();
    const templateId = crypto.randomUUID();
    const record = {
      createdAt: now,
      createdBy: c.var.user?.id ?? null,
      description: input.data.description?.trim() || null,
      id: templateId,
      scope: input.data.scope,
      title: input.data.title.trim(),
      updatedAt: now,
    } satisfies typeof interviewQuestionTemplate.$inferInsert;

    const questions = normalizeQuestions(input.data.questions, templateId, now);

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

    safeUpdateTag("interview-question-templates");
    const created = await loadInterviewQuestionTemplateById(templateId);
    return c.json(created, 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadInterviewQuestionTemplateById(id);
    if (!record) {
      return c.json({ error: "面试题不存在。" }, 404);
    }
    return c.json(record);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadInterviewQuestionTemplateById(id);
    if (!existing) {
      return c.json({ error: "面试题不存在。" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = interviewQuestionTemplateSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }
    const jobDescriptionIds =
      input.data.scope === "job_description" ? input.data.jobDescriptionIds : [];
    if (jobDescriptionIds.length > 0) {
      const ok = await validateJobDescriptionsExist(jobDescriptionIds);
      if (!ok) {
        return c.json({ error: "所选在招岗位中存在无效项。" }, 400);
      }
    }

    const now = new Date();
    const questions = normalizeQuestions(input.data.questions, id, now);

    await db.transaction(async (tx) => {
      await tx
        .update(interviewQuestionTemplate)
        .set({
          description: input.data.description?.trim() || null,
          scope: input.data.scope,
          title: input.data.title.trim(),
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

    safeUpdateTag("interview-question-templates");
    const updated = await loadInterviewQuestionTemplateById(id);
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadInterviewQuestionTemplateById(id);
    if (!existing) {
      return c.json({ error: "面试题不存在。" }, 404);
    }

    const bindingCount = await countBindingsByTemplate(id);
    if (bindingCount > 0) {
      return c.json({ error: "已有面试绑定该模板，无法删除。" }, 400);
    }

    await db.delete(interviewQuestionTemplate).where(eq(interviewQuestionTemplate.id, id));
    safeUpdateTag("interview-question-templates");
    return c.json({ success: true });
  })
  .get("/:id/versions/:versionId", async (c) => {
    const id = c.req.param("id");
    const versionId = c.req.param("versionId");
    const version = await loadInterviewQuestionTemplateVersionById(id, versionId);
    if (!version) {
      return c.json({ error: "版本不存在。" }, 404);
    }
    return c.json(version);
  });
