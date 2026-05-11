import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { department } from "@/lib/shared/db/schema";
import { departmentFormSchema, departmentUpdateSchema } from "@/lib/shared/departments";
import { factory, jsonValidatorError } from "@/server/factory";
import {
  listAllDepartments,
  loadDepartmentById,
  loadDepartmentReferenceCounts,
  queryPaginatedDepartments,
  serializeDepartment,
} from "@/server/routes/studio/routes/departments/dao";
import { safeUpdateTag } from "@/server/cache-tags";

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
    return c.json(result, 200);
  })
  .get("/all", async (c) => {
    const records = await listAllDepartments();
    return c.json({ records }, 200);
  })
  .post(
    "/",
    zValidator("json", departmentFormSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const input = c.req.valid("json");
      const now = new Date();
      const record = {
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        description: input.description?.trim() || null,
        id: crypto.randomUUID(),
        name: input.name.trim(),
        updatedAt: now,
      } satisfies typeof department.$inferInsert;

      await db.insert(department).values(record);
      safeUpdateTag("departments");

      return c.json(serializeDepartment(record), 201);
    },
  )
  .get("/:id", async (c) => {
    const id = c.req.param("id");
    const record = await loadDepartmentById(id);
    if (!record) {
      return c.json({ error: "部门不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .patch(
    "/:id",
    zValidator("json", departmentUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const id = c.req.param("id");
      const existing = await loadDepartmentById(id);
      if (!existing) {
        return c.json({ error: "部门不存在。" }, 404);
      }

      const input = c.req.valid("json");
      const now = new Date();
      await db
        .update(department)
        .set({
          description: input.description?.trim() || null,
          name: input.name.trim(),
          updatedAt: now,
        })
        .where(eq(department.id, id));

      safeUpdateTag("departments");
      const updated = await loadDepartmentById(id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await loadDepartmentById(id);
    if (!existing) {
      return c.json({ error: "部门不存在。" }, 404);
    }

    const refs = await loadDepartmentReferenceCounts(id);
    if (refs.interviewerCount > 0 || refs.jobDescriptionCount > 0) {
      return c.json({ error: "该部门下仍有面试官或在招岗位，无法删除。", refs }, 400);
    }

    await db.delete(department).where(eq(department.id, id));
    safeUpdateTag("departments");
    return c.json({ success: true }, 200);
  });
