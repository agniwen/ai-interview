import { zValidator } from "@hono/zod-validator";
import { canAssignWorkspaceRole } from "@app/server/server/access/workspace-roles";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { requirePermission } from "@app/server/server/middlewares/permission";
import {
  createInviteLink,
  disableInviteLink,
  enableInviteLink,
  listInviteLinks,
  listLinkMembers,
  updateInviteLinkInitialRole,
} from "./dao";
import { sendWorkspaceInviteLinkEmail } from "./email";
import {
  inviteLinkCreateInputSchema,
  inviteLinkIdParamsSchema,
  inviteLinkInitialRoleInputSchema,
} from "./schema";

export const inviteLinksRouter = factory
  .createApp()
  .use("*", requirePermission("invitation", "create"))
  .get("/", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const rows = await listInviteLinks(activeOrg.id);
    return c.json(
      {
        links: rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          disabledAt: r.disabledAt?.toISOString() ?? null,
        })),
      },
      200,
    );
  })
  .post(
    "/",
    zValidator("json", inviteLinkCreateInputSchema, jsonValidatorError("邀请信息无效。")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { email, initialRole } = c.req.valid("json");
      const allowed = await canAssignWorkspaceRole({
        invokerRole: member.role,
        organizationId: activeOrg.id,
        targetRole: initialRole,
      });
      if (!allowed) {
        return c.json({ error: "只能设置为可分配的工作区角色。" }, 403);
      }
      const link = await createInviteLink({
        createdBy: user.id,
        initialRole,
        organizationId: activeOrg.id,
      });
      let emailDelivery: "failed" | "not_requested" | "sent" = "not_requested";
      if (email) {
        try {
          await sendWorkspaceInviteLinkEmail({
            code: link.code,
            email,
            inviteLinkId: link.id,
            inviterName: user.name,
            workspaceName: activeOrg.name,
          });
          emailDelivery = "sent";
        } catch (error) {
          emailDelivery = "failed";
          console.warn("[workspace-invite] failed to send invitation email", {
            error: error instanceof Error ? error.message : "unknown error",
            inviteLinkId: link.id,
          });
        }
      }
      return c.json(
        {
          ...link,
          createdAt: link.createdAt.toISOString(),
          disabledAt: link.disabledAt?.toISOString() ?? null,
          emailDelivery,
        },
        200,
      );
    },
  )
  .patch(
    "/:id",
    zValidator("param", inviteLinkIdParamsSchema, jsonValidatorError("参数错误。")),
    zValidator("json", inviteLinkInitialRoleInputSchema, jsonValidatorError("初始化角色无效。")),
    async (c) => {
      const { activeOrg, member } = c.var;
      if (!(activeOrg && member)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { id } = c.req.valid("param");
      const { initialRole } = c.req.valid("json");
      const allowed = await canAssignWorkspaceRole({
        invokerRole: member.role,
        organizationId: activeOrg.id,
        targetRole: initialRole,
      });
      if (!allowed) {
        return c.json({ error: "只能设置为可分配的工作区角色。" }, 403);
      }
      const link = await updateInviteLinkInitialRole({
        id,
        initialRole,
        organizationId: activeOrg.id,
      });
      if (!link) {
        return c.json({ error: "链接不存在或不属于当前工作区。" }, 404);
      }
      return c.json(
        {
          ...link,
          createdAt: link.createdAt.toISOString(),
          disabledAt: link.disabledAt?.toISOString() ?? null,
        },
        200,
      );
    },
  )
  .patch(
    "/:id/disable",
    zValidator("param", inviteLinkIdParamsSchema, jsonValidatorError("参数错误。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { id } = c.req.valid("param");
      const link = await disableInviteLink({
        disabledBy: user.id,
        id,
        organizationId: activeOrg.id,
      });
      if (!link) {
        return c.json({ error: "链接不存在或不属于当前工作区。" }, 404);
      }
      return c.json(
        {
          ...link,
          createdAt: link.createdAt.toISOString(),
          disabledAt: link.disabledAt?.toISOString() ?? null,
        },
        200,
      );
    },
  )
  .patch(
    "/:id/enable",
    zValidator("param", inviteLinkIdParamsSchema, jsonValidatorError("参数错误。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { id } = c.req.valid("param");
      const link = await enableInviteLink({
        id,
        organizationId: activeOrg.id,
      });
      if (!link) {
        return c.json({ error: "链接不存在或不属于当前工作区。" }, 404);
      }
      return c.json(
        {
          ...link,
          createdAt: link.createdAt.toISOString(),
          disabledAt: link.disabledAt?.toISOString() ?? null,
        },
        200,
      );
    },
  )
  .get(
    "/:id/members",
    zValidator("param", inviteLinkIdParamsSchema, jsonValidatorError("参数错误。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { id } = c.req.valid("param");
      const rows = await listLinkMembers({ id, organizationId: activeOrg.id });
      return c.json(
        {
          members: rows.map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() })),
        },
        200,
      );
    },
  );
