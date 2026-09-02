import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../../../../lib/server/db/index";
import { department, interviewer } from "@app/db-schema/schema";
import { minimaxVoiceSchema } from "@app/db-schema/minimax-voices";
import { interviewerFormSchema, interviewerUpdateSchema } from "@app/shared/interviewers";
import { factory, jsonValidatorError } from "../../../../factory";
import { getOrCreateMinimaxVoicePreview } from "./voice-preview";
import {
  listAllInterviewers,
  loadInterviewerById,
  loadInterviewerReferenceCounts,
  queryPaginatedInterviewers,
  serializeInterviewer,
} from "./dao";
import { safeUpdateTag } from "../../../../cache-tags";
import { requirePermission } from "../../../../middlewares/permission";

async function validateDepartmentExists(
  departmentId: string,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: department.id })
    .from(department)
    .where(and(eq(department.id, departmentId), eq(department.organizationId, organizationId)))
    .limit(1);
  return !!row;
}

const interviewerListQuerySchema = z.object({
  departmentId: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.string().optional(),
  textFilters: listTextFiltersSchema("interviewers"),
});

const voicePreviewSchema = z.object({
  voice: minimaxVoiceSchema,
});

export const interviewersRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("interviewer", "read"),
    zValidator("query", interviewerListQuerySchema, jsonValidatorError("查询参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedInterviewers(
        activeOrg.id,
        {
          departmentId: q.departmentId,
          search: q.search,
          textFilters: q.textFilters,
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
  .get("/all", requirePermission("interviewer", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listAllInterviewers(activeOrg.id);
    return c.json({ records }, 200);
  })
  .post(
    "/",
    requirePermission("interviewer", "create"),
    zValidator("json", interviewerFormSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const hasDepartment = await validateDepartmentExists(input.departmentId, activeOrg.id);
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
        organizationId: activeOrg.id,
        prompt: input.prompt.trim(),
        updatedAt: now,
        voice: input.voice,
      } satisfies typeof interviewer.$inferInsert;

      await db.insert(interviewer).values(record);
      safeUpdateTag(`interviewers:${activeOrg.id}`);

      return c.json(serializeInterviewer(record), 201);
    },
  )
  .post(
    "/voice-previews",
    requirePermission("interviewer", "read"),
    zValidator("json", voicePreviewSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      try {
        const preview = await getOrCreateMinimaxVoicePreview({ voice: input.voice });
        return c.json(preview, 200);
      } catch (error) {
        console.warn("failed to create MiniMax voice preview", error);
        return c.json({ error: "生成试听音频失败。" }, 500);
      }
    },
  )
  .get("/:id", requirePermission("interviewer", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const record = await loadInterviewerById(id, activeOrg.id);
    if (!record) {
      return c.json({ error: "面试官不存在。" }, 404);
    }
    return c.json(record, 200);
  })
  .patch(
    "/:id",
    requirePermission("interviewer", "update"),
    zValidator("json", interviewerUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const id = c.req.param("id");
      const existing = await loadInterviewerById(id, activeOrg.id);
      if (!existing) {
        return c.json({ error: "面试官不存在。" }, 404);
      }

      const input = c.req.valid("json");
      if (input.departmentId !== existing.departmentId) {
        const hasDepartment = await validateDepartmentExists(input.departmentId, activeOrg.id);
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
        .where(and(eq(interviewer.id, id), eq(interviewer.organizationId, activeOrg.id)));

      safeUpdateTag(`interviewers:${activeOrg.id}`);
      const updated = await loadInterviewerById(id, activeOrg.id);
      return c.json(updated, 200);
    },
  )
  .delete("/:id", requirePermission("interviewer", "delete"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const id = c.req.param("id");
    const existing = await loadInterviewerById(id, activeOrg.id);
    if (!existing) {
      return c.json({ error: "面试官不存在。" }, 404);
    }

    const refs = await loadInterviewerReferenceCounts(id);
    if (refs.jobDescriptionCount > 0) {
      return c.json({ error: "该面试官仍被在招岗位引用，无法删除。", refs }, 400);
    }

    await db
      .delete(interviewer)
      .where(and(eq(interviewer.id, id), eq(interviewer.organizationId, activeOrg.id)));
    safeUpdateTag(`interviewers:${activeOrg.id}`);
    return c.json({ success: true }, 200);
  });
