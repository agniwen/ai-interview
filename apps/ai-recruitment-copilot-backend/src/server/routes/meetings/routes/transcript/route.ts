import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  getSavedMeetingTranscript,
  retrySavedMeetingTranscription,
} from "../../transcription/service";
import { meetingTranscriptCorrectionsRouter } from "./routes/corrections/route";
import { meetingTranscriptRevisionsRouter } from "./routes/revisions/route";

export const meetingTranscriptRouter = factory
  .createApp()
  .route("/corrections", meetingTranscriptCorrectionsRouter)
  .route("/revisions", meetingTranscriptRevisionsRouter)
  .get("/", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await getSavedMeetingTranscript({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    return result ? c.json(result, 200) : c.json({ error: "Meeting Session 不存在" }, 404);
  })
  .post("/retry", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await retrySavedMeetingTranscription({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (result === null) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    if (result === "forbidden") {
      return c.json({ error: "无权重试最终转录" }, 403);
    }
    if (result.state === "unavailable") {
      return c.json({ error: "最终转录 provider 或队列暂不可用" }, 503);
    }
    return c.json(result, result.state === "processing" ? 202 : 200);
  });
