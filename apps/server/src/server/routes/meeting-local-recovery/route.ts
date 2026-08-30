import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import type { MiddlewareHandler } from "hono";
import { z } from "zod";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { authMiddleware } from "@app/server/server/middlewares/auth";
import {
  loadMeetingLocalRecoveryDirective,
  recordMeetingLocalRecoveryCleanup,
} from "@app/server/server/routes/meetings/lifecycle-dao";

const manifestSha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const localRecoveryCheckSchema = z.object({ manifestSha256: manifestSha256Schema });
const localRecoveryCleanupSchema = z.object({
  manifestSha256: manifestSha256Schema,
  status: z.enum(["deleted", "failed"]),
});

export interface MeetingLocalRecoveryDependencies {
  authMiddleware: MiddlewareHandler;
  loadMeetingLocalRecoveryDirective: typeof loadMeetingLocalRecoveryDirective;
  recordMeetingLocalRecoveryCleanup: typeof recordMeetingLocalRecoveryCleanup;
}

const defaultDependencies: MeetingLocalRecoveryDependencies = {
  authMiddleware,
  loadMeetingLocalRecoveryDirective,
  recordMeetingLocalRecoveryCleanup,
};

export function createMeetingLocalRecoveryRouter(
  dependencies: MeetingLocalRecoveryDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .use("*", dependencies.authMiddleware)
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
        const directive = await dependencies.loadMeetingLocalRecoveryDirective({
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
        await dependencies.recordMeetingLocalRecoveryCleanup({
          actorId: user.id,
          manifestSha256: body.manifestSha256,
          meetingId: c.req.param("id"),
          status: body.status,
        });
        return c.body(null, 204);
      },
    );
}

export const meetingLocalRecoveryRouter = createMeetingLocalRecoveryRouter();
