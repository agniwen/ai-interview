import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";
import { InterviewRecordSelector } from "./interview-record-selector";

it("counts current and historical completed sessions together", () => {
  const reports: StudioPersonDetailViewModel["resultReports"] = [
    "completed",
    "done",
    "failed",
    "in_progress",
  ].map((status, index) => ({
    agentId: null,
    agentTurnCount: 0,
    callSuccessful: null,
    conversationId: `session-${index}`,
    createdAt: "2026-09-15T12:00:00Z",
    dataCollectionResults: {},
    dynamicVariables: {},
    endedAt: null,
    evaluationCriteriaResults: {},
    interviewRecordId: null,
    keyInformation: null,
    lastSyncedAt: "2026-09-15T12:00:00Z",
    latestError: null,
    metadata: {},
    metrics: {},
    mode: null,
    recordingDurationSecs: null,
    recordingStatus: null,
    startedAt: null,
    status,
    transcriptSummary: null,
    turnCount: 0,
    turns: [],
    updatedAt: "2026-09-15T12:00:00Z",
    userTurnCount: 0,
    webhookReceivedAt: null,
  }));
  const html = renderToStaticMarkup(
    <InterviewRecordSelector
      onSelectedReportChange={() => {}}
      reports={reports}
      value="session-0"
    />,
  );
  expect(html).toContain("已完成 2");
  expect(html).toContain("失败 1");
});
