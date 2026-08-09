import { zValidator } from "@hono/zod-validator";
import {
  completeSmallSavedMeetingSchema,
  createMultipartSavedMeetingSchema,
  createSmallSavedMeetingSchema,
} from "@arc/shared/meeting-recording";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  completeSmallSavedMeeting,
  createMultipartSavedMeeting,
  createSmallSavedMeeting,
  getSavedMeetingDetail,
  listSavedMeetings,
} from "./service";
import { meetingPlaybackRouter } from "./routes/playback/route";
import { meetingExportsRouter } from "./routes/exports/route";
import { meetingQuestionsRouter } from "./routes/questions/route";
import { meetingRecruitingContextRouter } from "./routes/recruiting-context/route";
import { meetingSearchRouter } from "./routes/search/route";
import { meetingLiveTranscriptRouter } from "./routes/live-transcript/route";
import { meetingIntelligenceRouter } from "./routes/intelligence/route";
import { meetingNotesRouter } from "./routes/notes/route";
import { meetingShareRouter } from "./routes/share/route";
import { meetingTranscriptRouter } from "./routes/transcript/route";
import { meetingTranscriptionPolicyRouter } from "./routes/transcription-policy/route";

export const meetingsRouter = factory
  .createApp()
  .route("/live-transcript", meetingLiveTranscriptRouter)
  .route("/transcription-policy", meetingTranscriptionPolicyRouter)
  .route("/search", meetingSearchRouter)
  .get("/", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const records = await listSavedMeetings({
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    return c.json({ records }, 200);
  })
  .post(
    "/",
    zValidator("json", createSmallSavedMeetingSchema, jsonValidatorError("保存清单无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const result = await createSmallSavedMeeting({
        input: c.req.valid("json"),
        organizationId: activeOrg.id,
        ownerId: user.id,
      });
      if ("conflict" in result) {
        return c.json({ error: result.message }, 409);
      }
      return c.json(
        {
          meetingId: result.meetingId,
          recoveryCopyDeleteAfter: result.recoveryCopyDeleteAfter,
          state: result.state,
          uploads: result.uploads,
        },
        result.created ? 201 : 200,
      );
    },
  )
  .post(
    "/multipart",
    zValidator("json", createMultipartSavedMeetingSchema, jsonValidatorError("保存清单无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const result = await createMultipartSavedMeeting({
        input: c.req.valid("json"),
        organizationId: activeOrg.id,
        ownerId: user.id,
      });
      if ("conflict" in result) {
        return c.json({ error: result.message }, 409);
      }
      return c.json(
        {
          meetingId: result.meetingId,
          recoveryCopyDeleteAfter: result.recoveryCopyDeleteAfter,
          state: result.state,
          uploads: result.uploads,
        },
        result.created ? 201 : 200,
      );
    },
  )
  .post(
    "/:id/complete",
    zValidator("json", completeSmallSavedMeetingSchema, jsonValidatorError("完成请求无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const result = await completeSmallSavedMeeting({
        manifestSha256: c.req.valid("json").manifestSha256,
        meetingId: c.req.param("id"),
        organizationId: activeOrg.id,
        ownerId: user.id,
      });
      if ("error" in result) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json(
        {
          meetingId: result.meetingId,
          recoveryCopyDeleteAfter: result.recoveryCopyDeleteAfter,
          state: result.state,
        },
        200,
      );
    },
  )
  .route("/:id/playback", meetingPlaybackRouter)
  .route("/:id/exports", meetingExportsRouter)
  .route("/:id/questions", meetingQuestionsRouter)
  .route("/:id/intelligence", meetingIntelligenceRouter)
  .route("/:id/recruiting-context", meetingRecruitingContextRouter)
  .route("/:id/notes", meetingNotesRouter)
  .route("/:id/share", meetingShareRouter)
  .route("/:id/transcript", meetingTranscriptRouter)
  .get("/:id", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const result = await getSavedMeetingDetail({
      meetingId: c.req.param("id"),
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (!result) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    return c.json(result, 200);
  });
