import { factory } from "@/server/factory";
import { authMiddleware } from "@/server/middlewares/auth";
import { attachmentsRouter } from "./routes/attachments/route";
import { conversationsRouter } from "./routes/conversations/route";
import { uploadsRouter } from "./routes/uploads/route";

// 三个子路由都需要登录会话；auth 在最近的公共祖先（即此聚合层）下沉。
// All three sub-routers need an authenticated session; the auth middleware
// lives at their closest common ancestor (this aggregator).
export const chatRouter = factory
  .createApp()
  .use("*", authMiddleware)
  .route("/conversations", conversationsRouter)
  .route("/uploads", uploadsRouter)
  .route("/attachments", attachmentsRouter);
