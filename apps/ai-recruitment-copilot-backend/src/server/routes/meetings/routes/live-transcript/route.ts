import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createMeetingLiveTranscriptAuthorizationSchema } from "@arc/shared/meeting-transcription";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { LiveTranscriptAuthorizationRateLimitError } from "./authorization-gate";
import {
  createWorkspaceMeetingLiveTranscriptAuthorization,
  heartbeatWorkspaceMeetingLiveTranscript,
  releaseWorkspaceMeetingLiveTranscript,
} from "./service";

const liveTranscriptLeaseParamSchema = z.object({ captureId: z.uuid() });

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
        if (authorization === "capacity") {
          c.header("Retry-After", "30");
          return c.json(
            {
              code: "live-transcript-capacity-exhausted",
              error: "实时字幕容量已满，Meeting Recording 仍在本地继续",
            },
            429,
          );
        }
        c.header("Cache-Control", "no-store");
        return c.json(authorization, 201);
      } catch (error) {
        if (error instanceof LiveTranscriptAuthorizationRateLimitError) {
          c.header("Retry-After", String(error.retryAfterSeconds));
          return c.json(
            {
              code: "live-transcript-rate-limited",
              error: "实时字幕授权请求过于频繁",
            },
            429,
          );
        }
        console.error("[meeting-live-transcript] failed to create authorization", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
        return c.json({ error: "实时字幕 provider 暂时不可用" }, 502);
      }
    },
  )
  .post(
    "/:captureId/heartbeat",
    zValidator("param", liveTranscriptLeaseParamSchema, jsonValidatorError("实时字幕租约参数无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const renewed = await heartbeatWorkspaceMeetingLiveTranscript({
        captureId: c.req.param("captureId"),
        organizationId: activeOrg.id,
        userId: user.id,
      });
      if (!renewed) {
        return c.json({ error: "实时字幕租约已失效，Meeting Recording 仍在本地继续" }, 409);
      }
      return c.body(null, 204);
    },
  )
  .delete(
    "/:captureId",
    zValidator("param", liveTranscriptLeaseParamSchema, jsonValidatorError("实时字幕租约参数无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      await releaseWorkspaceMeetingLiveTranscript({
        captureId: c.req.param("captureId"),
        organizationId: activeOrg.id,
        userId: user.id,
      });
      return c.body(null, 204);
    },
  );
