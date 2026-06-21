import { zValidator } from "@hono/zod-validator";
import { and, count, eq, inArray, notInArray } from "drizzle-orm";
import { uniq } from "lodash-es";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
  studioInterview,
} from "@arc/db-schema/schema";
import { jobDescriptionFormSchema, jobDescriptionUpdateSchema } from "@arc/shared/job-descriptions";
import { validateJobDescriptionInterviewerDepartments } from "@arc/shared/job-description-interviewers";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  listAllJobDescriptions,
  loadJobDescriptionById,
  queryPaginatedJobDescriptions,
  serializeJobDescription,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { cacheTags, safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { generateJobDescriptionFromPrompt } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/ai-job-description-generate";
import { recommendCandidatesForJobDescription } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/utils/recommendations";

const generateJobDescriptionBodySchema = z.object({
  departmentName: z.string().trim().max(120).optional(),
  jobName: z.string().trim().max(120).optional(),
  prompt: z.string().trim().min(1, "请填写 AI 填写指令").max(2000),
});

async function validateReferences(
  organizationId: string,
  departmentId: string,
  interviewerIds: string[],
  allowCrossDepartmentInterviewers: boolean,
) {
  const [[departmentRow], interviewerRows] = await Promise.all([
    db
      .select({ id: department.id })
      .from(department)
      .where(and(eq(department.id, departmentId), eq(department.organizationId, organizationId)))
      .limit(1),
    interviewerIds.length > 0
      ? db
          .select({
            departmentId: interviewer.departmentId,
            departmentName: department.name,
            id: interviewer.id,
            name: interviewer.name,
          })
          .from(interviewer)
          .leftJoin(department, eq(interviewer.departmentId, department.id))
          .where(
            and(
              inArray(interviewer.id, interviewerIds),
              eq(interviewer.organizationId, organizationId),
            ),
          )
      : Promise.resolve(
          [] as {
            departmentId: string;
            departmentName: string | null;
            id: string;
            name: string;
          }[],
        ),
  ]);

  if (!departmentRow) {
    return { error: "所选部门不存在。" as const };
  }
  if (interviewerRows.length !== interviewerIds.length) {
    return { error: "存在无效的面试官，请刷新后重试。" as const };
  }
  return {
    error: validateJobDescriptionInterviewerDepartments({
      allowCrossDepartmentInterviewers,
      departmentId,
      interviewers: interviewerRows,
    }),
  };
}

function dedupeInterviewerIds(ids: string[]): string[] {
  return uniq(ids.map((id) => id.trim()).filter(Boolean));
}

const jobDescriptionListQuerySchema = z.object({
  departmentId: z.string().optional(),
  interviewerId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
});

const recommendationBodySchema = z.object({
  excludeAlreadyLinked: z.boolean().optional().default(true),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const jobDescriptionsRouter = factory
  .createApp()
  .post(
    "/ai-generate",
    requirePermission("jd", "update"),
    zValidator("json", generateJobDescriptionBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const body = c.req.valid("json");
      try {
        const result = await generateJobDescriptionFromPrompt({
          departmentName: body.departmentName ?? null,
          hrPrompt: body.prompt,
          jobName: body.jobName ?? null,
        });
        return c.json(result, 200);
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : "AI 生成失败。" }, 500);
      }
    },
  )
  .get(
    "/",
    requirePermission("jd", "read"),
    zValidator("query", jobDescriptionListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedJobDescriptions(
        activeOrg.id,
        {
          departmentId: q.departmentId,
          interviewerId: q.interviewerId,
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
  .get("/all", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listAllJobDescriptions(activeOrg.id);
    return c.json({ records }, 200);
  })
  .post(
    "/",
    requirePermission("jd", "create"),
    zValidator("json", jobDescriptionFormSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const interviewerIds = dedupeInterviewerIds(input.interviewerIds);
      if (interviewerIds.length === 0) {
        return c.json({ error: "请至少选择一位面试官。" }, 400);
      }

      const { error } = await validateReferences(
        activeOrg.id,
        input.departmentId,
        interviewerIds,
        input.allowCrossDepartmentInterviewers,
      );
      if (error) {
        return c.json({ error }, 400);
      }

      const now = new Date();
      const record = {
        allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        departmentId: input.departmentId,
        description: input.description?.trim() || null,
        feishuChatBoundAt: null,
        feishuChatBoundBy: null,
        feishuChatId: null,
        id: crypto.randomUUID(),
        name: input.name.trim(),
        organizationId: activeOrg.id,
        // presetQuestions is deprecated — column kept with default [] for legacy
        // data; new rows always store an empty array.
        presetQuestions: [],
        prompt: input.prompt.trim(),
        updatedAt: now,
      } satisfies typeof jobDescription.$inferSelect;

      await db.transaction(async (tx) => {
        await tx.insert(jobDescription).values(record);
        await tx.insert(jobDescriptionInterviewer).values(
          interviewerIds.map((id) => ({
            createdAt: now,
            interviewerId: id,
            jobDescriptionId: record.id,
          })),
        );
      });

      safeUpdateTag(`job-descriptions:${activeOrg.id}`);
      safeUpdateTag(`interviewers:${activeOrg.id}`);

      return c.json(serializeJobDescription(record, interviewerIds), 201);
    },
  )
  .get("/:id", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadJobDescriptionById(activeOrg.id, id);
    if (!record) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .post(
    "/:id/recommendations",
    requirePermission("jd", "read"),
    requirePermission("resume", "read"),
    zValidator("json", recommendationBodySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const record = await loadJobDescriptionById(activeOrg.id, id);
      if (!record) {
        return c.json({ error: "在招岗位不存在。" }, 404);
      }
      const body = c.req.valid("json");
      try {
        const result = await recommendCandidatesForJobDescription({
          excludeAlreadyLinked: body.excludeAlreadyLinked,
          jobDescription: {
            departmentName: null,
            description: record.description,
            id: record.id,
            name: record.name,
            prompt: record.prompt,
          },
          limit: body.limit,
          organizationId: activeOrg.id,
        });
        return c.json(result, 200);
      } catch (error) {
        console.warn("[job-description-recommendations] failed", {
          error,
          id,
          organizationId: activeOrg.id,
        });
        return c.json({ error: "人才推荐失败，请稍后重试。" }, 500);
      }
    },
  )
  .patch(
    "/:id",
    requirePermission("jd", "update"),
    zValidator("json", jobDescriptionUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadJobDescriptionById(activeOrg.id, id);
      if (!existing) {
        return c.json({ error: "在招岗位不存在。" }, 404);
      }

      const input = c.req.valid("json");
      const interviewerIds = dedupeInterviewerIds(input.interviewerIds);
      if (interviewerIds.length === 0) {
        return c.json({ error: "请至少选择一位面试官。" }, 400);
      }

      const { error } = await validateReferences(
        activeOrg.id,
        input.departmentId,
        interviewerIds,
        input.allowCrossDepartmentInterviewers,
      );
      if (error) {
        return c.json({ error }, 400);
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(jobDescription)
          .set({
            allowCrossDepartmentInterviewers: input.allowCrossDepartmentInterviewers,
            departmentId: input.departmentId,
            description: input.description?.trim() || null,
            name: input.name.trim(),
            prompt: input.prompt.trim(),
            updatedAt: now,
          })
          .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, activeOrg.id)));

        // Replace junction links atomically.
        await tx
          .delete(jobDescriptionInterviewer)
          .where(eq(jobDescriptionInterviewer.jobDescriptionId, id));
        await tx.insert(jobDescriptionInterviewer).values(
          interviewerIds.map((interviewerId) => ({
            createdAt: now,
            interviewerId,
            jobDescriptionId: id,
          })),
        );
      });

      safeUpdateTag(`job-descriptions:${activeOrg.id}`);
      safeUpdateTag(`interviewers:${activeOrg.id}`);
      const updated = await loadJobDescriptionById(activeOrg.id, id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", requirePermission("jd", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadJobDescriptionById(activeOrg.id, id);
    if (!existing) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }

    // 有非归档候选人关联到该岗位时禁止删除：候选人是业务实体，外键的 SET NULL
    // 行为会让简历挂在"未知岗位"上，难以追溯，因此前置拦截。
    // Block delete when non-archived candidates still reference this JD —
    // SET NULL would orphan candidates onto an empty job-description column
    // and make follow-up triage hard. Force the user to deal with them first.
    const [resumeRow] = await db
      .select({ count: count() })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.jobDescriptionId, id),
          notInArray(studioInterview.status, ["archived"]),
        ),
      );
    const resumeCount = resumeRow?.count ?? 0;
    if (resumeCount > 0) {
      return c.json(
        {
          error: `当前有 ${resumeCount} 条简历关联到该在招岗位，无法删除；请先在简历库中调整或删除这些候选人。`,
        },
        409,
      );
    }

    // jobDescriptionInterviewer cascades on JD delete; studio_interview.job_description_id → SET NULL.
    await db
      .delete(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, activeOrg.id)));
    safeUpdateTag(`job-descriptions:${activeOrg.id}`);
    safeUpdateTag(cacheTags.studioInterviews(activeOrg.id));
    safeUpdateTag(`interviewers:${activeOrg.id}`);
    return c.json({ success: true }, 200);
  });
