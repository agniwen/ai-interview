import { globalConfigSchema } from "@/lib/global-config";
import { factory } from "@/server/factory";
import { getGlobalConfig, upsertGlobalConfig } from "@/server/queries/global-config";

export const globalConfigRouter = factory
  .createApp()
  .get("/", async (c) => {
    const record = await getGlobalConfig();
    return c.json(record);
  })
  .put("/", async (c) => {
    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const parsed = globalConfigSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return c.json({ error: parsed.error.issues[0]?.message ?? "表单校验失败。" }, 400);
    }
    const record = await upsertGlobalConfig(parsed.data, c.var.user?.id ?? null);
    return c.json(record);
  });
