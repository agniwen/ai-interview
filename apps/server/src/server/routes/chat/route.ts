import { factory } from "../../factory";
import { attachmentsRouter } from "./routes/attachments/route";
import { conversationsRouter } from "./routes/conversations/route";
import { uploadsRouter } from "./routes/uploads/route";

// 鉴权与工作区解析统一在 /w/:slug 聚合层完成。
// Authentication and workspace resolution live at the /w/:slug aggregator.
export const chatRouter = factory
  .createApp()
  .route("/conversations", conversationsRouter)
  .route("/uploads", uploadsRouter)
  .route("/attachments", attachmentsRouter);
