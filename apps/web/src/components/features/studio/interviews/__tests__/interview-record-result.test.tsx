import type { StudioAiInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InterviewRecordResultCell } from "../interview-record-cells";

function aiRecord(
  reviewOutcome: StudioAiInterviewRecordListRecord["reviewOutcome"],
  aiRecommendation: StudioAiInterviewRecordListRecord["aiRecommendation"],
  hasReport = true,
): StudioAiInterviewRecordListRecord {
  return {
    aiRecommendation,
    allowTextInput: false,
    candidateAvatarVersion: null,
    candidateEmail: null,
    candidateId: "candidate",
    candidateInviteExpiresAt: null,
    candidateName: "测试候选人",
    candidatePhone: null,
    conversationId: null,
    createdAt: "2026-10-26T00:00:00Z",
    createdBy: null,
    creatorImage: null,
    creatorName: null,
    creatorOrganizationName: null,
    feishuDocumentUrl: null,
    feishuEvaluationDocumentStatus: "unavailable",
    hasReport,
    hasResumeFile: false,
    id: "round",
    interviewLink: "/interview",
    interviewerAgentName: null,
    jobDescriptionDepartmentName: null,
    jobDescriptionId: null,
    jobDescriptionName: null,
    kind: "ai",
    lastInterviewAt: null,
    lastInterviewEndedAt: null,
    outcome: "in_pipeline",
    pipelineStage: "screening",
    resumeFileName: null,
    reviewOutcome,
    roundLabel: "AI 初面",
    scheduledAt: null,
    scheduledEndAt: null,
    sortOrder: 0,
    status: "completed",
    targetRole: null,
    updatedAt: "2026-10-26T00:00:00Z",
  };
}

describe("AI interview result attribution", () => {
  it.each([
    ["建议进入下一轮", ">通过<"],
    ["待定", ">待定<"],
    ["不建议进入下一轮", ">不通过<"],
  ] as const)("shows AI recommendation %s as an AI-sourced result", (recommendation, label) => {
    const markup = renderToStaticMarkup(
      <InterviewRecordResultCell record={aiRecord(null, recommendation)} />,
    );
    expect(markup).toContain(label);
    expect(markup).toContain("AI 建议");
  });

  it("prefers the manual review over the AI recommendation and attributes it to a person", () => {
    const markup = renderToStaticMarkup(
      <InterviewRecordResultCell record={aiRecord("pass", "不建议进入下一轮")} />,
    );
    expect(markup).toContain(">通过<");
    expect(markup).toContain("人工结论");
    expect(markup).not.toContain("AI 建议");
  });

  it.each([true, false])("does not infer a result from report existence (%s)", (hasReport) => {
    expect(
      renderToStaticMarkup(<InterviewRecordResultCell record={aiRecord(null, null, hasReport)} />),
    ).toContain(">未评价<");
  });
});
