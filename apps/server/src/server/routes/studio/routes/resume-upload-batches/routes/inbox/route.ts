import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { uploadTaskInboxQuerySchema } from "./schema";
import { listUploadTaskInbox } from "./utils";

export const uploadTaskInboxRouter = factory
  .createApp()
  .get(
    "/",
    requirePermission("resumeUploadBatch", "read"),
    zValidator("query", uploadTaskInboxQuerySchema, jsonValidatorError("请求参数无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { cursor } = c.req.valid("query");
      const result = await listUploadTaskInbox({
        cursor: cursor ?? null,
        organizationId: activeOrg.id,
        userId: user.id,
      });
      return c.json(result, 200);
    },
  );
