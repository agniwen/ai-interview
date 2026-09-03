import { factory } from "../../../../factory";
import { createHumanInterviewReviewActionsRouter } from "../../../studio/routes/interviews/review-actions-route";
import { resolveHumanInterviewMeetingInterviewerInviteToken } from "../../../studio/routes/interviews/dao/human-interview-meetings";

export const humanInterviewReviewRouter = factory.createApp().route(
  "/human-interview-meetings/interviewer",
  createHumanInterviewReviewActionsRouter((c) =>
    resolveHumanInterviewMeetingInterviewerInviteToken(c.req.param("inviteToken") ?? ""),
  ),
);
