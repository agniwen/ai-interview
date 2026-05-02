import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { department, interviewer } from "@/lib/db/schema";
import { interviewerFormSchema, interviewerUpdateSchema } from "@/lib/interviewers";
import { factory } from "@/server/factory";
import {
  listAllInterviewers,
  loadInterviewerById,
  loadInterviewerReferenceCounts,
  queryPaginatedInterviewers,
  serializeInterviewer,
} from "@/server/queries/interviewers";
import { safeUpdateTag } from "@/server/routes/interview/utils";

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
    return c.json(result);
  })
  .get("/all", async (c) => {
    const records = await listAllInterviewers();
    return c.json({ records });
  })
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = interviewerFormSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }

    const hasDepartment = await validateDepartmentExists(input.data.departmentId);
    if (!hasDepartment) {
      return c.json({ error: "所选部门不存在。" }, 400);
    }

    const now = new Date();
    const record = {
      createdAt: now,
      createdBy: c.var.user?.id ?? null,
      departmentId: input.data.departmentId,
      description: input.data.description?.trim() || null,
      id: crypto.randomUUID(),
      name: input.data.name.trim(),
      prompt: input.data.prompt.trim(),
      updatedAt: now,
      voice: input.data.voice,
    } satisfies typeof interviewer.$inferInsert;

    await db.insert(interviewer).values(record);
    safeUpdateTag("interviewers");

    return c.json(serializeInterviewer(record), 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadInterviewerById(id);
    if (!record) {
      return c.json({ error: "面试官不存在。" }, 404);
    }
    return c.json(record);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadInterviewerById(id);
    if (!existing) {
      return c.json({ error: "面试官不存在。" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = interviewerUpdateSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }

    if (input.data.departmentId !== existing.departmentId) {
      const hasDepartment = await validateDepartmentExists(input.data.departmentId);
      if (!hasDepartment) {
        return c.json({ error: "所选部门不存在。" }, 400);
      }
    }

    const now = new Date();
    await db
      .update(interviewer)
      .set({
        departmentId: input.data.departmentId,
        description: input.data.description?.trim() || null,
        name: input.data.name.trim(),
        prompt: input.data.prompt.trim(),
        updatedAt: now,
        voice: input.data.voice,
      })
      .where(eq(interviewer.id, id));

    safeUpdateTag("interviewers");
    const updated = await loadInterviewerById(id);
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadInterviewerById(id);
    if (!existing) {
      return c.json({ error: "面试官不存在。" }, 404);
    }

    const refs = await loadInterviewerReferenceCounts(id);
    if (refs.jobDescriptionCount > 0) {
      return c.json(
        {
          error: "该面试官仍被在招岗位引用，无法删除。",
          refs,
        },
        400,
      );
    }

    await db.delete(interviewer).where(eq(interviewer.id, id));
    safeUpdateTag("interviewers");
    return c.json({ success: true });
  });
