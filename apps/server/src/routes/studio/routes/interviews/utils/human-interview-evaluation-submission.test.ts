import { describe, expect, it, vi } from "vitest";
import { submitAndFinalizeHumanInterviewEvaluation } from "./human-interview-evaluation-submission";

const evaluation = {
  detailedAnalysis: "完整分析",
  evidenceTurnIds: [],
  overallEvaluation: "整体评价",
  professionalSkill: "优",
  rating: "A" as const,
  risks: "风险",
  rolePosition: "负责人",
  salaryRecommendation: "",
  seniorityPosition: "高级",
  strengths: "优势",
};

describe("submitAndFinalizeHumanInterviewEvaluation", () => {
  it("ends the meeting and stops its recording after submission completes the round", async () => {
    const stopRecording = vi.fn(() => Promise.resolve());
    const deleteRoom = vi.fn(() => Promise.resolve());
    const dependencies = {
      deleteRoom,
      endMeetingsByRound: vi.fn(() => Promise.resolve(["human_room_1"])),
      stopRecording,
      submitEvaluation: vi.fn(() => Promise.resolve(true)),
    };

    await expect(
      submitAndFinalizeHumanInterviewEvaluation(
        {
          actorId: "user-1",
          evaluation,
          meetingSessionId: "meeting-session-1",
          organizationId: "org-1",
          outcome: "pass",
          roundId: "round-1",
          transcriptRevisionId: "transcript-revision-1",
        },
        dependencies,
      ),
    ).resolves.toBe(true);

    expect(dependencies.endMeetingsByRound).toHaveBeenCalledWith({
      organizationId: "org-1",
      roundId: "round-1",
    });
    expect(stopRecording).toHaveBeenCalledWith("human_room_1");
    expect(deleteRoom).toHaveBeenCalledWith("human_room_1");
    expect(dependencies.submitEvaluation).toHaveBeenCalledWith({
      actorId: "user-1",
      evaluation,
      meetingSessionId: "meeting-session-1",
      organizationId: "org-1",
      outcome: "pass",
      roundId: "round-1",
      transcriptRevisionId: "transcript-revision-1",
    });
  });
});
