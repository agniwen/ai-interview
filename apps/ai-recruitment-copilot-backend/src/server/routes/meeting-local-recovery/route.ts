import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { authMiddleware } from "@arc/ai-recruitment-copilot-backend/server/middlewares/auth";
import {
  loadMeetingLocalRecoveryDirective,
  recordMeetingLocalRecoveryCleanup,
} from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/lifecycle-dao";

const manifestSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const localRecoveryCheckSchema = z.object({ manifestSha256: manifestSha256Schema });
const localRecoveryCleanupSchema = z.object({
  manifestSha256: manifestSha256Schema,
  status: z.enum(["deleted", "failed"]),
});

export const meetingLocalRecoveryRouter = factory
  .createApp()
  .use("*", authMiddleware)
  .post(
    "/:id",
    bodyLimit({
      maxSize: 1024,
      onError: (c) => c.json({ error: "本地恢复副本检查请求过大" }, 413),
    }),
    zValidator("json", localRecoveryCheckSchema, jsonValidatorError("本地恢复副本凭证无效")),
    async (c) => {
      const { user } = c.var;
      if (!user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const directive = await loadMeetingLocalRecoveryDirective({
        actorId: user.id,
        manifestSha256: c.req.valid("json").manifestSha256,
        meetingId: c.req.param("id"),
      });
      return c.json({ deleteRequired: directive === "delete" }, 200);
    },
  )
  .put(
    "/:id",
    bodyLimit({
      maxSize: 1024,
      onError: (c) => c.json({ error: "本地恢复副本清理回报过大" }, 413),
    }),
    zValidator("json", localRecoveryCleanupSchema, jsonValidatorError("清理回报无效")),
    async (c) => {
      const { user } = c.var;
      if (!user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const body = c.req.valid("json");
      await recordMeetingLocalRecoveryCleanup({
        actorId: user.id,
        manifestSha256: body.manifestSha256,
        meetingId: c.req.param("id"),
        status: body.status,
      });
      return c.body(null, 204);
    },
  );
