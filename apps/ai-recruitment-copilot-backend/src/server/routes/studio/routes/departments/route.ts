import { listTextFiltersSchema } from "@arc/shared/list-text-filters";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { department } from "@arc/db-schema/schema";
import { departmentFormSchema, departmentUpdateSchema } from "@arc/shared/departments";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  listAllDepartments,
  loadDepartmentById,
  loadDepartmentReferenceCounts,
  queryPaginatedDepartments,
  serializeDepartment,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";
import { safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";

const departmentListQuerySchema = z.object({
  page: z.string().optional(),
  pageSize: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  textFilters: listTextFiltersSchema("departments"),
});

export const departmentsRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("department", "read"),
    zValidator("query", departmentListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedDepartments(
        { organizationId: activeOrg.id, search: q.search, textFilters: q.textFilters },
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
  .get("/all", requirePermission("department", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listAllDepartments(activeOrg.id);
    return c.json({ records }, 200);
  })
  .post(
    "/",
    requirePermission("department", "create"),
    zValidator("json", departmentFormSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const now = new Date();
      const record = {
        createdAt: now,
        createdBy: c.var.user?.id ?? null,
        description: input.description?.trim() || null,
        id: crypto.randomUUID(),
        name: input.name.trim(),
        organizationId: activeOrg.id,
        updatedAt: now,
      } satisfies typeof department.$inferInsert;

      await db.insert(department).values(record);
      safeUpdateTag(`departments:${activeOrg.id}`);

      return c.json(serializeDepartment(record), 201);
    },
  )
  .get("/:id", requirePermission("department", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadDepartmentById(id, activeOrg.id);
    if (!record) {
      return c.json({ error: "部门不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .patch(
    "/:id",
    requirePermission("department", "update"),
    zValidator("json", departmentUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadDepartmentById(id, activeOrg.id);
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
        .where(and(eq(department.id, id), eq(department.organizationId, activeOrg.id)));

      safeUpdateTag(`departments:${activeOrg.id}`);
      const updated = await loadDepartmentById(id, activeOrg.id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", requirePermission("department", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadDepartmentById(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "部门不存在。" }, 404);
    }

    const refs = await loadDepartmentReferenceCounts(id);
    if (refs.interviewerCount > 0 || refs.jobDescriptionCount > 0) {
      return c.json({ error: "该部门下仍有面试官或在招岗位，无法删除。", refs }, 400);
    }

    await db
      .delete(department)
      .where(and(eq(department.id, id), eq(department.organizationId, activeOrg.id)));
    safeUpdateTag(`departments:${activeOrg.id}`);
    return c.json({ success: true }, 200);
  });
