import { factory } from "../../../../../../factory";
import {
  getSavedMeetingTranscriptHistory,
  getSavedMeetingTranscriptRevision,
} from "../../../../transcription/service";

export const meetingTranscriptRevisionsRouter = factory
  .createApp()
  .get("/", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await getSavedMeetingTranscriptHistory({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    return result ? c.json(result, 200) : c.json({ error: "Meeting Session 不存在" }, 404);
  })
  .get("/:revisionId", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await getSavedMeetingTranscriptRevision({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      revisionId: c.req.param("revisionId"),
      userId: user.id,
    });
    return result ? c.json(result, 200) : c.json({ error: "会议转录 revision 不存在" }, 404);
  });
