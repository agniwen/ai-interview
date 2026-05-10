import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { department, interviewer } from "@/lib/server/db/schema";
import { interviewerFormSchema, interviewerUpdateSchema } from "@/lib/shared/interviewers";
import { factory, jsonValidatorError } from "@/server/factory";
import {
  listAllInterviewers,
  loadInterviewerById,
  loadInterviewerReferenceCounts,
  queryPaginatedInterviewers,
  serializeInterviewer,
} from "@/server/routes/studio/routes/interviewers/dao";
import { safeUpdateTag } from "@/server/cache-tags";

async function validateDepartmentExists(departmentId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: department.id })
    .from(department)
    .where(eq(department.id, departmentId))
    .limit(1);
  return !!row;
}

export const interviewersRouter = factory
  .createApp()
  .get("/", async (c) => {
    const result = await queryPaginatedInterviewers(
      {
        departmentId: c.req.query("departmentId"),
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
  .get("/all", async (c) => {
    const records = await listAllInterviewers();
    return c.json({ records }, 200);
  })
  .post(
    "/",
    zValidator("json", interviewerFormSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const input = c.req.valid("json");
      const hasDepartment = await validateDepartmentExists(input.departmentId);
      if (!hasDepartment) {
        return c.json({ error: "所选部门不存在。" }, 400);
      }

      const now = new Date();
      const record = {
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        departmentId: input.departmentId,
        description: input.description?.trim() || null,
        id: crypto.randomUUID(),
        name: input.name.trim(),
        prompt: input.prompt.trim(),
        updatedAt: now,
        voice: input.voice,
      } satisfies typeof interviewer.$inferInsert;

      await db.insert(interviewer).values(record);
      safeUpdateTag("interviewers");

      return c.json(serializeInterviewer(record), 201);
    },
  )
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadInterviewerById(id);
    if (!record) {
      return c.json({ error: "面试官不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .patch(
    "/:id",
    zValidator("json", interviewerUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const id = c.req.param("id");
      const existing = await loadInterviewerById(id);
      if (!existing) {
        return c.json({ error: "面试官不存在。" }, 404);
      }

      const input = c.req.valid("json");
      if (input.departmentId !== existing.departmentId) {
        const hasDepartment = await validateDepartmentExists(input.departmentId);
        if (!hasDepartment) {
          return c.json({ error: "所选部门不存在。" }, 400);
        }
      }

      const now = new Date();
      await db
        .update(interviewer)
        .set({
          departmentId: input.departmentId,
          description: input.description?.trim() || null,
          name: input.name.trim(),
          prompt: input.prompt.trim(),
          updatedAt: now,
          voice: input.voice,
        })
        .where(eq(interviewer.id, id));

      safeUpdateTag("interviewers");
      const updated = await loadInterviewerById(id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadInterviewerById(id);
    if (!existing) {
      return c.json({ error: "面试官不存在。" }, 404);
    }

    const refs = await loadInterviewerReferenceCounts(id);
    if (refs.jobDescriptionCount > 0) {
      return c.json({ error: "该面试官仍被在招岗位引用，无法删除。", refs }, 400);
    }

    await db.delete(interviewer).where(eq(interviewer.id, id));
    safeUpdateTag("interviewers");
    return c.json({ success: true }, 200);
  });
