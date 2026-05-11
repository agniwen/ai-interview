import { factory } from "@/server/factory";
import { authMiddleware } from "@/server/middlewares/auth";
import { workspaceMiddleware } from "@/server/middlewares/workspace";
import { attachmentsRouter } from "./routes/attachments/route";
import { conversationsRouter } from "./routes/conversations/route";
import { uploadsRouter } from "./routes/uploads/route";

// 三个子路由都需要登录会话和活跃 workspace；auth + workspaceMiddleware 在最近的公共祖先下沉。
// All three sub-routers require an authenticated session and an active workspace;
// both middlewares are mounted at their closest common ancestor (this aggregator).
export const chatRouter = factory
  .createApp()
  .use("*", authMiddleware, workspaceMiddleware)
  .route("/conversations", conversationsRouter)
  .route("/uploads", uploadsRouter)
  .route("/attachments", attachmentsRouter);
