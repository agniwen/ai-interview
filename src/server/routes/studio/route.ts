import { factory } from "@/server/factory";
import { adminMiddleware } from "@/server/middlewares/admin";
import { authMiddleware } from "@/server/middlewares/auth";
import { workspaceMiddleware } from "@/server/middlewares/workspace";
import { departmentsRouter } from "./routes/departments/route";
import { candidateFormsRouter } from "./routes/forms/route";
import { globalConfigRouter } from "./routes/global-config/route";
import { interviewQuestionTemplatesRouter } from "./routes/interview-questions/route";
import { interviewersRouter } from "./routes/interviewers/route";
import { studioInterviewsRouter } from "./routes/interviews/route";
import { jobDescriptionsRouter } from "./routes/job-descriptions/route";

// 中文：所有 /studio/* 子路由统一在此挂载，并注入 auth + admin 中间件，
// 不要在 app.ts 里再为各 /studio/<sub> 重复声明中间件。
// English: All /studio/* sub-routes mount here, sharing auth + admin
// middleware. Do NOT add per-/studio/<sub> .use(...) calls in app.ts.
export const studioRouter = factory
  .createApp()
  .use("*", authMiddleware, adminMiddleware, workspaceMiddleware)
  .route("/interviews", studioInterviewsRouter)
  .route("/departments", departmentsRouter)
  .route("/global-config", globalConfigRouter)
  .route("/interviewers", interviewersRouter)
  .route("/job-descriptions", jobDescriptionsRouter)
  .route("/forms", candidateFormsRouter)
  .route("/interview-questions", interviewQuestionTemplatesRouter);
