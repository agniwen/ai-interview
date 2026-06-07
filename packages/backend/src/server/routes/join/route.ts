import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/backend/server/factory";
import { acceptInviteLink, getJoinPreview, JoinError } from "./dao";
import { codeParamsSchema } from "./schema";

export const joinRouter = factory
  .createApp()
  .get(
    "/:code/preview",
    zValidator("param", codeParamsSchema, jsonValidatorError("邀请码格式不正确。")),
    async (c) => {
      const { code } = c.req.valid("param");
      const userId = c.var.user?.id ?? null;
      const preview = await getJoinPreview({ code, userId });
      return c.json(preview, 200);
    },
  )
  .post(
    "/:code/accept",
    zValidator("param", codeParamsSchema, jsonValidatorError("邀请码格式不正确。")),
    async (c) => {
      const { user } = c.var;
      if (!user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { code } = c.req.valid("param");
      try {
        const result = await acceptInviteLink({ code, userId: user.id });
        return c.json(result, 200);
      } catch (error) {
        if (error instanceof JoinError) {
          return c.json({ error: "邀请链接已失效或不存在。" }, 410);
        }
        throw error;
      }
    },
  );
