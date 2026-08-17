import { zValidator } from "@hono/zod-validator";
import { globalConfigSchema } from "@arc/shared/global-config";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import {
  getGlobalConfig,
  upsertGlobalConfig,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";

export interface GlobalConfigRouterDependencies {
  getGlobalConfig: typeof getGlobalConfig;
  requirePermission: typeof requirePermission;
  upsertGlobalConfig: typeof upsertGlobalConfig;
}

const defaultDependencies: GlobalConfigRouterDependencies = {
  getGlobalConfig,
  requirePermission,
  upsertGlobalConfig,
};

export function createGlobalConfigRouter(
  dependencies: GlobalConfigRouterDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get("/", dependencies.requirePermission("globalConfig", "read"), async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const record = await dependencies.getGlobalConfig(activeOrg.id);
      return c.json(record, 200);
    })
    .put(
      "/",
      dependencies.requirePermission("globalConfig", "update"),
      zValidator("json", globalConfigSchema, jsonValidatorError("表单校验失败。")),
      async (c) => {
        const { activeOrg } = c.var;
        if (!activeOrg) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const input = c.req.valid("json");
        const record = await dependencies.upsertGlobalConfig(
          input,
          c.var.user?.id ?? null,
          activeOrg.id,
        );
        return c.json(record, 200);
      },
    );
}

export const globalConfigRouter = createGlobalConfigRouter();
