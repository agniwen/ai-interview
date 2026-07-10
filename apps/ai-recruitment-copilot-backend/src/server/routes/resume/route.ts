import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { authMiddleware } from "@arc/ai-recruitment-copilot-backend/server/middlewares/auth";
import { modelsRouter } from "./routes/models/route";
import { titleRouter } from "./routes/title/route";

// 两个非工作区子路由都要登录会话；工作区聊天由 /w/:slug 聚合层挂载。
// Both non-workspace sub-routers require a session; workspace chat is mounted
// under the /w/:slug aggregator.
export const resumeRouter = factory
  .createApp()
  .use("*", authMiddleware)
  .route("/models", modelsRouter)
  .route("/title", titleRouter);
