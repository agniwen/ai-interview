import { factory } from "../../factory";
import { departmentsRouter } from "./routes/departments/route";
import { studioCalendarRouter } from "./routes/calendar/route";
import { candidateFormsRouter } from "./routes/forms/route";
import { globalConfigRouter } from "./routes/global-config/route";
import { interviewQuestionTemplatesRouter } from "./routes/interview-questions/route";
import { interviewersRouter } from "./routes/interviewers/route";
import { studioInterviewsRouter } from "./routes/interviews/route";
import { jobDescriptionsRouter } from "./routes/job-descriptions/route";
import { mailIngestRouter } from "./routes/mail-ingest/route";
import { resumePoolRouter } from "./routes/resume-pool/route";
import { resumeUploadBatchesRouter } from "./routes/resume-upload-batches/route";
import { resumeLibraryRouter } from "./routes/resumes/route";
import { workspaceRouter } from "./routes/workspace/route";

// 所有 /studio/* 子路由统一在此挂载；鉴权与工作区解析由 /w/:slug 聚合层完成。
// All /studio/* sub-routes mount here; the /w/:slug aggregator owns auth and scope.
export const studioRouter = factory
  .createApp()
  .route("/calendar", studioCalendarRouter)
  .route("/interviews", studioInterviewsRouter)
  .route("/resume-pool", resumePoolRouter)
  .route("/resumes", resumeLibraryRouter)
  .route("/resume-upload-batches", resumeUploadBatchesRouter)
  .route("/departments", departmentsRouter)
  .route("/global-config", globalConfigRouter)
  .route("/interviewers", interviewersRouter)
  .route("/job-descriptions", jobDescriptionsRouter)
  .route("/mail-ingest-accounts", mailIngestRouter)
  .route("/forms", candidateFormsRouter)
  .route("/interview-questions", interviewQuestionTemplatesRouter)
  .route("/workspace", workspaceRouter);
