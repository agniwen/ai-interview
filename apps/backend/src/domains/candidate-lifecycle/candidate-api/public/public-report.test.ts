/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- The focused regression test deliberately constructs a malformed legacy report to verify defensive parsing. */
import { describe, expect, it } from "vitest";
import { buildPublicConversationReport } from "./public-report.js";

describe("buildPublicConversationReport", () => {
  it("hydrates fallback turns from webhook transcript", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");
    const conversation = {
      agentId: "agent",
      callSuccessful: "success",
      conversationId: "conversation",
      createdAt: now,
      dataCollectionResults: null,
      dynamicVariables: null,
      endedAt: now,
      evaluationCriteriaResults: null,
      interviewRecordId: "candidate",
      lastSyncedAt: now,
      latestError: null,
      metadata: null,
      metrics: null,
      mode: "ai",
      organizationId: "organization",
      recordingDurationSecs: null,
      recordingStatus: null,
      scheduleEntryId: "round",
      startedAt: now,
      status: "done",
      transcript: [
        { message: "question", role: "agent", timeInCallSecs: 1 },
        { message: "answer", role: "user", timeInCallSecs: 2 },
      ],
      transcriptSummary: null,
      updatedAt: now,
      webhookReceivedAt: now,
    } as unknown as Parameters<typeof buildPublicConversationReport>[0];

    const report = buildPublicConversationReport(conversation, []);

    expect(report.turns.map((turn) => turn.id)).toEqual([
      "conversation:webhook:0",
      "conversation:webhook:1",
    ]);
    expect(report).toMatchObject({ agentTurnCount: 1, turnCount: 2, userTurnCount: 1 });
  });
});
