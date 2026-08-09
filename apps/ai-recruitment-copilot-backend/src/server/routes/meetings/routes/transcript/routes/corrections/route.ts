import { zValidator } from "@hono/zod-validator";
import { bodyLimit } from "hono/body-limit";
import { createMeetingTranscriptCorrectionSchema } from "@arc/shared/meeting-transcription";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { correctSavedMeetingTranscript } from "../../../../transcription/service";

export const meetingTranscriptCorrectionsRouter = factory.createApp().post(
  "/",
  bodyLimit({
    maxSize: 8 * 1024 * 1024,
    onError: (c) => c.json({ error: "会议转录修订请求过大" }, 413),
  }),
  zValidator(
    "json",
    createMeetingTranscriptCorrectionSchema,
    jsonValidatorError("会议转录修订无效"),
  ),
  async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await correctSavedMeetingTranscript({
      correction: c.req.valid("json"),
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (result === null) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    if (result === "forbidden") {
      return c.json({ error: "无权修正会议转录" }, 403);
    }
    if (result === "conflict") {
      return c.json({ error: "会议转录已被其他人更新，请刷新后重试" }, 409);
    }
    if (result === "invalid-range") {
      return c.json({ error: "转录时间超出可播放录音范围" }, 400);
    }
    if (result === "not-ready") {
      return c.json({ error: "Final Meeting Transcript 尚未就绪" }, 409);
    }
    return c.json(result, 201);
  },
);
