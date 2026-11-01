import { factory } from "../../factory";
import { authMiddleware } from "../../middlewares/auth";
import { workspaceMiddleware } from "../../middlewares/workspace";
import { chatRouter } from "../chat/route";
import { interviewAnalysisRouter } from "../interview/routes/analysis/route";
import { meetingsRouter } from "../meetings/route";
import { resumeChatRouter } from "../resume/routes/chat/route";
import { studioRouter } from "../studio/route";

// URL slug is the sole tenant selector for workspace business requests. The
// resolved organization/member values live only in this Hono request context.
export const workspaceRouter = factory
  .createApp()
  .use("*", authMiddleware, workspaceMiddleware)
  .route("/studio", studioRouter)
  .route("/chat", chatRouter)
  .route("/interview", interviewAnalysisRouter)
  .route("/meetings", meetingsRouter)
  .route("/resume/chat", resumeChatRouter);
