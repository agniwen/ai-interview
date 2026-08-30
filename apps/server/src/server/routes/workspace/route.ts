import { factory } from "@app/server/server/factory";
import { authMiddleware } from "@app/server/server/middlewares/auth";
import { workspaceMiddleware } from "@app/server/server/middlewares/workspace";
import { chatRouter } from "@app/server/server/routes/chat/route";
import { interviewAnalysisRouter } from "@app/server/server/routes/interview/routes/analysis/route";
import { meetingsRouter } from "@app/server/server/routes/meetings/route";
import { resumeChatRouter } from "@app/server/server/routes/resume/routes/chat/route";
import { studioRouter } from "@app/server/server/routes/studio/route";

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
