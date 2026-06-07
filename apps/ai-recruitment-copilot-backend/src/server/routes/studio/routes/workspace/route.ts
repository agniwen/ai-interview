import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { organization } from "@arc/db-schema/schema";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { listWorkspaceMemberLastActives, listWorkspaceMembers } from "./dao";
import { inviteLinksRouter } from "./routes/invite-links/route";
import { workspaceUpdateSchema } from "./schema";

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
