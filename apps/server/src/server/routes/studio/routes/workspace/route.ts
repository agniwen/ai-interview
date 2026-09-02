import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../lib/server/db/index";
import { organization, recruitingGroup } from "@app/db-schema/schema";
import { factory, jsonValidatorError } from "../../../../factory";
import { requirePermission } from "../../../../middlewares/permission";
import {
  addRecruitingGroupMember,
  ensureDefaultRecruitingGroupForWorkspace,
  findRecruitingGroupByName,
  listRecruitingGroupBoard,
  listWorkspaceMemberLastActives,
  loadMyResumeActivity,
  removeRecruitingGroupMember,
  updateRecruitingGroupMemberRole,
} from "./dao";
import { inviteLinksRouter } from "./routes/invite-links/route";
import { workspaceMembersRouter } from "./routes/members/route";
import {
  recruitingGroupMemberInputSchema,
  recruitingGroupMemberRoleInputSchema,
  recruitingGroupInputSchema,
  workspaceUpdateSchema,
} from "./schema";
import { z } from "zod";

interface DatabaseErrorBoundary {
  error: unknown;
}

const databaseErrorSchema = z.object({
  cause: z.unknown().optional(),
  code: z.string().optional(),
  constraint: z.string().optional(),
});

function isRecruitingGroupNameConflict(error: DatabaseErrorBoundary["error"]): boolean {
  const result = databaseErrorSchema.safeParse(error);
  if (!result.success) {
    return false;
  }
  return (
    result.data.code === "23505" ||
    result.data.constraint === "recruiting_group_org_name_uq" ||
    isRecruitingGroupNameConflict(result.data.cause)
  );
}

export const workspaceRouter = factory
  .createApp()
  .route("/invite-links", inviteLinksRouter)
  .route("/members", workspaceMembersRouter)
  .get("/my-activity", async (c) => {
    const { activeOrg, user } = c.var;
    if (!(activeOrg && user?.id)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const dailyAdded = await loadMyResumeActivity({
      organizationId: activeOrg.id,
      userId: user.id,
    });
    return c.json({ dailyAdded }, 200);
  })
  .get("/member-last-actives", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listWorkspaceMemberLastActives(activeOrg.id);
    return c.json({ records }, 200);
  })
  .get("/groups", async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    await ensureDefaultRecruitingGroupForWorkspace({
      creatorUserId: user?.id,
      organizationId: activeOrg.id,
    });
    const groups = await listRecruitingGroupBoard(activeOrg.id);
    return c.json(
      {
        groups,
      },
      200,
    );
  })
  .post(
    "/groups",
    requirePermission("member", "update"),
    zValidator("json", recruitingGroupInputSchema, jsonValidatorError("组别参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const duplicate = await findRecruitingGroupByName({
        name: input.name,
        organizationId: activeOrg.id,
      });
      if (duplicate) {
        return c.json({ error: "同一工作区内已存在同名招聘组。" }, 409);
      }
      const [created] = await db
        .insert(recruitingGroup)
        .values({
          createdBy: user?.id ?? null,
          id: crypto.randomUUID(),
          name: input.name,
          organizationId: activeOrg.id,
        })
        .onConflictDoNothing({
          target: [recruitingGroup.organizationId, recruitingGroup.name],
        })
        .returning({
          createdAt: recruitingGroup.createdAt,
          id: recruitingGroup.id,
          isDefault: recruitingGroup.isDefault,
          name: recruitingGroup.name,
        });
      if (!created) {
        return c.json({ error: "同一工作区内已存在同名招聘组。" }, 409);
      }
      return c.json(
        {
          ...created,
          createdAt: created.createdAt.toISOString(),
          memberUserIds: [],
          members: [],
        },
        201,
      );
    },
  )
  .patch(
    "/groups/:id",
    requirePermission("member", "update"),
    zValidator("json", recruitingGroupInputSchema, jsonValidatorError("组别参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const duplicate = await findRecruitingGroupByName({
        excludeGroupId: c.req.param("id"),
        name: input.name,
        organizationId: activeOrg.id,
      });
      if (duplicate) {
        return c.json({ error: "同一工作区内已存在同名招聘组。" }, 409);
      }
      let updated:
        | {
            createdAt: Date;
            id: string;
            isDefault: boolean;
            name: string;
          }
        | undefined;
      try {
        [updated] = await db
          .update(recruitingGroup)
          .set({ name: input.name, updatedAt: new Date() })
          .where(
            and(
              eq(recruitingGroup.id, c.req.param("id")),
              eq(recruitingGroup.organizationId, activeOrg.id),
            ),
          )
          .returning({
            createdAt: recruitingGroup.createdAt,
            id: recruitingGroup.id,
            isDefault: recruitingGroup.isDefault,
            name: recruitingGroup.name,
          });
      } catch (error) {
        if (isRecruitingGroupNameConflict(error)) {
          return c.json({ error: "同一工作区内已存在同名招聘组。" }, 409);
        }
        throw error;
      }
      if (!updated) {
        return c.json({ error: "组别不存在。" }, 404);
      }
      return c.json({ ...updated, createdAt: updated.createdAt.toISOString() }, 200);
    },
  )
  .delete("/groups/:id", requirePermission("member", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const rows = await db
      .delete(recruitingGroup)
      .where(
        and(
          eq(recruitingGroup.id, c.req.param("id")),
          eq(recruitingGroup.organizationId, activeOrg.id),
          eq(recruitingGroup.isDefault, false),
        ),
      )
      .returning({ id: recruitingGroup.id });
    if (rows.length === 0) {
      return c.json({ error: "组别不存在。" }, 404);
    }
    return c.json({ success: true }, 200);
  })
  .post(
    "/groups/:id/members",
    requirePermission("member", "update"),
    zValidator("json", recruitingGroupMemberInputSchema, jsonValidatorError("组成员参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const row = await addRecruitingGroupMember({
        createdBy: user?.id,
        groupId: c.req.param("id"),
        organizationId: activeOrg.id,
        role: input.role,
        userId: input.userId,
      });
      if (row.status === "missing") {
        return c.json({ error: "组别或成员不存在。" }, 404);
      }
      if (row.status === "duplicate") {
        return c.json({ error: "该成员已在这个招聘组中。" }, 409);
      }
      return c.json({ id: row.id, success: true }, 201);
    },
  )
  .patch(
    "/groups/:id/members/:userId",
    requirePermission("member", "update"),
    zValidator(
      "json",
      recruitingGroupMemberRoleInputSchema,
      jsonValidatorError("组成员角色无效。"),
    ),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const row = await updateRecruitingGroupMemberRole({
        groupId: c.req.param("id"),
        organizationId: activeOrg.id,
        role: c.req.valid("json").role,
        userId: c.req.param("userId"),
      });
      if (!row) {
        return c.json({ error: "组成员不存在。" }, 404);
      }
      return c.json({ id: row.id, success: true }, 200);
    },
  )
  .delete("/groups/:id/members/:userId", requirePermission("member", "update"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const removed = await removeRecruitingGroupMember({
      groupId: c.req.param("id"),
      organizationId: activeOrg.id,
      userId: c.req.param("userId"),
    });
    if (!removed) {
      return c.json({ error: "组成员不存在。" }, 404);
    }
    return c.json({ success: true }, 200);
  })
  .patch("/members/:userId/group", requirePermission("member", "update"), (c) =>
    c.json(
      {
        error: "该接口已废弃，请使用 /groups/:id/members 管理成员和组内角色。",
      },
      410,
    ),
  )
  .patch(
    "/",
    requirePermission("organization", "update"),
    zValidator("json", workspaceUpdateSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }

      const input = c.req.valid("json");
      const [updated] = await db
        .update(organization)
        .set({ name: input.name })
        .where(eq(organization.id, activeOrg.id))
        .returning({
          createdAt: organization.createdAt,
          id: organization.id,
          logo: organization.logo,
          metadata: organization.metadata,
          name: organization.name,
          slug: organization.slug,
        });

      if (!updated) {
        return c.json({ error: "工作区不存在。" }, 404);
      }

      return c.json(
        {
          ...updated,
          createdAt: updated.createdAt.toISOString(),
        },
        200,
      );
    },
  );
