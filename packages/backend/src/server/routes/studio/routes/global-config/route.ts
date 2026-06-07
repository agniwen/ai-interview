import { zValidator } from "@hono/zod-validator";
import { globalConfigSchema } from "@arc/shared/global-config";
import { factory, jsonValidatorError } from "@arc/backend/server/factory";
import { requirePermission } from "@arc/backend/server/middlewares/permission";
import {
  getGlobalConfig,
  upsertGlobalConfig,
} from "@arc/backend/server/routes/studio/routes/global-config/dao";

export const globalConfigRouter = factory
  .createApp()
  .get("/", requirePermission("globalConfig", "read"), async (c) => {
    const { activeOrg } = c.var;
    if (!activeOrg) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const record = await getGlobalConfig(activeOrg.id);
    return c.json(record, 200);
  })
  .put(
    "/",
    requirePermission("globalConfig", "update"),
    zValidator("json", globalConfigSchema, jsonValidatorError("表单校验失败。")),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const input = c.req.valid("json");
      const record = await upsertGlobalConfig(input, c.var.user?.id ?? null, activeOrg.id);
      return c.json(record, 200);
    },
  );
