import { zValidator } from "@hono/zod-validator";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
} from "@/lib/shared/db/schema";
import {
  jobDescriptionFormSchema,
  jobDescriptionUpdateSchema,
} from "@/lib/shared/job-descriptions";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import {
  listAllJobDescriptions,
  loadJobDescriptionById,
  queryPaginatedJobDescriptions,
  serializeJobDescription,
} from "@/server/routes/studio/routes/job-descriptions/dao";
import { safeUpdateTag } from "@/server/cache-tags";

async function validateReferences(
  organizationId: string,
  departmentId: string,
  interviewerIds: string[],
) {
  const [[departmentRow], interviewerRows] = await Promise.all([
    db
      .select({ id: department.id })
      .from(department)
      .where(and(eq(department.id, departmentId), eq(department.organizationId, organizationId)))
      .limit(1),
    interviewerIds.length > 0
      ? db
          .select({ id: interviewer.id })
          .from(interviewer)
          .where(
            and(
              inArray(interviewer.id, interviewerIds),
              eq(interviewer.organizationId, organizationId),
            ),
          )
      : Promise.resolve([] as { id: string }[]),
  ]);

  if (!departmentRow) {
    return { error: "所选部门不存在。" as const };
  }
  if (interviewerRows.length !== interviewerIds.length) {
    return { error: "存在无效的面试官，请刷新后重试。" as const };
  }
  return { error: null };
}

function dedupeInterviewerIds(ids: string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
}

export const jobDescriptionsRouter = factory
  .createApp()
  .get("/", requirePermission("jd", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const result = await queryPaginatedJobDescriptions(
      activeOrg.id,
      {
        departmentId: c.req.query("departmentId"),
        interviewerId: c.req.query("interviewerId"),
        search: c.req.query("search"),
      },
      {
        page: c.req.query("page"),
        pageSize: c.req.query("pageSize"),
        sortBy: c.req.query("sortBy"),
        sortOrder: c.req.query("sortOrder"),
      },
    );
    return c.json(result, 200);
  })
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

      const { error } = await validateReferences(activeOrg.id, input.departmentId, interviewerIds);
      if (error) {
        return c.json({ error }, 400);
      }

      const now = new Date();
      const record = {
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

      safeUpdateTag("job-descriptions");
      safeUpdateTag("interviewers");

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

      const { error } = await validateReferences(activeOrg.id, input.departmentId, interviewerIds);
      if (error) {
        return c.json({ error }, 400);
      }

      const now = new Date();
      await db.transaction(async (tx) => {
        await tx
          .update(jobDescription)
          .set({
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

      safeUpdateTag("job-descriptions");
      safeUpdateTag("interviewers");
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

    // jobDescriptionInterviewer cascades on JD delete; studio_interview.job_description_id → SET NULL.
    await db
      .delete(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, activeOrg.id)));
    safeUpdateTag("job-descriptions");
    safeUpdateTag("studio-interviews");
    safeUpdateTag("interviewers");
    return c.json({ success: true }, 200);
  });
