import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { organization } from "@/lib/shared/db/schema";
import { factory, jsonValidatorError } from "@/server/factory";
import { requirePermission } from "@/server/middlewares/permission";
import { listWorkspaceMemberLastLogins } from "./dao";
import { workspaceUpdateSchema } from "./schema";

export const workspaceRouter = factory
  .createApp()
  .get("/member-last-logins", async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listWorkspaceMemberLastLogins(activeOrg.id);
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
