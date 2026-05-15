import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  candidateFormSubmission,
  candidateFormTemplate,
  candidateFormTemplateJobDescription,
  candidateFormTemplateQuestion,
} from "@/lib/shared/db/schema";
import { candidateFormTemplateSchema } from "@/lib/shared/candidate-forms";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import {
  listAllCandidateFormTemplates,
  loadCandidateFormTemplateById,
  queryPaginatedCandidateFormTemplates,
} from "@/server/routes/studio/routes/forms/dao/queries";
import { loadSubmissionsByTemplate } from "@/server/routes/studio/routes/forms/dao/submissions";
import { loadCandidateFormTemplateVersionById } from "@/server/routes/studio/routes/forms/dao/versions";
import { jobDescriptionIdsExist } from "@/server/routes/studio/routes/job-descriptions/dao";
import { safeUpdateTag } from "@/server/cache-tags";

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

const candidateFormListQuerySchema = z.object({
  jobDescriptionId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  scope: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

export const candidateFormsRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("candidateForm", "read"),
    zValidator("query", candidateFormListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedCandidateFormTemplates(
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
  .get("/all", requirePermission("candidateForm", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listAllCandidateFormTemplates(activeOrg.id);
    return c.json({ records }, 200);
  })
  .post(
    "/",
    requirePermission("candidateForm", "create"),
    zValidator("json", candidateFormTemplateSchema, jsonValidatorError("表单校验失败。")),
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
      } satisfies typeof candidateFormTemplate.$inferInsert;

      const questions = normalizeQuestions(input.questions, templateId, now);

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

      safeUpdateTag(`candidate-form-templates:${activeOrg.id}`);
      const created = await loadCandidateFormTemplateById(activeOrg.id, templateId);
      return c.json(created, 201);
    },
  )
  .get("/:id", requirePermission("candidateForm", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadCandidateFormTemplateById(activeOrg.id, id);
    if (!record) {
      return c.json({ error: "面试表单不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .patch(
    "/:id",
    requirePermission("candidateForm", "update"),
    zValidator("json", candidateFormTemplateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadCandidateFormTemplateById(activeOrg.id, id);
      if (!existing) {
        return c.json({ error: "面试表单不存在。" }, 404);
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
          .update(candidateFormTemplate)
          .set({
            description: input.description?.trim() || null,
            scope: input.scope,
            title: input.title.trim(),
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

      safeUpdateTag(`candidate-form-templates:${activeOrg.id}`);
      const updated = await loadCandidateFormTemplateById(activeOrg.id, id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", requirePermission("candidateForm", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadCandidateFormTemplateById(activeOrg.id, id);
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
    safeUpdateTag(`candidate-form-templates:${activeOrg.id}`);
    return c.json({ success: true }, 200);
  })
  .get(
    "/:id/submissions",
    requirePermission("candidateForm", "read"),
    zValidator(
      "query",
      z.object({
        limit: z.string().optional(),
        offset: z.string().optional(),
      }),
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadCandidateFormTemplateById(activeOrg.id, id);
      if (!existing) {
        return c.json({ error: "面试表单不存在。" }, 404);
      }
      const { limit, offset } = c.req.valid("query");
      // 字符串 → number；NaN 或负值由 DAO 内部 clamp，路由这里只做最浅的解析。
      // String → number; clamp lives in the DAO so route does minimal coercion.
      const result = await loadSubmissionsByTemplate(id, {
        limit: limit ? Number(limit) : undefined,
        offset: offset ? Number(offset) : undefined,
      });
      return c.json(result, 200);
    },
  )
  .get("/:id/versions/:versionId", requirePermission("candidateForm", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const versionId = c.req.param("versionId");
    // Verify the template belongs to this org before serving the version.
    const template = await loadCandidateFormTemplateById(activeOrg.id, id);
    if (!template) {
      return c.json({ error: "面试表单不存在。" }, 404);
    }
    const version = await loadCandidateFormTemplateVersionById(id, versionId);
    if (!version) {
      return c.json({ error: "版本不存在。" }, 404);
    }
    return c.json(version, 200);
  });
