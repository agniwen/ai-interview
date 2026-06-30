import { Mastra } from "@mastra/core";
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
  scorers: recruitmentScorers,
  storage,
  workflows: recruitmentWorkflows,
});
