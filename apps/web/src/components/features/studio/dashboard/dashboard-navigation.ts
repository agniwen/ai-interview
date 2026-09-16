import type { SearchParamsRecord } from "@/lib/client/data-grid-search";

export type DashboardResumeScope =
  | "progressing"
  | "offer_onboarding"
  | "hired"
  | "negative_closed"
  | "screening"
  | "ai_pending"
  | "ai_interrupted"
  | "human_pending"
  | "offer_sent"
  | "notification_failed";

const OFFER_ONBOARDING_STAGES = [
  "income_proof",
  "salary_negotiation",
  "offer",
  "background_check",
  "onboarding",
].join(",");

export function getDashboardJobSearch(jobDescriptionId: string): SearchParamsRecord {
  return { jobDescriptionId };
}

export function getDashboardResumeSearch(scope: DashboardResumeScope | string): SearchParamsRecord {
  switch (scope) {
    case "progressing": {
      return { outcomes: "in_pipeline", page: 1 };
    }
    case "offer_onboarding": {
      return { outcomes: "in_pipeline", page: 1, pipelineStages: OFFER_ONBOARDING_STAGES };
    }
    case "hired": {
      return { boardPreset: "closed", outcomes: "hired", page: 1, stage: "closed:hired" };
    }
    case "negative_closed": {
      return {
        boardPreset: "closed",
        outcomes: "rejected,withdrawn",
        page: 1,
        stage: "closed:all",
      };
    }
    case "screening": {
      return {
        boardPreset: "screening",
        dashboardAction: "screening",
        page: 1,
        stage: "screening:pending",
      };
    }
    case "ai_pending": {
      return {
        boardPreset: "interview",
        dashboardAction: "ai_pending",
        page: 1,
        stage: "interview:ai",
      };
    }
    case "ai_interrupted": {
      return {
        boardPreset: "interview",
        dashboardAction: "ai_interrupted",
        page: 1,
        stage: "interview:ai",
      };
    }
    case "human_pending": {
      return {
        boardPreset: "interview",
        dashboardAction: "human_pending",
        page: 1,
        stage: "interview:all",
      };
    }
    case "offer_sent": {
      return {
        boardPreset: "offer",
        dashboardAction: "offer_sent",
        page: 1,
        stage: "offer:send",
      };
    }
    case "notification_failed": {
      return { page: 1 };
    }
    default: {
      return { page: 1 };
    }
  }
}
