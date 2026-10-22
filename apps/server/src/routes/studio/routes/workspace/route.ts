import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "../../../../infrastructure/db/index";
import { organization } from "@app/db-schema/schema";
import { factory, jsonValidatorError } from "../../../../factory";
import { requirePermission } from "../../../../middlewares/permission";
import { listWorkspaceMemberLastActives, loadMyResumeActivity } from "./dao";
import { inviteLinksRouter } from "./routes/invite-links/route";
import { workspaceMembersRouter } from "./routes/members/route";
import { workspaceUpdateSchema } from "./schema";

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
