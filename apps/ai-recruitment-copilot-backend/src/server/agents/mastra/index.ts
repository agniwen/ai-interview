import { Mastra } from "@mastra/core";
import { MastraEditor } from "@mastra/editor";
import { MastraStorageExporter, Observability, SensitiveDataFilter } from "@mastra/observability";
import {
  formQuestionAgent,
  interviewQuestionAgent,
  interviewReportEvaluationAgent,
  interviewReportSummaryAgent,
  jobDescriptionDraftAgent,
  jobDescriptionMatchAgent,
  resumeEducationBackfillAgent,
  resumeHardFilterAgent,
  resumeReviewQualitativeAgent,
  resumeReviewScoringAgent,
  resumeStructuredAgent,
  titleAgent,
} from "./agents/simple-generators";
import { configureAlibabaCodingPlanApiKey } from "./models";
import { recruitmentScorers } from "./scorers";
import { storage } from "./storage";
import { recruitmentWorkflows } from "./workflows";

configureAlibabaCodingPlanApiKey();

export const recruitmentAgents = {
  formQuestionAgent,
  interviewQuestionAgent,
  interviewReportEvaluationAgent,
  interviewReportSummaryAgent,
  jobDescriptionDraftAgent,
  jobDescriptionMatchAgent,
  resumeEducationBackfillAgent,
  resumeHardFilterAgent,
  resumeReviewQualitativeAgent,
  resumeReviewScoringAgent,
  resumeStructuredAgent,
  titleAgent,
};

export const mastra = new Mastra({
  agents: recruitmentAgents,
  editor: new MastraEditor({ source: "db" }),
  observability: new Observability({
    configs: {
      default: {
        exporters: [new MastraStorageExporter()],
        logging: {
          enabled: true,
          level: "info",
        },
        serviceName: "arc-ai-recruitment-copilot",
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
  scorers: recruitmentScorers,
  storage,
  workflows: recruitmentWorkflows,
});
