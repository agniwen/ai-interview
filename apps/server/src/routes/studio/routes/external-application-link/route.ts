import { externalApplicationLink } from "@app/db-schema/schema";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../factory";
import { db } from "../../../../infrastructure/db/index";
import { requirePermission } from "../../../../middlewares/permission";

export const externalApplicationLinkRouter = factory
  .createApp()
  .get("/", requirePermission("resumePool", "read"), async (c) => {
    const { activeOrg, member } = c.var;
    if (!activeOrg || !member) {
      return c.json({ error: "无权访问工作空间。" }, 403);
    }
    const [link] = await db
      .select({ enabled: externalApplicationLink.enabled, token: externalApplicationLink.token })
      .from(externalApplicationLink)
      .where(eq(externalApplicationLink.organizationId, activeOrg.id));
    return c.json(
      {
        canManage: member.role === "owner" || member.role === "admin",
        enabled: link?.enabled ?? false,
        token: link?.enabled ? link.token : null,
      },
      200,
    );
  })
  .put(
    "/",
    zValidator("json", z.object({ enabled: z.boolean() }), jsonValidatorError("设置无效。")),
    async (c) => {
      const { activeOrg, member } = c.var;
      if (!activeOrg || (member?.role !== "owner" && member?.role !== "admin")) {
        return c.json({ error: "仅工作空间所有者和管理员可以管理投递链接。" }, 403);
      }
      const { enabled } = c.req.valid("json");
      const [link] = await db
        .insert(externalApplicationLink)
        .values({
          enabled,
          organizationId: activeOrg.id,
          token: crypto.randomUUID(),
        })
        .onConflictDoUpdate({
          set: { enabled },
          target: externalApplicationLink.organizationId,
        })
        .returning({ token: externalApplicationLink.token });
      return c.json({ canManage: true, enabled, token: enabled ? link.token : null }, 200);
    },
  );
