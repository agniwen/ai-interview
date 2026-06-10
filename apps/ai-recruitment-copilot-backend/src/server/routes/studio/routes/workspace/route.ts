import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  member,
  organization,
  recruitingGroup,
  recruitingGroupMember,
} from "@arc/db-schema/schema";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { listWorkspaceMemberLastActives, listWorkspaceMembers } from "./dao";
import { inviteLinksRouter } from "./routes/invite-links/route";
import {
  memberRecruitingGroupInputSchema,
  recruitingGroupInputSchema,
  workspaceUpdateSchema,
} from "./schema";

export const workspaceRouter = factory
  .createApp()
  .route("/invite-links", inviteLinksRouter)
  .get("/member-last-actives", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listWorkspaceMemberLastActives(activeOrg.id);
    return c.json({ records }, 200);
  })
  // 列出工作区成员（id + name + email + image），用于「面试官多选」picker。
  // List workspace members for the interviewer multi-select picker.
  .get("/members", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listWorkspaceMembers(activeOrg.id);
    return c.json({ records }, 200);
  })
  .get("/groups", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const [groups, memberships] = await Promise.all([
      db
        .select({
          createdAt: recruitingGroup.createdAt,
          id: recruitingGroup.id,
          name: recruitingGroup.name,
        })
        .from(recruitingGroup)
        .where(eq(recruitingGroup.organizationId, activeOrg.id))
        .orderBy(recruitingGroup.createdAt),
      db
        .select({
          groupId: recruitingGroupMember.groupId,
          userId: recruitingGroupMember.userId,
        })
        .from(recruitingGroupMember)
        .where(eq(recruitingGroupMember.organizationId, activeOrg.id)),
    ]);
    const memberIdsByGroup = new Map<string, string[]>();
    for (const row of memberships) {
      const current = memberIdsByGroup.get(row.groupId) ?? [];
      current.push(row.userId);
      memberIdsByGroup.set(row.groupId, current);
    }
    return c.json(
      {
        groups: groups.map((group) => ({
          ...group,
          createdAt: group.createdAt.toISOString(),
          memberUserIds: memberIdsByGroup.get(group.id) ?? [],
        })),
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
      const [created] = await db
        .insert(recruitingGroup)
        .values({
          createdBy: user?.id ?? null,
          id: crypto.randomUUID(),
          name: input.name,
          organizationId: activeOrg.id,
        })
        .returning({
          createdAt: recruitingGroup.createdAt,
          id: recruitingGroup.id,
          name: recruitingGroup.name,
        });
      if (!created) {
        return c.json({ error: "创建组别失败。" }, 500);
      }
      return c.json(
        { ...created, createdAt: created.createdAt.toISOString(), memberUserIds: [] },
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
      const [updated] = await db
        .update(recruitingGroup)
        .set({ name: c.req.valid("json").name, updatedAt: new Date() })
        .where(
          and(
            eq(recruitingGroup.id, c.req.param("id")),
            eq(recruitingGroup.organizationId, activeOrg.id),
          ),
        )
        .returning({
          createdAt: recruitingGroup.createdAt,
          id: recruitingGroup.id,
          name: recruitingGroup.name,
        });
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
        ),
      )
      .returning({ id: recruitingGroup.id });
    if (rows.length === 0) {
      return c.json({ error: "组别不存在。" }, 404);
    }
    return c.json({ success: true }, 200);
  })
  .patch(
    "/members/:userId/group",
    requirePermission("member", "update"),
    zValidator("json", memberRecruitingGroupInputSchema, jsonValidatorError("组别参数无效。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const targetUserId = c.req.param("userId");
      const [target] = await db
        .select({ userId: member.userId })
        .from(member)
        .where(and(eq(member.organizationId, activeOrg.id), eq(member.userId, targetUserId)))
        .limit(1);
      if (!target) {
        return c.json({ error: "成员不存在。" }, 404);
      }
      const { groupId } = c.req.valid("json");
      if (groupId) {
        const [group] = await db
          .select({ id: recruitingGroup.id })
          .from(recruitingGroup)
          .where(
            and(eq(recruitingGroup.id, groupId), eq(recruitingGroup.organizationId, activeOrg.id)),
          )
          .limit(1);
        if (!group) {
          return c.json({ error: "组别不存在。" }, 404);
        }
      }
      await db.transaction(async (tx) => {
        await tx
          .delete(recruitingGroupMember)
          .where(
            and(
              eq(recruitingGroupMember.organizationId, activeOrg.id),
              eq(recruitingGroupMember.userId, targetUserId),
            ),
          );
        if (groupId) {
          await tx.insert(recruitingGroupMember).values({
            groupId,
            organizationId: activeOrg.id,
            userId: targetUserId,
          });
        }
      });
      return c.json({ groupId, success: true, userId: targetUserId }, 200);
    },
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
