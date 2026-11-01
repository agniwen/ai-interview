import { bulkResumeUploadWorkflow } from "./bulk-resume-upload-workflow";
import { interviewQuestionsWorkflow } from "@app/resume-processing/ingest/agents/mastra/workflows/interview-questions-workflow";
import { interviewReportWorkflow } from "@app/recruiting-workflows/ai-interview-reports/interview-report-workflow";
import { resumeAnalysisWorkflow } from "@app/resume-processing/ingest/agents/mastra/workflows/resume-analysis-workflow";
import { resumeParseWorkflow } from "@app/resume-processing/ingest/agents/mastra/workflows/resume-parse-workflow";
import { resumeReviewWorkflow } from "@app/resume-processing/ingest/agents/mastra/workflows/resume-review-workflow";
import { structuredResumeReviewWorkflow } from "@app/resume-processing/ingest/agents/mastra/workflows/structured-resume-review-workflow";

export const recruitmentWorkflows = {
  bulkResumeUploadWorkflow,
  interviewQuestionsWorkflow,
  interviewReportWorkflow,
  resumeAnalysisWorkflow,
  resumeParseWorkflow,
  resumeReviewWorkflow,
  structuredResumeReviewWorkflow,
};
