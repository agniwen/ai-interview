import { externalApplicationLink } from "@app/db-schema/schema";
import { parseFeishuBitableUrl } from "@app/feishu/bitable";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { factory, jsonValidatorError } from "../../../../factory";
import { db } from "../../../../infrastructure/db/index";
import { requirePermission } from "../../../../middlewares/permission";

const updateExternalApplicationLinkSchema = z.object({
  enabled: z.boolean(),
  feishuBitableUrl: z.string().trim().max(2048).nullable().optional(),
});

function resolveNextFeishuBitableUrl(
  input: string | null | undefined,
): { error: string } | { value: string | null | undefined } {
  if (input === undefined) {
    return { value: undefined };
  }
  if (input === null || input.length === 0) {
    return { value: null };
  }
  if (!parseFeishuBitableUrl(input)) {
    return { error: "请输入有效的飞书多维表格链接（需包含 table 参数）。" };
  }
  return { value: input };
}

export const externalApplicationLinkRouter = factory
  .createApp()
  .get("/", requirePermission("resumePool", "read"), async (c) => {
    const { activeOrg, member } = c.var;
    if (!activeOrg || !member) {
      return c.json({ error: "无权访问工作空间。" }, 403);
    }
    const [link] = await db
      .select({
        enabled: externalApplicationLink.enabled,
        feishuBitableUrl: externalApplicationLink.feishuBitableUrl,
        token: externalApplicationLink.token,
      })
      .from(externalApplicationLink)
      .where(eq(externalApplicationLink.organizationId, activeOrg.id));
    return c.json(
      {
        canManage: member.role === "owner" || member.role === "admin",
        enabled: link?.enabled ?? false,
        feishuBitableUrl: link?.feishuBitableUrl ?? null,
        token: link?.enabled ? link.token : null,
      },
      200,
    );
  })
  .put(
    "/",
    zValidator("json", updateExternalApplicationLinkSchema, jsonValidatorError("设置无效。")),
    async (c) => {
      const { activeOrg, member } = c.var;
      if (!activeOrg || (member?.role !== "owner" && member?.role !== "admin")) {
        return c.json({ error: "仅工作空间所有者和管理员可以管理投递链接。" }, 403);
      }
      const { enabled, feishuBitableUrl } = c.req.valid("json");
      const parsedBitableUrl = resolveNextFeishuBitableUrl(feishuBitableUrl);
      if ("error" in parsedBitableUrl) {
        return c.json({ error: parsedBitableUrl.error }, 400);
      }
      const updateSet =
        parsedBitableUrl.value === undefined
          ? { enabled }
          : { enabled, feishuBitableUrl: parsedBitableUrl.value };
      const [link] = await db
        .insert(externalApplicationLink)
        .values({
          enabled,
          feishuBitableUrl: parsedBitableUrl.value ?? null,
          organizationId: activeOrg.id,
          token: crypto.randomUUID(),
        })
        .onConflictDoUpdate({
          set: updateSet,
          target: externalApplicationLink.organizationId,
        })
        .returning({
          feishuBitableUrl: externalApplicationLink.feishuBitableUrl,
          token: externalApplicationLink.token,
        });
      return c.json(
        {
          canManage: true,
          enabled,
          feishuBitableUrl: link.feishuBitableUrl ?? null,
          token: enabled ? link.token : null,
        },
        200,
      );
    },
  );
