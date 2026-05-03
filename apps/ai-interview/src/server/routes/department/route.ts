import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { department } from "@/lib/db/schema";
import { departmentFormSchema, departmentUpdateSchema } from "@/lib/departments";
import { factory } from "@/server/factory";
import {
  listAllDepartments,
  loadDepartmentById,
  loadDepartmentReferenceCounts,
  queryPaginatedDepartments,
  serializeDepartment,
} from "@/server/queries/departments";
import { safeUpdateTag } from "@/server/routes/interview/utils";

export const departmentsRouter = factory
  .createApp()
  .get("/", async (c) => {
    const result = await queryPaginatedDepartments(
      { search: c.req.query("search") },
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
    const records = await listAllDepartments();
    return c.json({ records });
  })
  .post("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = departmentFormSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }

    const now = new Date();
    const record = {
      createdAt: now,
      createdBy: c.var.user?.id ?? null,
      description: input.data.description?.trim() || null,
      id: crypto.randomUUID(),
      name: input.data.name.trim(),
      updatedAt: now,
    } satisfies typeof department.$inferInsert;

    await db.insert(department).values(record);
    safeUpdateTag("departments");

    return c.json(serializeDepartment(record), 201);
  })
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadDepartmentById(id);
    if (!record) {
      return c.json({ error: "部门不存在。" }, 404);
    }
    return c.json(record);
  })
  .patch("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadDepartmentById(id);
    if (!existing) {
      return c.json({ error: "部门不存在。" }, 404);
    }

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const input = departmentUpdateSchema.safeParse(body ?? {});
    if (!input.success) {
      return c.json({ error: input.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }

    const now = new Date();
    await db
      .update(department)
      .set({
        description: input.data.description?.trim() || null,
        name: input.data.name.trim(),
        updatedAt: now,
      })
      .where(eq(department.id, id));

    safeUpdateTag("departments");
    const updated = await loadDepartmentById(id);
    return c.json(updated);
  })
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadDepartmentById(id);
    if (!existing) {
      return c.json({ error: "部门不存在。" }, 404);
    }

    const refs = await loadDepartmentReferenceCounts(id);
    if (refs.interviewerCount > 0 || refs.jobDescriptionCount > 0) {
      return c.json(
        {
          error: "该部门下仍有面试官或在招岗位，无法删除。",
          refs,
        },
        400,
      );
    }

    await db.delete(department).where(eq(department.id, id));
    safeUpdateTag("departments");
    return c.json({ success: true });
  });
