import type { StudioAiInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InterviewRecordResultCell } from "../interview-record-cells";

function aiRecord(
  reviewOutcome: StudioAiInterviewRecordListRecord["reviewOutcome"],
  hasReport: boolean,
): StudioAiInterviewRecordListRecord {
  return {
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
  it.each([true, false])(
    "shows the round review independently of report existence (%s)",
    (hasReport) => {
      expect(
        renderToStaticMarkup(<InterviewRecordResultCell record={aiRecord("pass", hasReport)} />),
      ).toContain(">通过<");
      expect(
        renderToStaticMarkup(<InterviewRecordResultCell record={aiRecord("fail", hasReport)} />),
      ).toContain(">未通过<");
    },
  );

  it.each([true, false])("does not infer a review from report existence (%s)", (hasReport) => {
    expect(
      renderToStaticMarkup(<InterviewRecordResultCell record={aiRecord(null, hasReport)} />),
    ).toContain(">未评价<");
  });
});
