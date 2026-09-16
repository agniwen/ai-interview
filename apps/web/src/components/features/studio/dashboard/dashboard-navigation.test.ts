import { describe, expect, it } from "vitest";
import { getDashboardJobSearch, getDashboardResumeSearch } from "./dashboard-navigation";

describe("dashboard recruitment desk navigation", () => {
  it("maps summary cards to exact recruitment scopes", () => {
    expect(getDashboardResumeSearch("progressing")).toMatchObject({
      outcomes: "in_pipeline",
      page: 1,
    });
    expect(getDashboardResumeSearch("offer_onboarding")).toMatchObject({
      outcomes: "in_pipeline",
      pipelineStages: "income_proof,salary_negotiation,offer,background_check,onboarding",
    });
    expect(getDashboardResumeSearch("hired")).toMatchObject({
      boardPreset: "closed",
      outcomes: "hired",
      stage: "closed:hired",
    });
    expect(getDashboardResumeSearch("negative_closed")).toMatchObject({
      boardPreset: "closed",
      outcomes: "rejected,withdrawn",
      stage: "closed:all",
    });
  });

  it("maps action items to their recruitment stage", () => {
    expect(getDashboardResumeSearch("screening")).toMatchObject({
      boardPreset: "screening",
      dashboardAction: "screening",
      stage: "screening:pending",
    });
    expect(getDashboardResumeSearch("ai_pending")).toMatchObject({
      boardPreset: "interview",
      dashboardAction: "ai_pending",
      stage: "interview:ai",
    });
    expect(getDashboardResumeSearch("ai_interrupted")).toMatchObject({
      boardPreset: "interview",
      dashboardAction: "ai_interrupted",
      stage: "interview:ai",
    });
    expect(getDashboardResumeSearch("human_pending")).toMatchObject({
      boardPreset: "interview",
      dashboardAction: "human_pending",
      stage: "interview:all",
    });
    expect(getDashboardResumeSearch("offer_sent")).toMatchObject({
      boardPreset: "offer",
      dashboardAction: "offer_sent",
      stage: "offer:send",
    });
  });

  it("links a vacancy alert to the affected job", () => {
    expect(getDashboardJobSearch("job-description-1")).toEqual({
      jobDescriptionId: "job-description-1",
    });
  });
});
