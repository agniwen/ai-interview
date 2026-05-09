import { zValidator } from "@hono/zod-validator";
import { globalConfigSchema } from "@/lib/global-config";
import { factory } from "@/server/factory";
import {
  getGlobalConfig,
  upsertGlobalConfig,
} from "@/server/routes/studio/routes/global-config/dao";

export const globalConfigRouter = factory
  .createApp()
  .get("/", async (c) => {
    const record = await getGlobalConfig();
    return c.json(record, 200);
  })
  .put(
    "/",
    zValidator("json", globalConfigSchema, (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message ?? "表单校验失败。" }, 400);
      }
    }),
    async (c) => {
      const input = c.req.valid("json");
      const record = await upsertGlobalConfig(input, c.var.user?.id ?? null);
      return c.json(record, 200);
    },
  );
