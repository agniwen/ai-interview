import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import { createInviteLink, disableInviteLink, listInviteLinks, listLinkMembers } from "./dao";
import { inviteLinkIdParamsSchema } from "./schema";

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
  .post("/", async (c) => {
    const { activeOrg, user } = c.var;
    if (!(activeOrg && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const link = await createInviteLink({
      createdBy: user.id,
      organizationId: activeOrg.id,
    });
    return c.json(
      {
        ...link,
        createdAt: link.createdAt.toISOString(),
        disabledAt: link.disabledAt?.toISOString() ?? null,
      },
      200,
    );
  })
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
