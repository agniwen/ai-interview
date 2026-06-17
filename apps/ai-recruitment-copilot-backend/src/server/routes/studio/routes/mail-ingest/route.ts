import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  createMailIngestAccount,
  deleteMailIngestAccount,
  listMailIngestAccounts,
  updateMailIngestAccount,
} from "./dao";
import { createMailIngestAccountSchema, updateMailIngestAccountSchema } from "./schema";

export const mailIngestRouter = factory
  .createApp()
  .get("/", requirePermission("resume", "read"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const accounts = await listMailIngestAccounts(activeOrg.id, user.id);
    return c.json({ accounts }, 200);
  })
  .post(
    "/",
    requirePermission("resume", "create"),
    zValidator("json", createMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const account = await createMailIngestAccount({
          input: c.req.valid("json"),
          organizationId: activeOrg.id,
          userId: user.id,
        });
        return c.json(account, 201);
      } catch (error) {
        console.error("[mail-ingest] create account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置保存失败。" },
          500,
        );
      }
    },
  )
  .patch(
    "/:id",
    requirePermission("resume", "update"),
    zValidator("json", updateMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const account = await updateMailIngestAccount({
          id: c.req.param("id"),
          input: c.req.valid("json"),
          organizationId: activeOrg.id,
          userId: user.id,
        });
        if (!account) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        return c.json(account, 200);
      } catch (error) {
        console.error("[mail-ingest] update account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置更新失败。" },
          500,
        );
      }
    },
  )
  .delete("/:id", requirePermission("resume", "delete"), async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const deleted = await deleteMailIngestAccount({
      id: c.req.param("id"),
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (!deleted) {
      return c.json({ error: "邮箱配置不存在。" }, 404);
    }
    return c.json({ ok: true }, 200);
  });
