import { describe, expect, it } from "vitest";
import { buildCandidateInterviewView } from "../interview/interview-record";
import type { InterviewScheduleEntry } from "../interview/interview-record";

describe("candidate interview feedback view", () => {
  it("returns the immutable feedback stored on the selected AI interview round", () => {
    const round: InterviewScheduleEntry = {
      allowTextInput: false,
      candidateFeedbackCategories: ["audio", "network"],
      candidateFeedbackDetail: "面试过程中声音断断续续，并且发生过一次网络重连。",
      candidateFeedbackSubmittedAt: new Date("2026-08-03T08:00:00.000Z"),
      conversationId: "conversation_1",
      createdAt: new Date("2026-08-03T07:00:00.000Z"),
      disconnectedAt: null,
      id: "round_1",
      interviewRecordId: "candidate_1",
      liveKitParticipantIdentity: null,
      liveKitRoomName: null,
      notes: null,
      roundLabel: "第一轮",
      scheduledAt: null,
      scheduledEndAt: null,
      sessionStartedAt: null,
      sortOrder: 0,
      status: "completed",
      updatedAt: new Date("2026-08-03T08:00:00.000Z"),
    };

    const view = buildCandidateInterviewView(
      {
        candidateName: "候选人",
        id: "candidate_1",
        interviewQuestions: [],
        resumeProfile: null,
        resumeReview: null,
        targetRole: "前端工程师",
      },
      [round],
      round.id,
    );

    expect(view.currentRoundFeedback).toEqual({
      categories: ["audio", "network"],
      detail: "面试过程中声音断断续续，并且发生过一次网络重连。",
      submittedAt: "2026-08-03T08:00:00.000Z",
    });
  });
});
