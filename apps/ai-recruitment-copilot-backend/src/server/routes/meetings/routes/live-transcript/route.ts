import { zValidator } from "@hono/zod-validator";
import { createMeetingLiveTranscriptAuthorizationSchema } from "@arc/shared/meeting-transcription";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { LiveTranscriptAuthorizationRateLimitError } from "./authorization-gate";
import { createWorkspaceMeetingLiveTranscriptAuthorization } from "./service";

export const meetingLiveTranscriptRouter = factory
  .createApp()
  .post(
    "/",
    zValidator(
      "json",
      createMeetingLiveTranscriptAuthorizationSchema,
      jsonValidatorError("实时字幕授权请求无效"),
    ),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const input = c.req.valid("json");
        const authorization = await createWorkspaceMeetingLiveTranscriptAuthorization({
          captureId: input.captureId,
          organizationId: activeOrg.id,
          track: input.track,
          userId: user.id,
        });
        if (authorization === "unavailable") {
          return c.json({ error: "当前 Workspace 未启用实时字幕 provider" }, 503);
        }
        c.header("Cache-Control", "no-store");
        return c.json(authorization, 201);
      } catch (error) {
        if (error instanceof LiveTranscriptAuthorizationRateLimitError) {
          c.header("Retry-After", String(error.retryAfterSeconds));
          return c.json({ error: "实时字幕授权请求过于频繁" }, 429);
        }
        console.error("[meeting-live-transcript] failed to create authorization", { error });
        return c.json({ error: "实时字幕 provider 暂时不可用" }, 502);
      }
    },
  );
