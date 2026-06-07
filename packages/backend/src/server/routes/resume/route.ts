import { factory } from "@arc/backend/server/factory";
import { authMiddleware } from "@arc/backend/server/middlewares/auth";
import { resumeChatRouter } from "./routes/chat/route";
import { modelsRouter } from "./routes/models/route";
import { titleRouter } from "./routes/title/route";

// 三个子路由都要登录会话；auth 在最近的公共祖先（即此聚合层）下沉。
// All three sub-routers require an authenticated session; auth is mounted at
// the closest common ancestor (this aggregator).
export const resumeRouter = factory
  .createApp()
  .use("*", authMiddleware)
  .route("/models", modelsRouter)
  .route("/chat", resumeChatRouter)
  .route("/title", titleRouter);
