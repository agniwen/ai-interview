import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
  jobDescription,
} from "@/lib/db/schema";
import { candidateFormTemplateSchema } from "@/lib/candidate-forms";
import { factory } from "@/server/factory";
import {
  listAllCandidateFormTemplates,
  loadCandidateFormTemplateById,
  loadCandidateFormTemplateVersionById,
  loadSubmissionsByTemplate,
  queryPaginatedCandidateFormTemplates,
} from "@/server/queries/candidate-forms";
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
    type: "single" | "multi" | "text";
    displayMode: "radio" | "checkbox" | "select" | "input" | "textarea";
    label: string;
    helperText?: string | null;
    required: boolean;
    sortOrder: number;
    options: { value: string; label: string }[];
  }[],
  templateId: string,
  now: Date,
) {
  return questions.map((question, index) => ({
    createdAt: now,
    displayMode: question.displayMode,
    helperText: question.helperText?.trim() || null,
    id: question.id?.trim() || crypto.randomUUID(),
    label: question.label.trim(),
    options: question.type === "text" ? [] : question.options,
    required: question.required,
    sortOrder: typeof question.sortOrder === "number" ? question.sortOrder : index,
    templateId,
    type: question.type,
    updatedAt: now,
  }));
}

export const candidateFormsRouter = factory
  .createApp()
  .get("/", async (c) => {
    const result = await queryPaginatedCandidateFormTemplates(
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
    const records = await listAllCandidateFormTemplates();
    return c.json({ records });
  })
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = candidateFormTemplateSchema.safeParse(body ?? {});
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
    } satisfies typeof candidateFormTemplate.$inferInsert;

    const questions = normalizeQuestions(input.data.questions, templateId, now);

    await db.transaction(async (tx) => {
      await tx.insert(candidateFormTemplate).values(record);
      if (questions.length > 0) {
        await tx.insert(candidateFormTemplateQuestion).values(questions);
      }
      if (jobDescriptionIds.length > 0) {
        await tx
          .insert(candidateFormTemplateJobDescription)
          .values(jobDescriptionIds.map((jdId) => ({ jobDescriptionId: jdId, templateId })));
      }
    });

    safeUpdateTag("candidate-form-templates");
    const created = await loadCandidateFormTemplateById(templateId);
    return c.json(created, 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadCandidateFormTemplateById(id);
    if (!record) {
      return c.json({ error: "面试表单不存在。" }, 404);
    }
    return c.json(record);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadCandidateFormTemplateById(id);
    if (!existing) {
      return c.json({ error: "面试表单不存在。" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = candidateFormTemplateSchema.safeParse(body ?? {});
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
        .update(candidateFormTemplate)
        .set({
          description: input.data.description?.trim() || null,
          scope: input.data.scope,
          title: input.data.title.trim(),
          updatedAt: now,
        })
        .where(eq(candidateFormTemplate.id, id));

      // Replace the question set atomically. Since downstream snapshots are
      // already frozen, we do not need to preserve old question ids.
      await tx
        .delete(candidateFormTemplateQuestion)
        .where(eq(candidateFormTemplateQuestion.templateId, id));
      if (questions.length > 0) {
        await tx.insert(candidateFormTemplateQuestion).values(questions);
      }

      // 重写岗位绑定关系
      // Replace JD links wholesale.
      await tx
        .delete(candidateFormTemplateJobDescription)
        .where(eq(candidateFormTemplateJobDescription.templateId, id));
      if (jobDescriptionIds.length > 0) {
        await tx
          .insert(candidateFormTemplateJobDescription)
          .values(jobDescriptionIds.map((jdId) => ({ jobDescriptionId: jdId, templateId: id })));
      }
    });

    safeUpdateTag("candidate-form-templates");
    const updated = await loadCandidateFormTemplateById(id);
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadCandidateFormTemplateById(id);
    if (!existing) {
      return c.json({ error: "面试表单不存在。" }, 404);
    }

    const [submissionCountRow] = await db
      .select({ count: candidateFormSubmission.id })
      .from(candidateFormSubmission)
      .where(eq(candidateFormSubmission.templateId, id))
      .limit(1);
    if (submissionCountRow) {
      return c.json({ error: "已有候选人填写该面试表单，无法删除。" }, 400);
    }

    await db.delete(candidateFormTemplate).where(eq(candidateFormTemplate.id, id));
    safeUpdateTag("candidate-form-templates");
    return c.json({ success: true });
  })
  .get("/:id/submissions", async (c) => {
    const id = c.req.param("id");
    const existing = await loadCandidateFormTemplateById(id);
    if (!existing) {
      return c.json({ error: "面试表单不存在。" }, 404);
    }
    const submissions = await loadSubmissionsByTemplate(id);
    return c.json({ submissions });
  })
  .get("/:id/versions/:versionId", async (c) => {
    const id = c.req.param("id");
    const versionId = c.req.param("versionId");
    const version = await loadCandidateFormTemplateVersionById(id, versionId);
    if (!version) {
      return c.json({ error: "版本不存在。" }, 404);
    }
    return c.json(version);
  });
