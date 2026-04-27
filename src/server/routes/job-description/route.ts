import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  department,
  interviewer,
  jobDescription,
  jobDescriptionInterviewer,
} from "@/lib/db/schema";
import { jobDescriptionFormSchema, jobDescriptionUpdateSchema } from "@/lib/job-descriptions";
import { factory } from "@/server/factory";
import {
  listAllJobDescriptions,
  loadJobDescriptionById,
  queryPaginatedJobDescriptions,
  serializeJobDescription,
} from "@/server/queries/job-descriptions";
import { safeUpdateTag } from "@/server/routes/interview/utils";

async function validateReferences(departmentId: string, interviewerIds: string[]) {
  const [[departmentRow], interviewerRows] = await Promise.all([
    db
      .select({ id: department.id })
      .from(department)
      .where(eq(department.id, departmentId))
      .limit(1),
    interviewerIds.length > 0
      ? db
          .select({ id: interviewer.id })
          .from(interviewer)
          .where(inArray(interviewer.id, interviewerIds))
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
  .get("/", async (c) => {
    const result = await queryPaginatedJobDescriptions(
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
    return c.json(result);
  })
  .get("/all", async (c) => {
    const records = await listAllJobDescriptions();
    return c.json({ records });
  })
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = jobDescriptionFormSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }

    const interviewerIds = dedupeInterviewerIds(input.data.interviewerIds);
    if (interviewerIds.length === 0) {
      return c.json({ error: "请至少选择一位面试官。" }, 400);
    }

    const { error } = await validateReferences(input.data.departmentId, interviewerIds);
    if (error) {
      return c.json({ error }, 400);
    }

    const now = new Date();
    const record = {
      createdAt: now,
      createdBy: c.var.user?.id ?? null,
      departmentId: input.data.departmentId,
      description: input.data.description?.trim() || null,
      id: crypto.randomUUID(),
      name: input.data.name.trim(),
      // presetQuestions is deprecated — column kept with default [] for legacy
      // data; new rows always store an empty array.
      presetQuestions: [],
      prompt: input.data.prompt.trim(),
      updatedAt: now,
    } satisfies typeof jobDescription.$inferInsert;

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
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadJobDescriptionById(id);
    if (!record) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }
    return c.json(record);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadJobDescriptionById(id);
    if (!existing) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = jobDescriptionUpdateSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }

    const interviewerIds = dedupeInterviewerIds(input.data.interviewerIds);
    if (interviewerIds.length === 0) {
      return c.json({ error: "请至少选择一位面试官。" }, 400);
    }

    const { error } = await validateReferences(input.data.departmentId, interviewerIds);
    if (error) {
      return c.json({ error }, 400);
    }

    const now = new Date();
    await db.transaction(async (tx) => {
      await tx
        .update(jobDescription)
        .set({
          departmentId: input.data.departmentId,
          description: input.data.description?.trim() || null,
          name: input.data.name.trim(),
          prompt: input.data.prompt.trim(),
          updatedAt: now,
        })
        .where(eq(jobDescription.id, id));

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
    const updated = await loadJobDescriptionById(id);
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadJobDescriptionById(id);
    if (!existing) {
      return c.json({ error: "在招岗位不存在。" }, 404);
    }

    // jobDescriptionInterviewer cascades on JD delete; studio_interview.job_description_id → SET NULL.
    await db.delete(jobDescription).where(eq(jobDescription.id, id));
    safeUpdateTag("job-descriptions");
    safeUpdateTag("studio-interviews");
    safeUpdateTag("interviewers");
    return c.json({ success: true });
  });
