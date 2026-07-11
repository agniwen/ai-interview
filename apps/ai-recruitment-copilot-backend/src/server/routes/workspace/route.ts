import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { authMiddleware } from "@arc/ai-recruitment-copilot-backend/server/middlewares/auth";
import { workspaceMiddleware } from "@arc/ai-recruitment-copilot-backend/server/middlewares/workspace";
import { chatRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/route";
import { interviewAnalysisRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/interview/routes/analysis/route";
import { resumeChatRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/routes/chat/route";
import { studioRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/route";

// URL slug is the sole tenant selector for workspace business requests. The
// resolved organization/member values live only in this Hono request context.
export const workspaceRouter = factory
  .createApp()
  .use("*", authMiddleware, workspaceMiddleware)
  .route("/studio", studioRouter)
  .route("/chat", chatRouter)
  .route("/interview", interviewAnalysisRouter)
  .route("/resume/chat", resumeChatRouter);
